package metricstore

import (
	"context"
	"errors"
	"math"
	"sort"
	"time"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// Row type aliases: the generated jet sample models double as the raw rows the
// extract functions project from.
type (
	connectionRow = model.InstanceConnectionSample
	cacheRow      = model.InstanceCacheSample
	ioRow         = model.InstanceIoSample
	storageRow    = model.InstanceStorageSample
	dbSizeRow     = model.DatabaseSizeSample
	vacuumRow     = model.DatabaseVacuumSample
)

// SampleReader loads raw probe samples for a target over a half-open
// [since, until) window, ordered by observation time ascending. Implemented by
// an adapter over the storage sample stores.
type SampleReader interface {
	ConnectionSamples(ctx context.Context, instanceID string, since, until time.Time) ([]connectionRow, error)
	CacheSamples(ctx context.Context, instanceID string, since, until time.Time) ([]cacheRow, error)
	IOSamples(ctx context.Context, instanceID string, since, until time.Time) ([]ioRow, error)
	StorageSamples(ctx context.Context, instanceID string, since, until time.Time) ([]storageRow, error)
	DatabaseSizeSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]dbSizeRow, error)
	DatabaseVacuumSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]vacuumRow, error)
}

// ErrScopeMismatch is reported per-metric when a metric's scope does not match
// the target (e.g. a database-scoped metric queried against an instance).
var ErrScopeMismatch = errors.New("metric scope does not match target")

const (
	// autoTargetPoints is the point count the auto-step aims for when the
	// caller does not pass a step.
	autoTargetPoints = 240
	// maxPoints caps the response size regardless of the requested step.
	maxPoints = 3000
)

// Engine answers metric queries over a SampleReader.
type Engine struct {
	reader SampleReader
}

// NewEngine returns an Engine backed by reader.
func NewEngine(reader SampleReader) *Engine {
	return &Engine{reader: reader}
}

// Query describes a metric query for one target.
type Query struct {
	InstanceID   string
	DatabaseName string // empty unless IsDatabase
	IsDatabase   bool
	Metrics      []v1alpha1.MetricId
	Start        time.Time
	End          time.Time
	Step         time.Duration // 0 => auto
	Comparison   time.Duration // 0 => no trend delta
}

// Series is one computed time series.
type Series struct {
	Metric    v1alpha1.MetricId
	Kind      Kind
	Unit      v1alpha1.MetricUnit
	StartTime time.Time
	Step      time.Duration
	Values    []float64 // NaN marks an empty bucket
	Delta     *Delta    // nil unless Query.Comparison was set
}

// Delta is the scalar period-over-period trend for a series. Fields that could
// not be computed are NaN (mirroring the NaN-for-gap convention of Values):
// Current when the current window has no usable data, Previous when
// PreviousAvailable is false, PercentChange when either side is missing or the
// previous value is zero while the current is not.
type Delta struct {
	Current           float64
	Previous          float64
	PercentChange     float64
	PreviousAvailable bool
}

// MetricError is a per-metric failure that does not abort the whole query.
type MetricError struct {
	Metric v1alpha1.MetricId
	Err    error
}

// Result is the outcome of a Query: the requested window, the finest bucket
// width used across series (each Series carries its own Step, clamped to its
// metric's probe cadence), the series that succeeded, and per-metric errors.
type Result struct {
	Start  time.Time
	End    time.Time
	Step   time.Duration
	Series []Series
	Errors []MetricError
}

