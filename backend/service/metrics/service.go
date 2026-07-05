// Package metricsvc implements MetricsService: the read API over the probe
// samples collected in the meta database. It parses the target resource name,
// runs the metricstore query engine, and maps the result to the wire shape,
// reporting per-metric failures as partial errors.
package metricsvc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/genproto/googleapis/type/interval"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/metricstore"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

var _ v1connect.MetricsServiceHandler = (*Service)(nil)

// Per-metric sample listers, satisfied by the storage sample stores. Only the
// time-range read is needed; the query engine never caps rows.
type (
	connectionSampleLister interface {
		ListSamples(ctx context.Context, instanceID string, since, until time.Time, limit int) ([]model.InstanceConnectionSample, error)
	}
	cacheSampleLister interface {
		ListSamples(ctx context.Context, instanceID string, since, until time.Time, limit int) ([]model.InstanceCacheSample, error)
	}
	ioSampleLister interface {
		ListSamples(ctx context.Context, instanceID string, since, until time.Time, limit int) ([]model.InstanceIoSample, error)
	}
	storageSampleLister interface {
		ListSamples(ctx context.Context, instanceID string, since, until time.Time, limit int) ([]model.InstanceStorageSample, error)
	}
	databaseSizeSampleLister interface {
		ListSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time, limit int) ([]model.DatabaseSizeSample, error)
	}
	databaseVacuumSampleLister interface {
		ListSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time, limit int) ([]model.DatabaseVacuumSample, error)
	}
)

// Stores bundles the sample stores the metrics read path depends on.
type Stores struct {
	Connection     connectionSampleLister
	Cache          cacheSampleLister
	IO             ioSampleLister
	Storage        storageSampleLister
	DatabaseSize   databaseSizeSampleLister
	DatabaseVacuum databaseVacuumSampleLister
}

// instanceGetter is the existence check for the target's instance, satisfied
// by the storage instance reader.
type instanceGetter interface {
	GetInstance(ctx context.Context, name string) (*v1alpha1.Instance, error)
}

// Service implements MetricsService RPC handlers.
type Service struct {
	engine    *metricstore.Engine
	instances instanceGetter
}

// NewService creates a MetricsService backed by the given sample stores.
func NewService(stores Stores, instances instanceGetter) *Service {
	return &Service{
		engine:    metricstore.NewEngine(sampleReader{stores: stores}),
		instances: instances,
	}
}

// QueryMetrics returns one time series per requested metric for a target.
func (s *Service) QueryMetrics(ctx context.Context, req *connect.Request[v1alpha1.QueryMetricsRequest]) (*connect.Response[v1alpha1.QueryMetricsResponse], error) {
	query, err := buildQuery(req.Msg)
	if err != nil {
		return nil, err
	}

	// A nonexistent target is NOT_FOUND, not an all-NaN OK response. The check
	// stops at the instance: the database catalog is populated on demand, so a
	// missing catalog row does not prove a database is gone.
	instanceName := resource.NewInstanceName(query.InstanceID)
	if _, err := s.instances.GetInstance(ctx, instanceName.String()); err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: instanceName.ResourceType(),
			Name: instanceName.String(),
			Op:   "query_metrics",
		})
	}

	result, err := s.engine.Query(ctx, query)
	if err != nil {
		return nil, mapQueryError(err)
	}

	return connect.NewResponse(toProtoResponse(result)), nil
}

// buildQuery validates the request and translates it into an engine query.
func buildQuery(msg *v1alpha1.QueryMetricsRequest) (metricstore.Query, error) {
	instanceID, databaseName, isDatabase, err := parseTarget(msg.GetTarget())
	if err != nil {
		return metricstore.Query{}, err
	}

	start, end, err := parseInterval(msg.GetInterval())
	if err != nil {
		return metricstore.Query{}, err
	}

	return metricstore.Query{
		InstanceID:   instanceID,
		DatabaseName: databaseName,
		IsDatabase:   isDatabase,
		Metrics:      msg.GetMetrics(),
		Start:        start,
		End:          end,
		Step:         optionalDuration(msg.GetStep()),
		Comparison:   optionalDuration(msg.GetComparison()),
	}, nil
}

// parseTarget resolves the target resource name to instance/database ids. A
// database name (4 segments) is tried first; falling back to an instance name.
func parseTarget(target string) (string, string, bool, error) {
	if db, err := resource.ParseDatabaseName(target); err == nil {
		return db.InstanceID, db.DatabaseID, true, nil
	}

	instance, err := resource.ParseInstanceName(target)
	if err != nil {
		return "", "", false, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("target", "must be an instance or database resource name"),
		)
	}

	return instance.InstanceID, "", false, nil
}

// parseInterval validates the request window and returns [start, end).
func parseInterval(iv *interval.Interval) (time.Time, time.Time, error) {
	if iv == nil || iv.GetStartTime() == nil || iv.GetEndTime() == nil {
		return time.Time{}, time.Time{}, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("interval", "start_time and end_time are required"),
		)
	}

	start := iv.GetStartTime().AsTime()
	end := iv.GetEndTime().AsTime()

	if !end.After(start) {
		return time.Time{}, time.Time{}, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("interval", "end_time must be after start_time"),
		)
	}

	return start, end, nil
}

