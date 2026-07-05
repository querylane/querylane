package metricstore

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

var base = time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)

func at(offset time.Duration) time.Time { return base.Add(offset) }

// fakeReader serves canned sample slices, filtered to [since, until) and
// ordered ascending like the real stores.
type fakeReader struct {
	connection []model.InstanceConnectionSample
	cache      []model.InstanceCacheSample
	io         []model.InstanceIoSample
	storage    []model.InstanceStorageSample
	dbSize     []model.DatabaseSizeSample
	vacuum     []model.DatabaseVacuumSample
	err        error
}

func inRange(t, since, until time.Time) bool {
	return !t.Before(since) && t.Before(until)
}

func (r fakeReader) ConnectionSamples(_ context.Context, _ string, since, until time.Time) ([]model.InstanceConnectionSample, error) {
	if r.err != nil {
		return nil, r.err
	}

	var out []model.InstanceConnectionSample

	for _, row := range r.connection {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, nil
}

func (r fakeReader) CacheSamples(_ context.Context, _ string, since, until time.Time) ([]model.InstanceCacheSample, error) {
	if r.err != nil {
		return nil, r.err
	}

	var out []model.InstanceCacheSample

	for _, row := range r.cache {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, nil
}

func (r fakeReader) IOSamples(_ context.Context, _ string, since, until time.Time) ([]model.InstanceIoSample, error) {
	var out []model.InstanceIoSample

	for _, row := range r.io {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, r.err
}

func (r fakeReader) StorageSamples(_ context.Context, _ string, since, until time.Time) ([]model.InstanceStorageSample, error) {
	var out []model.InstanceStorageSample

	for _, row := range r.storage {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, r.err
}

func (r fakeReader) DatabaseSizeSamples(_ context.Context, _, _ string, since, until time.Time) ([]model.DatabaseSizeSample, error) {
	var out []model.DatabaseSizeSample

	for _, row := range r.dbSize {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, r.err
}

func (r fakeReader) DatabaseVacuumSamples(_ context.Context, _, _ string, since, until time.Time) ([]model.DatabaseVacuumSample, error) {
	var out []model.DatabaseVacuumSample

	for _, row := range r.vacuum {
		if inRange(row.ObservedAt, since, until) {
			out = append(out, row)
		}
	}

	return out, r.err
}

func conn(offset time.Duration, active int64) model.InstanceConnectionSample {
	return model.InstanceConnectionSample{ObservedAt: at(offset), Active: active, Total: active, MaxConn: 100}
}

func cacheXact(offset time.Duration, xact int64, reset *time.Time) model.InstanceCacheSample {
	return model.InstanceCacheSample{ObservedAt: at(offset), XactCommit: xact, StatsReset: reset}
}

func requireValues(t *testing.T, got, want []float64) {
	t.Helper()
	require.Len(t, got, len(want))

	for i := range want {
		if math.IsNaN(want[i]) {
			assert.Truef(t, math.IsNaN(got[i]), "index %d: want NaN, got %v", i, got[i])

			continue
		}

		assert.InDeltaf(t, want[i], got[i], 1e-9, "index %d", i)
	}
}

func TestQueryGaugeBucketing(t *testing.T) {
	t.Parallel()

	reader := fakeReader{connection: []model.InstanceConnectionSample{
		conn(0, 10), conn(30*time.Second, 20), // bucket 0 -> avg 15
		conn(60*time.Second, 30), conn(90*time.Second, 40), // bucket 1 -> avg 35
		// bucket 2 [120s,180s) intentionally empty -> NaN
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(180 * time.Second), Step: time.Minute,
	})
	require.NoError(t, err)
	require.Empty(t, res.Errors)
	require.Len(t, res.Series, 1)

	series := res.Series[0]
	assert.Equal(t, KindGauge, series.Kind)
	assert.Equal(t, time.Minute, series.Step)
	requireValues(t, series.Values, []float64{15, 35, math.NaN()})
}

func TestQueryCounterRate(t *testing.T) {
	t.Parallel()

	reset := at(-time.Hour)
	// Cumulative xact, +60 per 60s => 1 tx/s. Pre-window sample seeds bucket 0.
	reader := fakeReader{cache: []model.InstanceCacheSample{
		cacheXact(-time.Minute, 940, &reset),
		cacheXact(0, 1000, &reset),
		cacheXact(time.Minute, 1060, &reset),
		cacheXact(2*time.Minute, 1180, &reset), // +120/60 => 2 tx/s
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_TRANSACTIONS_PER_SECOND},
		Start: base, End: at(3 * time.Minute), Step: time.Minute,
	})
	require.NoError(t, err)
	require.Len(t, res.Series, 1)

	assert.Equal(t, KindCounterRate, res.Series[0].Kind)
	requireValues(t, res.Series[0].Values, []float64{1, 1, 2})
}

func TestQueryCounterStatsResetAndNegativeDelta(t *testing.T) {
	t.Parallel()

	r1 := at(-2 * time.Hour)
	r2 := at(-time.Minute) // stats_reset advanced between bucket 0 and 1

	reader := fakeReader{cache: []model.InstanceCacheSample{
		cacheXact(-time.Minute, 940, &r1),
		cacheXact(0, 1000, &r1),          // bucket 0: +60/60 = 1
		cacheXact(time.Minute, 5, &r2),   // reset boundary -> bucket 1 skipped (NaN)
		cacheXact(2*time.Minute, 3, &r2), // negative delta same reset -> bucket 2 skipped (NaN)
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_TRANSACTIONS_PER_SECOND},
		Start: base, End: at(3 * time.Minute), Step: time.Minute,
	})
	require.NoError(t, err)
	requireValues(t, res.Series[0].Values, []float64{1, math.NaN(), math.NaN()})
}

func TestQueryCacheHitRatio(t *testing.T) {
	t.Parallel()

	reset := at(-time.Hour)
	// Between t0 and t0+60: hit +90, read +10 => ratio 0.9.
	reader := fakeReader{cache: []model.InstanceCacheSample{
		{ObservedAt: at(0), BlocksHit: 1000, BlocksRead: 100, StatsReset: &reset},
		{ObservedAt: at(time.Minute), BlocksHit: 1090, BlocksRead: 110, StatsReset: &reset},
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CACHE_HIT_RATIO},
		Start: base, End: at(2 * time.Minute), Step: time.Minute,
	})
	require.NoError(t, err)

	assert.Equal(t, KindRatio, res.Series[0].Kind)
	// bucket 0 has the interval ending at t0+60.
	requireValues(t, res.Series[0].Values, []float64{math.NaN(), 0.9})
}

func TestQueryTrendDelta(t *testing.T) {
	t.Parallel()

	reader := fakeReader{connection: []model.InstanceConnectionSample{
		conn(-30*time.Second, 30), // previous window last value
		conn(30*time.Second, 42),  // current window last value
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(time.Minute), Step: time.Minute, Comparison: time.Minute,
	})
	require.NoError(t, err)

	delta := res.Series[0].Delta
	require.NotNil(t, delta)
	assert.True(t, delta.PreviousAvailable)
	assert.InDelta(t, 42, delta.Current, 1e-9)
	assert.InDelta(t, 30, delta.Previous, 1e-9)
	assert.InDelta(t, 40, delta.PercentChange, 1e-9) // (42-30)/30 = +40%
}

func TestQueryTrendDeltaPreviousUnavailable(t *testing.T) {
	t.Parallel()

	reader := fakeReader{connection: []model.InstanceConnectionSample{
		conn(30*time.Second, 42), // only current window has data
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(time.Minute), Step: time.Minute, Comparison: time.Minute,
	})
	require.NoError(t, err)

	delta := res.Series[0].Delta
	require.NotNil(t, delta)
	assert.False(t, delta.PreviousAvailable)
	assert.True(t, math.IsNaN(delta.Previous))
	assert.True(t, math.IsNaN(delta.PercentChange))
}

func TestQueryTrendDeltaRiseFromZeroHasNoPercent(t *testing.T) {
	t.Parallel()

	reader := fakeReader{connection: []model.InstanceConnectionSample{
		conn(-30*time.Second, 0), // previous window: flat at zero
		conn(30*time.Second, 42),
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(time.Minute), Step: time.Minute, Comparison: time.Minute,
	})
	require.NoError(t, err)

	delta := res.Series[0].Delta
	require.NotNil(t, delta)
	assert.True(t, delta.PreviousAvailable)
	assert.Zero(t, delta.Previous)
	assert.InDelta(t, 42, delta.Current, 1e-9)
	assert.True(t, math.IsNaN(delta.PercentChange), "rise from zero must not read as 0%% change")
}

// countingReader counts loads per source to assert query-scoped memoization.
type countingReader struct {
	fakeReader

	connectionCalls *int
}

func (r countingReader) ConnectionSamples(ctx context.Context, inst string, since, until time.Time) ([]model.InstanceConnectionSample, error) {
	*r.connectionCalls++

	return r.fakeReader.ConnectionSamples(ctx, inst, since, until)
}

func TestQuerySharedSourceLoadsOnce(t *testing.T) {
	t.Parallel()

	calls := 0
	reader := countingReader{
		fakeReader:      fakeReader{connection: []model.InstanceConnectionSample{conn(0, 10)}},
		connectionCalls: &calls,
	}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i",
		Metrics: []v1alpha1.MetricId{
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE,
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_IDLE,
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_TOTAL,
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_MAX,
		},
		Start: base, End: at(time.Minute), Step: time.Minute,
	})
	require.NoError(t, err)
	require.Len(t, res.Series, 4)
	assert.Equal(t, 1, calls, "the four connection gauges share one sample load")
}

