// Package metricstore turns the raw probe samples in the meta database into
// chart-ready time series: it buckets samples to a requested resolution,
// converts cumulative pg_stat_* counters into per-second rates (respecting
// stats_reset windows and clamping negative deltas as discontinuities), and
// computes an optional period-over-period trend delta.
//
// The series registry below is the source of truth for what is queryable; the
// v1alpha1.MetricId enum mirrors it. Each series declares its Kind
// (gauge / counter-rate / ratio) — the property that decides the entire
// read-side treatment — its Scope, its display Unit, its native probe cadence,
// and how to extract its raw observations from a SampleReader.
package metricstore

import (
	"context"
	"fmt"
	"time"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// Kind classifies a series' read-side treatment.
type Kind int

const (
	// KindGauge is a point-in-time reading; buckets average the raw values.
	KindGauge Kind = iota
	// KindCounterRate is a per-second rate derived from a cumulative counter's
	// delta across each bucket.
	KindCounterRate
	// KindRatio is a bounded [0,1] ratio derived from two counter deltas.
	KindRatio
)

// Scope is the resource level a series is collected at.
type Scope int

const (
	// ScopeInstance series are keyed by instance only.
	ScopeInstance Scope = iota
	// ScopeDatabase series are keyed by (instance, database).
	ScopeDatabase
)

// rawSample is one probe observation, normalized for the reduction step.
// Primary is the value (for a counter: its cumulative reading). Secondary is
// the second counter of a ratio (e.g. blocks_read for cache-hit). Reset is the
// pg_stat_* stats_reset marker; observations across different Reset values do
// not form a valid rate interval.
type rawSample struct {
	At        time.Time
	Reset     *time.Time
	Primary   float64
	Secondary float64
}

// extractFunc loads a series' raw observations for one target over a window.
type extractFunc func(ctx context.Context, r SampleReader, instanceID, databaseName string, since, until time.Time) ([]rawSample, error)

// SeriesDef is the registry entry for one metric.
type SeriesDef struct {
	ID        v1alpha1.MetricId
	Kind      Kind
	Scope     Scope
	Unit      v1alpha1.MetricUnit
	ProbeStep time.Duration // native collection cadence; the step floor
	extract   extractFunc
}

// UnknownMetricError is returned when a requested metric has no registry entry
// (including the zero MetricId). It is a client error.
type UnknownMetricError struct{ ID v1alpha1.MetricId }

func (e UnknownMetricError) Error() string {
	return fmt.Sprintf("unknown metric: %s", e.ID)
}

// Probe cadences mirror backend/cmd/server/database.go. They are the step floor
// for each series (querying finer than the cadence only yields empty buckets).
const (
	connectionsCadence = 30 * time.Second
	cacheCadence       = time.Minute
	ioCadence          = time.Minute
	storageCadence     = 5 * time.Minute
	vacuumCadence      = 5 * time.Minute
)

// registry maps each MetricId to its definition. Keep this in sync with the
// MetricId enum in metrics.proto (a guard test asserts full coverage).
var registry = buildRegistry()

func buildRegistry() map[v1alpha1.MetricId]SeriesDef {
	defs := []SeriesDef{
		// -- Instance-scoped connection gauges (pg_stat_activity) -----------
		connectionGauge(v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE, func(row connectionRow) float64 { return float64(row.Active) }),
		connectionGauge(v1alpha1.MetricId_METRIC_ID_CONNECTIONS_IDLE, func(row connectionRow) float64 { return float64(row.Idle) }),
		connectionGauge(v1alpha1.MetricId_METRIC_ID_CONNECTIONS_TOTAL, func(row connectionRow) float64 { return float64(row.Total) }),
		connectionGauge(v1alpha1.MetricId_METRIC_ID_CONNECTIONS_MAX, func(row connectionRow) float64 { return float64(row.MaxConn) }),

		// -- Instance-scoped cache counters (pg_stat_database) --------------
		{
			ID: v1alpha1.MetricId_METRIC_ID_TRANSACTIONS_PER_SECOND, Kind: KindCounterRate, Scope: ScopeInstance,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_PER_SECOND, ProbeStep: cacheCadence,
			extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.CacheSamples(ctx, inst, since, until)

				return mapCounter(rows, err, func(row cacheRow) (time.Time, float64, float64, *time.Time) {
					return row.ObservedAt, float64(row.XactCommit + row.XactRollback), 0, row.StatsReset
				})
			}),
		},
		{
			ID: v1alpha1.MetricId_METRIC_ID_CACHE_HIT_RATIO, Kind: KindRatio, Scope: ScopeInstance,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_RATIO, ProbeStep: cacheCadence,
			extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.CacheSamples(ctx, inst, since, until)

				return mapCounter(rows, err, func(row cacheRow) (time.Time, float64, float64, *time.Time) {
					return row.ObservedAt, float64(row.BlocksHit), float64(row.BlocksRead), row.StatsReset
				})
			}),
		},

		// -- Instance-scoped storage gauge ----------------------------------
		{
			ID: v1alpha1.MetricId_METRIC_ID_STORAGE_TOTAL_BYTES, Kind: KindGauge, Scope: ScopeInstance,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_BYTES, ProbeStep: storageCadence,
			extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.StorageSamples(ctx, inst, since, until)

				return mapGauge(rows, err, func(row storageRow) (time.Time, float64) {
					return row.ObservedAt, float64(row.TotalSizeBytes)
				})
			}),
		},

		// -- Instance-scoped IO counters (pg_stat_io, PG16+) ----------------
		{
			ID: v1alpha1.MetricId_METRIC_ID_IO_READ_BYTES_PER_SECOND, Kind: KindCounterRate, Scope: ScopeInstance,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_BYTES_PER_SECOND, ProbeStep: ioCadence,
			extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.IOSamples(ctx, inst, since, until)

				return mapCounter(rows, err, func(row ioRow) (time.Time, float64, float64, *time.Time) {
					return row.ObservedAt, float64(row.ReadBytes), 0, row.StatsReset
				})
			}),
		},
		{
			ID: v1alpha1.MetricId_METRIC_ID_IO_WRITE_BYTES_PER_SECOND, Kind: KindCounterRate, Scope: ScopeInstance,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_BYTES_PER_SECOND, ProbeStep: ioCadence,
			extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.IOSamples(ctx, inst, since, until)

				return mapCounter(rows, err, func(row ioRow) (time.Time, float64, float64, *time.Time) {
					return row.ObservedAt, float64(row.WriteBytes), 0, row.StatsReset
				})
			}),
		},

		// -- Database-scoped gauges -----------------------------------------
		{
			ID: v1alpha1.MetricId_METRIC_ID_DATABASE_SIZE_BYTES, Kind: KindGauge, Scope: ScopeDatabase,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_BYTES, ProbeStep: storageCadence,
			extract: func(ctx context.Context, r SampleReader, inst, db string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.DatabaseSizeSamples(ctx, inst, db, since, until)

				return mapGauge(rows, err, func(row dbSizeRow) (time.Time, float64) {
					return row.ObservedAt, float64(row.SizeBytes)
				})
			},
		},
		{
			ID: v1alpha1.MetricId_METRIC_ID_DATABASE_LIVE_TUPLES, Kind: KindGauge, Scope: ScopeDatabase,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_COUNT, ProbeStep: vacuumCadence,
			extract: func(ctx context.Context, r SampleReader, inst, db string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.DatabaseVacuumSamples(ctx, inst, db, since, until)

				return mapGauge(rows, err, func(row vacuumRow) (time.Time, float64) {
					return row.ObservedAt, float64(row.LiveTuples)
				})
			},
		},
		{
			ID: v1alpha1.MetricId_METRIC_ID_DATABASE_DEAD_TUPLES, Kind: KindGauge, Scope: ScopeDatabase,
			Unit: v1alpha1.MetricUnit_METRIC_UNIT_COUNT, ProbeStep: vacuumCadence,
			extract: func(ctx context.Context, r SampleReader, inst, db string, since, until time.Time) ([]rawSample, error) {
				rows, err := r.DatabaseVacuumSamples(ctx, inst, db, since, until)

				return mapGauge(rows, err, func(row vacuumRow) (time.Time, float64) {
					return row.ObservedAt, float64(row.DeadTuples)
				})
			},
		},
	}

	out := make(map[v1alpha1.MetricId]SeriesDef, len(defs))
	for _, def := range defs {
		out[def.ID] = def
	}

	return out
}