// Query computes each requested metric. An unknown metric or an invalid window
// fails the whole call; a per-metric failure (scope mismatch, read error) is
// collected in Result.Errors while the rest succeed.
func (e *Engine) Query(ctx context.Context, q Query) (Result, error) {
	if !q.End.After(q.Start) {
		return Result{}, errors.New("interval end must be after start")
	}

	defs := make([]SeriesDef, 0, len(q.Metrics))
	for _, id := range q.Metrics {
		def, err := lookup(id)
		if err != nil {
			return Result{}, err
		}

		defs = append(defs, def)
	}

	window := q.End.Sub(q.Start)
	result := Result{Start: q.Start, End: q.End}

	// Metrics sharing a source table (and window) load it once per query.
	reader := newCachedReader(e.reader)

	for _, def := range defs {
		// The step floor is per metric (its own probe cadence), so a
		// fine-cadence metric is not degraded by a coarser one in the same
		// request.
		step := resolveStep(window, q.Step, def.ProbeStep)

		series, err := querySeries(ctx, reader, def, q, step, bucketCount(window, step))
		if err != nil {
			result.Errors = append(result.Errors, MetricError{Metric: def.ID, Err: err})

			continue
		}

		// Only a series that was actually produced contributes to the
		// response-level Step; a metric that failed its read must not lower it
		// below every returned series' own width.
		if result.Step == 0 || step < result.Step {
			result.Step = step
		}

		result.Series = append(result.Series, series)
	}

	return result, nil
}

// querySeries computes one series, including its trend delta when requested.
func querySeries(ctx context.Context, reader SampleReader, def SeriesDef, q Query, step time.Duration, n int) (Series, error) {
	if !scopeMatches(def.Scope, q.IsDatabase) {
		return Series{}, ErrScopeMismatch
	}

	samples, err := load(ctx, reader, def, q.InstanceID, q.DatabaseName, q.Start, q.End)
	if err != nil {
		return Series{}, err
	}

	series := Series{
		Metric:    def.ID,
		Kind:      def.Kind,
		Unit:      def.Unit,
		StartTime: q.Start,
		Step:      step,
		Values:    reduce(def.Kind, samples, q.Start, step, n),
	}

	if q.Comparison > 0 {
		// The delta is decoration on the series, not its payload: when only the
		// comparison-window load fails, serve the series without a delta rather
		// than discarding the values already computed.
		if delta, err := computeDelta(ctx, reader, def, q, samples); err == nil {
			series.Delta = delta
		}
	}

	return series, nil
}

// load fetches raw samples for [start, end), extended backwards by a small
// lookback so the first bucket of a counter rate has a preceding sample to
// diff against (the reduction ignores intervals ending before start).
func load(ctx context.Context, reader SampleReader, def SeriesDef, instanceID, databaseName string, start, end time.Time) ([]rawSample, error) {
	loadSince := start.Add(-lookback(def.ProbeStep))

	samples, err := def.extract(ctx, reader, instanceID, databaseName, loadSince, end)
	if err != nil {
		return nil, err
	}

	sort.Slice(samples, func(i, j int) bool { return samples[i].At.Before(samples[j].At) })

	return samples, nil
}

// computeDelta compares the current window against the same-length window
// shifted back by q.Comparison. currentSamples already cover the current
// window (with lookback), so only the shifted window needs a fresh load.
func computeDelta(ctx context.Context, reader SampleReader, def SeriesDef, q Query, currentSamples []rawSample) (*Delta, error) {
	current, currentOK := summarize(def.Kind, currentSamples, q.Start, q.End)

	prevStart := q.Start.Add(-q.Comparison)
	prevEnd := q.End.Add(-q.Comparison)

	prevSamples, err := load(ctx, reader, def, q.InstanceID, q.DatabaseName, prevStart, prevEnd)
	if err != nil {
		return nil, err
	}

	previous, previousOK := summarize(def.Kind, prevSamples, prevStart, prevEnd)

	delta := &Delta{
		Current:           math.NaN(),
		Previous:          math.NaN(),
		PercentChange:     math.NaN(),
		PreviousAvailable: previousOK,
	}

	if currentOK {
		delta.Current = current
	}

	if previousOK {
		delta.Previous = previous
		if currentOK {
			delta.PercentChange = percentChange(current, previous)
		}
	}

	return delta, nil
}