func TestQueryPerMetricStep(t *testing.T) {
	t.Parallel()

	reader := fakeReader{
		connection: []model.InstanceConnectionSample{conn(0, 10)},
		storage:    []model.InstanceStorageSample{{ObservedAt: at(0), TotalSizeBytes: 1 << 30}},
	}

	// Connections probe every 30s, storage every 5m: a fine step request must
	// not be degraded to 5m buckets for the connections series.
	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i",
		Metrics: []v1alpha1.MetricId{
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE,
			v1alpha1.MetricId_METRIC_ID_STORAGE_TOTAL_BYTES,
		},
		Start: base, End: at(10 * time.Minute), Step: 30 * time.Second,
	})
	require.NoError(t, err)
	require.Len(t, res.Series, 2)

	assert.Equal(t, 30*time.Second, res.Step)
	assert.Equal(t, 30*time.Second, res.Series[0].Step)
	assert.Len(t, res.Series[0].Values, 20)
	assert.Equal(t, 5*time.Minute, res.Series[1].Step)
	assert.Len(t, res.Series[1].Values, 2)
}

func TestQueryStepIgnoresFailedMetrics(t *testing.T) {
	t.Parallel()

	// Connections (30s cadence) errors; storage (5m cadence) succeeds. The
	// response-level Step must reflect the ONLY returned series (5m), not the
	// finer cadence of the metric that failed.
	reader := failConnReader{fakeReader: fakeReader{
		storage: []model.InstanceStorageSample{{ObservedAt: at(0), TotalSizeBytes: 1 << 30}},
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i",
		Metrics: []v1alpha1.MetricId{
			v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE,
			v1alpha1.MetricId_METRIC_ID_STORAGE_TOTAL_BYTES,
		},
		Start: base, End: at(time.Hour),
	})
	require.NoError(t, err)
	require.Len(t, res.Series, 1)
	require.Len(t, res.Errors, 1)

	assert.Equal(t, res.Series[0].Step, res.Step, "Result.Step must equal a returned series' step")
	assert.Equal(t, 5*time.Minute, res.Step)
}