// lookup returns the series definition for id, or an UnknownMetricError.
func lookup(id v1alpha1.MetricId) (SeriesDef, error) {
	def, ok := registry[id]
	if !ok {
		return SeriesDef{}, UnknownMetricError{ID: id}
	}

	return def, nil
}

// Definitions returns every registered series. Used by the coverage guard test.
func Definitions() []SeriesDef {
	out := make([]SeriesDef, 0, len(registry))
	for _, def := range registry {
		out = append(out, def)
	}

	return out
}

// connectionGauge builds an instance-scoped connection gauge from a value
// projector (they all read the same pg_stat_activity sample row).
func connectionGauge(id v1alpha1.MetricId, value func(connectionRow) float64) SeriesDef {
	return SeriesDef{
		ID: id, Kind: KindGauge, Scope: ScopeInstance,
		Unit: v1alpha1.MetricUnit_METRIC_UNIT_COUNT, ProbeStep: connectionsCadence,
		extract: instanceExtract(func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error) {
			rows, err := r.ConnectionSamples(ctx, inst, since, until)

			return mapGauge(rows, err, func(row connectionRow) (time.Time, float64) {
				return row.ObservedAt, value(row)
			})
		}),
	}
}

// instanceExtract adapts an instance-only loader to the extractFunc signature
// (dropping the unused database segment).
func instanceExtract(load func(ctx context.Context, r SampleReader, inst string, since, until time.Time) ([]rawSample, error)) extractFunc {
	return func(ctx context.Context, r SampleReader, inst, _ string, since, until time.Time) ([]rawSample, error) {
		return load(ctx, r, inst, since, until)
	}
}