// reduce buckets samples into n step-width buckets from start. Empty buckets
// are NaN.
func reduce(kind Kind, samples []rawSample, start time.Time, step time.Duration, n int) []float64 {
	values := make([]float64, n)
	for i := range values {
		values[i] = math.NaN()
	}

	if kind == KindGauge {
		reduceGauge(values, samples, start, step, n)

		return values
	}

	reduceCounter(kind, values, samples, start, step, n)

	return values
}

// reduceGauge averages the raw values in each bucket.
func reduceGauge(values []float64, samples []rawSample, start time.Time, step time.Duration, n int) {
	sum := make([]float64, n)
	count := make([]int, n)

	for _, s := range samples {
		idx, ok := bucketIndex(s.At, start, step, n)
		if !ok {
			continue
		}

		sum[idx] += s.Primary
		count[idx]++
	}

	for i := range values {
		if count[i] > 0 {
			values[i] = sum[i] / float64(count[i])
		}
	}
}

// reduceCounter accumulates per-interval deltas into the bucket of each
// interval's end sample, then derives the rate (or ratio) per bucket.
func reduceCounter(kind Kind, values []float64, samples []rawSample, start time.Time, step time.Duration, n int) {
	primary := make([]float64, n)
	secondary := make([]float64, n)
	seconds := make([]float64, n)

	for i := 1; i < len(samples); i++ {
		prev, cur := samples[i-1], samples[i]

		idx, ok := bucketIndex(cur.At, start, step, n)
		if !ok {
			continue
		}

		iv, ok := interval(prev, cur)
		if !ok {
			continue
		}

		primary[idx] += iv.primary
		secondary[idx] += iv.secondary
		seconds[idx] += iv.seconds
	}

	for i := range values {
		if kind == KindRatio {
			if denom := primary[i] + secondary[i]; denom > 0 {
				values[i] = primary[i] / denom
			}

			continue
		}

		if seconds[i] > 0 {
			values[i] = primary[i] / seconds[i]
		}
	}
}

// intervalDeltas is the non-negative delta between two consecutive samples of
// the same stats_reset window.
type intervalDeltas struct {
	primary   float64
	secondary float64
	seconds   float64
}

// interval returns the deltas between prev and cur, or ok=false when they
// straddle a stats_reset, either counter went backwards (a discontinuity such
// as DROP DATABASE), or no time elapsed.
func interval(prev, cur rawSample) (intervalDeltas, bool) {
	if !sameReset(prev, cur) {
		return intervalDeltas{}, false
	}

	primary := cur.Primary - prev.Primary
	if primary < 0 {
		return intervalDeltas{}, false
	}

	secondary := cur.Secondary - prev.Secondary
	if secondary < 0 {
		return intervalDeltas{}, false
	}

	seconds := cur.At.Sub(prev.At).Seconds()
	if seconds <= 0 {
		return intervalDeltas{}, false
	}

	return intervalDeltas{primary: primary, secondary: secondary, seconds: seconds}, true
}

// summarize collapses a window into the scalar used for a trend delta: the last
// reading for a gauge, the mean rate for a counter, the overall ratio for a
// ratio. ok is false when the window has no usable data.
func summarize(kind Kind, samples []rawSample, start, end time.Time) (float64, bool) {
	if kind == KindGauge {
		for i := len(samples) - 1; i >= 0; i-- {
			if inWindow(samples[i].At, start, end) {
				return samples[i].Primary, true
			}
		}

		return 0, false
	}

	var primary, secondary, seconds float64

	for i := 1; i < len(samples); i++ {
		if !inWindow(samples[i].At, start, end) {
			continue
		}

		iv, ok := interval(samples[i-1], samples[i])
		if !ok {
			continue
		}

		primary += iv.primary
		secondary += iv.secondary
		seconds += iv.seconds
	}

	if kind == KindRatio {
		if denom := primary + secondary; denom > 0 {
			return primary / denom, true
		}

		return 0, false
	}

	if seconds > 0 {
		return primary / seconds, true
	}

	return 0, false
}