// failConnReader errors only ConnectionSamples; other sources delegate.
type failConnReader struct {
	fakeReader
}

func (failConnReader) ConnectionSamples(_ context.Context, _ string, _, _ time.Time) ([]model.InstanceConnectionSample, error) {
	return nil, errors.New("connection source unavailable")
}

func TestResolveStepNeverExceedsMaxPoints(t *testing.T) {
	t.Parallel()

	// A window a hair over maxPoints*floor with an explicit floor-width step:
	// floor(window/step) == maxPoints but ceil == maxPoints+1. The resolved step
	// must keep the ceil bucket count within maxPoints.
	floor := time.Minute
	window := time.Duration(maxPoints)*floor + 30*time.Second

	step := resolveStep(window, floor, floor)
	assert.LessOrEqualf(t, bucketCount(window, step), maxPoints,
		"bucketCount %d exceeds maxPoints %d at step %s", bucketCount(window, step), maxPoints, step)
}

func TestQueryEndEchoesRequestedWindow(t *testing.T) {
	t.Parallel()

	// 50m window with a 7m step: buckets extend past the window, but the echoed
	// interval must stay [start, requested end).
	res, err := NewEngine(fakeReader{}).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(50 * time.Minute), Step: 7 * time.Minute,
	})
	require.NoError(t, err)

	assert.Equal(t, base, res.Start)
	assert.Equal(t, at(50*time.Minute), res.End)
	assert.Len(t, res.Series[0].Values, 8)
}

