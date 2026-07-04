package database

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type queryInsightsProviderFunc func(context.Context, resource.DatabaseName) (*engine.DatabaseQueryInsights, error)

func (f queryInsightsProviderFunc) GetDatabaseQueryInsights(ctx context.Context, db resource.DatabaseName) (*engine.DatabaseQueryInsights, error) {
	return f(ctx, db)
}

func TestGetDatabaseQueryInsightsConvertsLiveStats(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, queryInsightsProviderFunc(
		func(_ context.Context, db resource.DatabaseName) (*engine.DatabaseQueryInsights, error) {
			assert.Equal(t, "prod", db.InstanceID)
			assert.Equal(t, "app", db.DatabaseID)

			return &engine.DatabaseQueryInsights{
				QueryStatsAvailable: true,
				TableStatsAvailable: true,
				TopQueries: []engine.QueryRuntimeInsight{{
					QueryID:        123,
					Query:          "SELECT * FROM events WHERE account_id = $1",
					Calls:          42,
					TotalTimeMs:    840,
					MeanTimeMs:     20,
					TotalTimeRatio: 1,
				}},
				SequentialScanHotspots: []engine.SequentialScanHotspot{{
					SchemaName:           "public",
					TableName:            "events",
					SequentialScans:      12,
					SequentialTuplesRead: 120_000,
					IndexScans:           3,
					EstimatedLiveRows:    50_000,
					TotalSizeBytes:       268_435_456,
					SequentialScanRatio:  0.8,
				}},
				TableCacheHits: []engine.TableCacheHitInsight{{
					SchemaName:     "public",
					TableName:      "events",
					HeapBlocksHit:  900,
					HeapBlocksRead: 100,
					HitRatio:       0.9,
					TotalSizeBytes: 268_435_456,
				}},
			}, nil
		},
	))

	resp, err := service.GetDatabaseQueryInsights(context.Background(), connect.NewRequest(&v1alpha1.GetDatabaseQueryInsightsRequest{
		Name: "instances/prod/databases/app",
	}))

	require.NoError(t, err)

	insights := resp.Msg.GetQueryInsights()
	require.NotNil(t, insights)
	require.NotNil(t, insights.GetObservedAt())
	assert.True(t, insights.GetQueryStatsAvailable())
	assert.True(t, insights.GetTableStatsAvailable())
	require.Len(t, insights.GetTopQueries(), 1)
	assert.Equal(t, int64(123), insights.GetTopQueries()[0].GetQueryId())
	assert.Equal(t, "SELECT * FROM events WHERE account_id = $1", insights.GetTopQueries()[0].GetQuery())
	require.Len(t, insights.GetSequentialScanHotspots(), 1)
	assert.Equal(t, int64(120_000), insights.GetSequentialScanHotspots()[0].GetSequentialTuplesRead())
	require.Len(t, insights.GetTableCacheHits(), 1)
	assert.InEpsilon(t, 0.9, insights.GetTableCacheHits()[0].GetHitRatio(), 0.000001)
}

func TestGetDatabaseQueryInsightsReportsPartialErrors(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, queryInsightsProviderFunc(
		func(context.Context, resource.DatabaseName) (*engine.DatabaseQueryInsights, error) {
			return &engine.DatabaseQueryInsights{
				PartialErrors: []engine.OverviewMetricError{{
					Metric: "query_stats",
					Err: &engine.PostgresSQLError{
						Kind:          engine.PostgresSQLKindInvalidArgument,
						SQLState:      "42P01",
						SQLStateClass: "42",
						ConditionName: "undefined_table",
						Operation:     "query pg_stat_statements",
						Sentinel:      engine.ErrQueryInvalid,
					},
				}},
			}, nil
		},
	))

	resp, err := service.GetDatabaseQueryInsights(context.Background(), connect.NewRequest(&v1alpha1.GetDatabaseQueryInsightsRequest{
		Name: "instances/prod/databases/app",
	}))

	require.NoError(t, err)

	partialErrors := resp.Msg.GetPartialErrors()
	require.Len(t, partialErrors, 1)

	var info errdetails.ErrorInfo
	require.NoError(t, partialErrors[0].GetDetails()[0].UnmarshalTo(&info))
	assert.Equal(t, "QUERY_INSIGHTS_UNAVAILABLE", info.GetReason())
	assert.Equal(t, "query_stats", info.GetMetadata()["metric"])
	assert.Equal(t, "42P01", info.GetMetadata()["sqlstate"])
}

func TestConvertQueryInsightsToProtoReturnsEmptyPayloadWhenProviderHasNoStats(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	insights := convertQueryInsightsToProto(nil)

	require.NotNil(t, insights)
	require.NotNil(t, insights.GetObservedAt())
	assert.False(t, insights.GetQueryStatsAvailable())
	assert.False(t, insights.GetTableStatsAvailable())
	assert.Empty(t, insights.GetTopQueries())
}