// resolveStep picks the bucket width: at least the floor (coarsest probe
// cadence of the requested metrics), rounded up to a floor multiple, and capped
// so the response never exceeds maxPoints.
func resolveStep(window, requested, floor time.Duration) time.Duration {
	if floor <= 0 {
		floor = time.Second
	}

	step := requested
	if step <= 0 {
		step = window / time.Duration(autoTargetPoints)
	}

	if step < floor {
		step = floor
	}

	step = roundUpTo(step, floor)

	// Cap on the ACTUAL emitted bucket count (bucketCount uses ceil), not the
	// floor of window/step, so a window a hair over maxPoints*step can never
	// push the response to maxPoints+1 values.
	if bucketCount(window, step) > maxPoints {
		step = roundUpTo(ceilDivDuration(window, maxPoints), floor)
	}

	if step <= 0 {
		step = floor
	}

	return step
}

// ceilDivDuration returns ceil(window / n) as a duration: the smallest step
// whose ceil bucket count over window is at most n.
func ceilDivDuration(window time.Duration, n int) time.Duration {
	if n <= 0 {
		return window
	}

	return (window + time.Duration(n) - 1) / time.Duration(n)
}

// bucketCount is the number of step-width buckets needed to cover window.
func bucketCount(window, step time.Duration) int {
	if step <= 0 {
		return 1
	}

	n := int((window + step - 1) / step)
	if n < 1 {
		return 1
	}

	return n
}

// bucketIndex returns the bucket at is in, or ok=false when at is outside
// [start, start+n*step).
func bucketIndex(at, start time.Time, step time.Duration, n int) (int, bool) {
	if at.Before(start) {
		return 0, false
	}

	idx := int(at.Sub(start) / step)
	if idx < 0 || idx >= n {
		return 0, false
	}

	return idx, true
}

// lookback is how far before the window to fetch samples so counter rates have
// a preceding sample to diff against in the first bucket.
func lookback(cadence time.Duration) time.Duration {
	if cadence <= 0 {
		return time.Minute
	}

	return 2 * cadence
}

func scopeMatches(scope Scope, isDatabase bool) bool {
	return (scope == ScopeDatabase) == isDatabase
}

func sameReset(a, b rawSample) bool {
	if a.Reset == nil || b.Reset == nil {
		return a.Reset == b.Reset
	}

	return a.Reset.Equal(*b.Reset)
}

func inWindow(at, start, end time.Time) bool {
	return !at.Before(start) && at.Before(end)
}

// percentChange is the signed percent change from previous to current, or NaN
// when previous is zero and current is not — a rise from zero has no finite
// percentage, and 0% would falsely read as "unchanged".
func percentChange(current, previous float64) float64 {
	if previous == 0 {
		if current == 0 {
			return 0
		}

		return math.NaN()
	}

	return (current - previous) / previous * 100
}

func roundUpTo(d, unit time.Duration) time.Duration {
	if unit <= 0 {
		return d
	}

	remainder := d % unit
	if remainder == 0 {
		return d
	}

	return d + (unit - remainder)
}

// readKey identifies one sample-store read: metrics sharing a source table use
// the same key when their windows coincide (same cadence, hence same lookback).
type readKey struct {
	instanceID   string
	databaseName string
	since        time.Time
	until        time.Time
}

// readResult caches a load's outcome, errors included, so a failing source is
// not retried once per metric within the same query.
type readResult[T any] struct {
	rows []T
	err  error
}

func loadOnce[T any](m map[readKey]readResult[T], key readKey, load func() ([]T, error)) ([]T, error) {
	if cached, ok := m[key]; ok {
		return cached.rows, cached.err
	}

	rows, err := load()
	m[key] = readResult[T]{rows: rows, err: err}

	return rows, err
}