func TestQueryCounterNegativeSecondaryDiscardsInterval(t *testing.T) {
	t.Parallel()

	reset := at(-time.Hour)
	// blocks_read shrinks (e.g. instance-wide sums after DROP DATABASE) while
	// blocks_hit grows: the interval is a discontinuity, not a 100% hit ratio.
	reader := fakeReader{cache: []model.InstanceCacheSample{
		{ObservedAt: at(0), BlocksHit: 1000, BlocksRead: 500, StatsReset: &reset},
		{ObservedAt: at(time.Minute), BlocksHit: 1100, BlocksRead: 200, StatsReset: &reset},
	}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CACHE_HIT_RATIO},
		Start: base, End: at(2 * time.Minute), Step: time.Minute,
	})
	require.NoError(t, err)
	requireValues(t, res.Series[0].Values, []float64{math.NaN(), math.NaN()})
}

// prevWindowFailReader errors only for loads that end at or before base — the
// comparison-window read — while serving the current window normally.
type prevWindowFailReader struct {
	fakeReader
}

func (r prevWindowFailReader) ConnectionSamples(ctx context.Context, inst string, since, until time.Time) ([]model.InstanceConnectionSample, error) {
	if !until.After(base) {
		return nil, errors.New("comparison window unavailable")
	}

	return r.fakeReader.ConnectionSamples(ctx, inst, since, until)
}

func TestQueryComparisonLoadFailureKeepsSeries(t *testing.T) {
	t.Parallel()

	reader := prevWindowFailReader{fakeReader: fakeReader{connection: []model.InstanceConnectionSample{
		conn(30*time.Second, 42),
	}}}

	res, err := NewEngine(reader).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(time.Minute), Step: time.Minute, Comparison: time.Minute,
	})
	require.NoError(t, err)
	require.Empty(t, res.Errors)
	require.Len(t, res.Series, 1)

	requireValues(t, res.Series[0].Values, []float64{42})
	assert.Nil(t, res.Series[0].Delta, "a failed delta must not discard the series")
}

func TestQueryScopeMismatch(t *testing.T) {
	t.Parallel()

	res, err := NewEngine(fakeReader{}).Query(context.Background(), Query{
		InstanceID: "i", IsDatabase: false,
		Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_DATABASE_SIZE_BYTES},
		Start:   base, End: at(time.Minute),
	})
	require.NoError(t, err)
	require.Empty(t, res.Series)
	require.Len(t, res.Errors, 1)
	assert.ErrorIs(t, res.Errors[0].Err, ErrScopeMismatch)
}

func TestQueryUnknownMetric(t *testing.T) {
	t.Parallel()

	_, err := NewEngine(fakeReader{}).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_UNSPECIFIED},
		Start: base, End: at(time.Minute),
	})

	var unknown UnknownMetricError
	require.ErrorAs(t, err, &unknown)
}

func TestQueryReadErrorIsPartial(t *testing.T) {
	t.Parallel()

	sentinel := errors.New("boom")
	res, err := NewEngine(fakeReader{err: sentinel}).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: at(time.Minute),
	})
	require.NoError(t, err)
	require.Len(t, res.Errors, 1)
	assert.ErrorIs(t, res.Errors[0].Err, sentinel)
}

func TestQueryInvalidInterval(t *testing.T) {
	t.Parallel()

	_, err := NewEngine(fakeReader{}).Query(context.Background(), Query{
		InstanceID: "i", Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE},
		Start: base, End: base,
	})
	require.Error(t, err)
}

func TestResolveStep(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		window    time.Duration
		requested time.Duration
		floor     time.Duration
		want      time.Duration
	}{
		{"auto clamps to floor", 2 * time.Hour, 0, 30 * time.Second, 30 * time.Second},
		{"requested below floor raised", time.Hour, time.Second, time.Minute, time.Minute},
		{"requested rounded up to floor multiple", time.Hour, 90 * time.Second, time.Minute, 2 * time.Minute},
		{"point ceiling caps step", 30 * 24 * time.Hour, time.Minute, time.Minute, roundUpTo(30*24*time.Hour/time.Duration(maxPoints), time.Minute)},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := resolveStep(tc.window, tc.requested, tc.floor)
			assert.Equal(t, tc.want, got)
			assert.LessOrEqual(t, int(tc.window/got), maxPoints)
		})
	}
}

func TestRegistryCoversAllMetricIds(t *testing.T) {
	t.Parallel()

	values := v1alpha1.MetricId_name
	for value, name := range values {
		id := v1alpha1.MetricId(value)
		if id == v1alpha1.MetricId_METRIC_ID_UNSPECIFIED {
			continue
		}

		_, err := lookup(id)
		require.NoErrorf(t, err, "metric %s (%d) is defined in the proto enum but missing from the registry", name, value)
	}
}