// mapQueryError maps a whole-query failure to a connect error. An unknown
// metric is a client error; anything else is internal.
func mapQueryError(err error) error {
	if _, ok := errors.AsType[metricstore.UnknownMetricError](err); ok {
		return apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("metrics", "contains an unknown metric"),
		)
	}

	return connect.NewError(connect.CodeInternal, err)
}

func toProtoResponse(result metricstore.Result) *v1alpha1.QueryMetricsResponse {
	resp := &v1alpha1.QueryMetricsResponse{
		Interval: &interval.Interval{
			StartTime: timestamppb.New(result.Start),
			EndTime:   timestamppb.New(result.End),
		},
		Step:   durationpb.New(result.Step),
		Series: make([]*v1alpha1.MetricSeries, 0, len(result.Series)),
	}

	for _, series := range result.Series {
		resp.Series = append(resp.Series, toProtoSeries(series))
	}

	for _, metricErr := range result.Errors {
		resp.PartialErrors = append(resp.PartialErrors, toPartialError(metricErr))
	}

	return resp
}

func toProtoSeries(series metricstore.Series) *v1alpha1.MetricSeries {
	proto := &v1alpha1.MetricSeries{
		Metric: series.Metric,
		Unit:   series.Unit,
		Kind:   toProtoKind(series.Kind),
		Points: &v1alpha1.Points{
			StartTime: timestamppb.New(series.StartTime),
			Step:      durationpb.New(series.Step),
			Values:    series.Values,
		},
	}

	if series.Delta != nil {
		proto.Delta = &v1alpha1.TrendDelta{
			CurrentValue:      series.Delta.Current,
			PreviousValue:     series.Delta.Previous,
			PercentChange:     series.Delta.PercentChange,
			PreviousAvailable: series.Delta.PreviousAvailable,
		}
	}

	return proto
}

func toProtoKind(kind metricstore.Kind) v1alpha1.MetricKind {
	switch kind {
	case metricstore.KindGauge:
		return v1alpha1.MetricKind_METRIC_KIND_GAUGE
	case metricstore.KindCounterRate:
		return v1alpha1.MetricKind_METRIC_KIND_COUNTER_RATE
	case metricstore.KindRatio:
		return v1alpha1.MetricKind_METRIC_KIND_RATIO
	default:
		return v1alpha1.MetricKind_METRIC_KIND_UNSPECIFIED
	}
}

// toPartialError builds a google.rpc.Status for a metric that could not be
// served. The metric is identified by an ErrorInfo detail, mirroring
// GetInstanceOverviewResponse.partial_errors.
func toPartialError(metricErr metricstore.MetricError) *rpcstatus.Status {
	code := connect.CodeUnavailable
	reason := "METRIC_UNAVAILABLE"
	message := "failed to query metric"

	if errors.Is(metricErr.Err, metricstore.ErrScopeMismatch) {
		code = connect.CodeInvalidArgument
		reason = "METRIC_SCOPE_MISMATCH"
		message = "metric is not collected for this target scope"
	}

	status := &rpcstatus.Status{
		Code:    int32(code),
		Message: message,
	}

	info := &errdetails.ErrorInfo{
		Reason:   reason,
		Domain:   string(apierrors.DomainConsole),
		Metadata: map[string]string{"metric": metricErr.Metric.String()},
	}

	if detail, err := anypb.New(info); err == nil {
		status.Details = append(status.Details, detail)
	}

	return status
}

func optionalDuration(d *durationpb.Duration) time.Duration {
	if d == nil {
		return 0
	}

	return d.AsDuration()
}

// sampleReader adapts the storage sample stores to metricstore.SampleReader,
// passing limit 0 (the engine reads the full window).
type sampleReader struct {
	stores Stores
}

func (r sampleReader) ConnectionSamples(ctx context.Context, instanceID string, since, until time.Time) ([]model.InstanceConnectionSample, error) {
	return r.stores.Connection.ListSamples(ctx, instanceID, since, until, 0)
}

func (r sampleReader) CacheSamples(ctx context.Context, instanceID string, since, until time.Time) ([]model.InstanceCacheSample, error) {
	return r.stores.Cache.ListSamples(ctx, instanceID, since, until, 0)
}

func (r sampleReader) IOSamples(ctx context.Context, instanceID string, since, until time.Time) ([]model.InstanceIoSample, error) {
	return r.stores.IO.ListSamples(ctx, instanceID, since, until, 0)
}

func (r sampleReader) StorageSamples(ctx context.Context, instanceID string, since, until time.Time) ([]model.InstanceStorageSample, error) {
	return r.stores.Storage.ListSamples(ctx, instanceID, since, until, 0)
}

func (r sampleReader) DatabaseSizeSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]model.DatabaseSizeSample, error) {
	return r.stores.DatabaseSize.ListSamples(ctx, instanceID, databaseName, since, until, 0)
}

func (r sampleReader) DatabaseVacuumSamples(ctx context.Context, instanceID, databaseName string, since, until time.Time) ([]model.DatabaseVacuumSample, error) {
	return r.stores.DatabaseVacuum.ListSamples(ctx, instanceID, databaseName, since, until, 0)
}