// cachedReader memoizes SampleReader loads for the lifetime of one Query call,
// so metrics sharing a source table (the four connection gauges, TPS and
// cache-hit over the cache samples, the two IO rates) hit the meta database
// once per window instead of once per metric. Not safe for concurrent use.
type cachedReader struct {
	inner SampleReader

	connection map[readKey]readResult[connectionRow]
	cache      map[readKey]readResult[cacheRow]
	io         map[readKey]readResult[ioRow]
	storage    map[readKey]readResult[storageRow]
	dbSize     map[readKey]readResult[dbSizeRow]
	vacuum     map[readKey]readResult[vacuumRow]
}

func newCachedReader(inner SampleReader) *cachedReader {
	return &cachedReader{
		inner:      inner,
		connection: map[readKey]readResult[connectionRow]{},
		cache:      map[readKey]readResult[cacheRow]{},
		io:         map[readKey]readResult[ioRow]{},
		storage:    map[readKey]readResult[storageRow]{},
		dbSize:     map[readKey]readResult[dbSizeRow]{},
		vacuum:     map[readKey]readResult[vacuumRow]{},
	}
}

func (r *cachedReader) ConnectionSamples(ctx context.Context, instanceID string, since, until time.Time) ([]connectionRow, error) {
	return loadOnce(r.connection, readKey{instanceID: instanceID, since: since, until: until}, func() ([]connectionRow, error) {
		return r.inner.ConnectionSamples(ctx, instanceID, since, until)
	})
}

func (r *cachedReader) CacheSamples(ctx context.Context, instanceID string, since, until time.Time) ([]cacheRow, error) {
	return loadOnce(r.cache, readKey{instanceID: instanceID, since: since, until: until}, func() ([]cacheRow, error) {
		return r.inner.CacheSamples(ctx, instanceID, since, until)
	})
}

func (r *cachedReader) IOSamples(ctx context.Context, instanceID string, since, until time.Time) ([]ioRow, error) {
	return loadOnce(r.io, readKey{instanceID: instanceID, since: since, until: until}, func() ([]ioRow, error) {
		return r.inner.IOSamples(ctx, instanceID, since, until)
	})
}

func (r *cachedReader) StorageSamples(ctx context.Context, instanceID string, since, until time.Time) ([]storageRow, error) {
	return loadOnce(r.storage, readKey{instanceID: instanceID, since: since, until: until}, func() ([]storageRow, error) {
		return r.inner.StorageSamples(ctx, instanceID, since, until)
	})
}

func (r *cachedReader) DatabaseSizeSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]dbSizeRow, error) {
	return loadOnce(r.dbSize, readKey{instanceID: instanceID, databaseName: databaseName, since: since, until: until}, func() ([]dbSizeRow, error) {
		return r.inner.DatabaseSizeSamples(ctx, instanceID, databaseName, since, until)
	})
}

func (r *cachedReader) DatabaseVacuumSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]vacuumRow, error) {
	return loadOnce(r.vacuum, readKey{instanceID: instanceID, databaseName: databaseName, since: since, until: until}, func() ([]vacuumRow, error) {
		return r.inner.DatabaseVacuumSamples(ctx, instanceID, databaseName, since, until)
	})
}

// mapGauge projects gauge rows into rawSamples, propagating a load error.
func mapGauge[T any](rows []T, err error, project func(T) (time.Time, float64)) ([]rawSample, error) {
	if err != nil {
		return nil, err
	}

	out := make([]rawSample, len(rows))
	for i, row := range rows {
		at, value := project(row)
		out[i] = rawSample{At: at, Primary: value}
	}

	return out, nil
}

// mapCounter projects counter rows into rawSamples, propagating a load error.
func mapCounter[T any](rows []T, err error, project func(T) (time.Time, float64, float64, *time.Time)) ([]rawSample, error) {
	if err != nil {
		return nil, err
	}

	out := make([]rawSample, len(rows))
	for i, row := range rows {
		at, primary, secondary, reset := project(row)
		out[i] = rawSample{At: at, Primary: primary, Secondary: secondary, Reset: reset}
	}

	return out, nil
}
