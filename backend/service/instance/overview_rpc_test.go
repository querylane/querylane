package instance

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type overviewFetcherFunc func(context.Context, resource.InstanceName) (*engine.InstanceOverview, error)

func (f overviewFetcherFunc) GetInstanceOverview(ctx context.Context, instance resource.InstanceName) (*engine.InstanceOverview, error) {
	return f(ctx, instance)
}

func TestGetInstanceOverviewIncludesIOMetrics(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, nil, nil, nil, nil, overviewFetcherFunc(
		func(_ context.Context, _ resource.InstanceName) (*engine.InstanceOverview, error) {
			return &engine.InstanceOverview{
				IO: &engine.IOMetrics{
					Reads:       7,
					ReadBytes:   57_344,
					Writes:      3,
					WriteBytes:  24_576,
					Extends:     2,
					ExtendBytes: 16_384,
					Fsyncs:      1,
				},
			}, nil
		},
	), false)

	resp, err := service.GetInstanceOverview(context.Background(), connect.NewRequest(&v1alpha1.GetInstanceOverviewRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)

	io := resp.Msg.GetInstanceOverview().GetIoMetrics()
	require.NotNil(t, io)
	assert.Equal(t, int64(7), io.GetReads())
	assert.Equal(t, int64(57_344), io.GetReadBytes())
	assert.Equal(t, int64(3), io.GetWrites())
	assert.Equal(t, int64(24_576), io.GetWriteBytes())
	assert.Equal(t, int64(2), io.GetExtends())
	assert.Equal(t, int64(16_384), io.GetExtendBytes())
	assert.Equal(t, int64(1), io.GetFsyncs())
}

func TestGetInstanceOverviewReportsIOMetricsUnavailable(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, nil, nil, nil, nil, overviewFetcherFunc(
		func(_ context.Context, _ resource.InstanceName) (*engine.InstanceOverview, error) {
			return &engine.InstanceOverview{}, nil
		},
	), false)

	resp, err := service.GetInstanceOverview(context.Background(), connect.NewRequest(&v1alpha1.GetInstanceOverviewRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)
	require.Nil(t, resp.Msg.GetInstanceOverview().GetIoMetrics())

	var ioErrorFound bool

	for _, partialError := range resp.Msg.GetPartialErrors() {
		for _, detail := range partialError.GetDetails() {
			var info errdetails.ErrorInfo
			if detail.MessageIs(&info) {
				require.NoError(t, detail.UnmarshalTo(&info))

				if info.GetMetadata()["metric"] == "io" {
					ioErrorFound = true
				}
			}
		}
	}

	assert.True(t, ioErrorFound, "partial errors should identify unavailable I/O metrics")
}

func TestGetInstanceOverviewPartialErrorIncludesPostgresSQLMetadata(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, nil, nil, nil, nil, overviewFetcherFunc(
		func(_ context.Context, _ resource.InstanceName) (*engine.InstanceOverview, error) {
			return &engine.InstanceOverview{
				PartialErrors: []engine.OverviewMetricError{
					{
						Metric: "storage",
						Err: &engine.PostgresSQLError{
							Kind:          engine.PostgresSQLKindPermissionDenied,
							SQLState:      "42501",
							SQLStateClass: "42",
							ConditionName: "insufficient_privilege",
							Operation:     "query storage metrics",
							SafeFields: map[string]string{
								"schema_name": "pg_catalog",
							},
							Sentinel: engine.ErrQueryPermissionDenied,
						},
					},
				},
			}, nil
		},
	), false)

	resp, err := service.GetInstanceOverview(context.Background(), connect.NewRequest(&v1alpha1.GetInstanceOverviewRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)

	storageError := requireMetricPartialError(t, resp.Msg.GetPartialErrors(), "storage")
	assert.Equal(t, int32(connect.CodePermissionDenied), storageError.GetCode())

	info := requireStatusErrorInfo(t, storageError)
	assert.Equal(t, "METRIC_UNAVAILABLE", info.GetReason())
	assert.Equal(t, "storage", info.GetMetadata()["metric"])
	assert.Equal(t, "42501", info.GetMetadata()["sqlstate"])
	assert.Equal(t, "42", info.GetMetadata()["sqlstate_class"])
	assert.Equal(t, "insufficient_privilege", info.GetMetadata()["condition_name"])
	assert.Equal(t, "query storage metrics", info.GetMetadata()["operation"])
	assert.Equal(t, "pg_catalog", info.GetMetadata()["schema_name"])
	assert.NotContains(t, info.GetMetadata(), "schemaName")

	postgresDetail := requireStatusPostgresErrorDetail(t, storageError)
	assert.Equal(t, "42501", postgresDetail.GetSqlstate())
	assert.Equal(t, "42", postgresDetail.GetSqlstateClass())
	assert.Equal(t, "insufficient_privilege", postgresDetail.GetConditionName())
	assert.Equal(t, "query storage metrics", postgresDetail.GetOperation())
	assert.Equal(t, "pg_catalog", postgresDetail.GetServerFields()["schema_name"])
}

func requireMetricPartialError(t *testing.T, partialErrors []*rpcstatus.Status, metric string) *rpcstatus.Status {
	t.Helper()

	for _, partialError := range partialErrors {
		info := statusErrorInfo(partialError)
		if info != nil && info.GetMetadata()["metric"] == metric {
			return partialError
		}
	}

	require.Failf(t, "missing partial error", "metric %q not found in %#v", metric, partialErrors)

	return nil
}

func requireStatusErrorInfo(t *testing.T, status *rpcstatus.Status) *errdetails.ErrorInfo {
	t.Helper()

	info := statusErrorInfo(status)
	require.NotNil(t, info)

	return info
}

func statusErrorInfo(status *rpcstatus.Status) *errdetails.ErrorInfo {
	for _, detail := range status.GetDetails() {
		var info errdetails.ErrorInfo
		if detail.MessageIs(&info) {
			if err := detail.UnmarshalTo(&info); err != nil {
				return nil
			}

			return &info
		}
	}

	return nil
}

func requireStatusPostgresErrorDetail(t *testing.T, status *rpcstatus.Status) *v1alpha1.PostgreSqlErrorDetail {
	t.Helper()

	for _, detail := range status.GetDetails() {
		var postgresDetail v1alpha1.PostgreSqlErrorDetail
		if detail.MessageIs(&postgresDetail) {
			require.NoError(t, detail.UnmarshalTo(&postgresDetail))

			return &postgresDetail
		}
	}

	require.Fail(t, "PostgreSqlErrorDetail detail not found")

	return nil
}
