package metricsvc

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/genproto/googleapis/type/interval"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

var base = time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)

type fakeConn struct {
	rows []model.InstanceConnectionSample
}

func (f fakeConn) ListSamples(_ context.Context, _ string, since, until time.Time, _ int) ([]model.InstanceConnectionSample, error) {
	var out []model.InstanceConnectionSample

	for _, row := range f.rows {
		if !row.ObservedAt.Before(since) && row.ObservedAt.Before(until) {
			out = append(out, row)
		}
	}

	return out, nil
}

func newStores(conn fakeConn) Stores {
	return Stores{Connection: conn}
}

// okInstances answers every existence check with a live instance.
type okInstances struct{}

func (okInstances) GetInstance(_ context.Context, _ string) (*v1alpha1.Instance, error) {
	return &v1alpha1.Instance{}, nil
}

// missingInstances answers every existence check with storage.ErrNotFound.
type missingInstances struct{}

func (missingInstances) GetInstance(_ context.Context, _ string) (*v1alpha1.Instance, error) {
	return nil, storage.ErrNotFound
}

func instanceRequest(metrics []v1alpha1.MetricId, start, end time.Time) *v1alpha1.QueryMetricsRequest {
	return &v1alpha1.QueryMetricsRequest{
		Target:  "instances/prod",
		Metrics: metrics,
		Interval: &interval.Interval{
			StartTime: timestamppb.New(start),
			EndTime:   timestamppb.New(end),
		},
	}
}

func TestQueryMetricsHappyPath(t *testing.T) {
	t.Parallel()

	stores := newStores(fakeConn{rows: []model.InstanceConnectionSample{
		{ObservedAt: base.Add(30 * time.Second), Active: 42, Total: 42, MaxConn: 100},
	}})

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE}, base, base.Add(time.Minute))
	req.Step = durationpb.New(time.Minute)

	resp, err := NewService(stores, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.NoError(t, err)

	msg := resp.Msg
	require.Len(t, msg.GetSeries(), 1)
	assert.Empty(t, msg.GetPartialErrors())

	series := msg.GetSeries()[0]
	assert.Equal(t, v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE, series.GetMetric())
	assert.Equal(t, v1alpha1.MetricKind_METRIC_KIND_GAUGE, series.GetKind())
	require.Len(t, series.GetPoints().GetValues(), 1)
	assert.InDelta(t, 42, series.GetPoints().GetValues()[0], 1e-9)
	assert.Equal(t, time.Minute, msg.GetStep().AsDuration())
}

func TestQueryMetricsComparisonProducesDelta(t *testing.T) {
	t.Parallel()

	stores := newStores(fakeConn{rows: []model.InstanceConnectionSample{
		{ObservedAt: base.Add(-30 * time.Second), Active: 30, Total: 30, MaxConn: 100},
		{ObservedAt: base.Add(30 * time.Second), Active: 42, Total: 42, MaxConn: 100},
	}})

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE}, base, base.Add(time.Minute))
	req.Comparison = durationpb.New(time.Minute)

	resp, err := NewService(stores, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.NoError(t, err)

	delta := resp.Msg.GetSeries()[0].GetDelta()
	require.NotNil(t, delta)
	assert.True(t, delta.GetPreviousAvailable())
	assert.InDelta(t, 40, delta.GetPercentChange(), 1e-9)
}

func TestQueryMetricsScopeMismatchIsPartialError(t *testing.T) {
	t.Parallel()

	// Instance target, database-scoped metric -> per-metric partial error.
	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_DATABASE_SIZE_BYTES}, base, base.Add(time.Minute))

	resp, err := NewService(Stores{}, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.NoError(t, err)
	require.Empty(t, resp.Msg.GetSeries())
	require.Len(t, resp.Msg.GetPartialErrors(), 1)

	status := resp.Msg.GetPartialErrors()[0]
	assert.Equal(t, int32(connect.CodeInvalidArgument), status.GetCode())

	var info errdetails.ErrorInfo
	require.NoError(t, status.GetDetails()[0].UnmarshalTo(&info))
	assert.Equal(t, "METRIC_SCOPE_MISMATCH", info.GetReason())
	assert.Equal(t, "METRIC_ID_DATABASE_SIZE_BYTES", info.GetMetadata()["metric"])
}

func TestQueryMetricsUnknownMetricIsInvalidArgument(t *testing.T) {
	t.Parallel()

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_UNSPECIFIED}, base, base.Add(time.Minute))

	_, err := NewService(Stores{}, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestQueryMetricsUnknownInstanceIsNotFound(t *testing.T) {
	t.Parallel()

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE}, base, base.Add(time.Minute))

	_, err := NewService(Stores{}, missingInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.Error(t, err)
	assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
}

func TestQueryMetricsInvalidTarget(t *testing.T) {
	t.Parallel()

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE}, base, base.Add(time.Minute))
	req.Target = "not-a-resource-name"

	_, err := NewService(Stores{}, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestQueryMetricsInvalidInterval(t *testing.T) {
	t.Parallel()

	req := instanceRequest([]v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_CONNECTIONS_ACTIVE}, base, base)

	_, err := NewService(Stores{}, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestQueryMetricsDatabaseTarget(t *testing.T) {
	t.Parallel()

	req := &v1alpha1.QueryMetricsRequest{
		Target:  "instances/prod/databases/app",
		Metrics: []v1alpha1.MetricId{v1alpha1.MetricId_METRIC_ID_DATABASE_SIZE_BYTES},
		Interval: &interval.Interval{
			StartTime: timestamppb.New(base),
			EndTime:   timestamppb.New(base.Add(time.Minute)),
		},
	}

	stores := Stores{DatabaseSize: fakeDBSize{}}

	resp, err := NewService(stores, okInstances{}).QueryMetrics(context.Background(), connect.NewRequest(req))
	require.NoError(t, err)
	// No samples, but the metric is in-scope: a series of NaN, no partial error.
	require.Len(t, resp.Msg.GetSeries(), 1)
	assert.Empty(t, resp.Msg.GetPartialErrors())
}

type fakeDBSize struct{}

func (fakeDBSize) ListSamples(_ context.Context, _, _ string, _, _ time.Time, _ int) ([]model.DatabaseSizeSample, error) {
	return nil, nil
}
