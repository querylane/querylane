package database_test

import (
	"strings"
	"testing"

	"buf.build/go/protovalidate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestDatabaseQueryInsightsProtoValidationRejectsLowSignalPayloads(t *testing.T) {
	t.Parallel()

	validator, err := protovalidate.New()
	require.NoError(t, err)

	observedAt := timestamppb.Now()

	oversizedQueries := make([]*v1alpha1.QueryRuntimeInsight, 11)
	for i := range oversizedQueries {
		oversizedQueries[i] = &v1alpha1.QueryRuntimeInsight{
			Query:          "SELECT 1",
			Calls:          1,
			TotalTimeMs:    1,
			MeanTimeMs:     1,
			TotalTimeRatio: 1,
		}
	}

	tests := []struct {
		name          string
		msg           proto.Message
		wantViolation string
	}{
		{
			name:          "response requires query insights payload",
			msg:           &v1alpha1.GetDatabaseQueryInsightsResponse{},
			wantViolation: "query_insights",
		},
		{
			name: "top queries are capped to the backend limit",
			msg: &v1alpha1.DatabaseQueryInsights{
				ObservedAt:             observedAt,
				QueryStatsAvailable:    true,
				TableStatsAvailable:    true,
				TopQueries:             oversizedQueries,
				TableCacheHits:         []*v1alpha1.TableCacheHitInsight{},
				SequentialScanHotspots: []*v1alpha1.SequentialScanHotspot{},
			},
			wantViolation: "top_queries",
		},
		{
			name: "database insights require an observation timestamp",
			msg: &v1alpha1.DatabaseQueryInsights{
				QueryStatsAvailable: true,
			},
			wantViolation: "observed_at",
		},
		{
			name: "stats rows require their availability flag",
			msg: &v1alpha1.DatabaseQueryInsights{
				ObservedAt: observedAt,
				TopQueries: []*v1alpha1.QueryRuntimeInsight{
					{
						Query:          "SELECT 1",
						Calls:          1,
						TotalTimeMs:    1,
						MeanTimeMs:     1,
						TotalTimeRatio: 1,
					},
				},
			},
			wantViolation: "top_queries_empty_when_unavailable",
		},
		{
			name: "table rows require their availability flag",
			msg: &v1alpha1.DatabaseQueryInsights{
				ObservedAt: observedAt,
				TableCacheHits: []*v1alpha1.TableCacheHitInsight{
					{
						SchemaName:     "public",
						TableName:      "events",
						HeapBlocksHit:  1,
						HeapBlocksRead: 0,
						HitRatio:       1,
					},
				},
			},
			wantViolation: "table_insights_empty_when_unavailable",
		},
		{
			name: "query rows require at least one call",
			msg: &v1alpha1.QueryRuntimeInsight{
				Query:          "",
				Calls:          0,
				TotalTimeMs:    1,
				MeanTimeMs:     1,
				TotalTimeRatio: 1,
			},
			wantViolation: "calls",
		},
		{
			name: "table hotspots require qualified table names",
			msg: &v1alpha1.SequentialScanHotspot{
				SequentialScans:     1,
				SequentialScanRatio: 1,
			},
			wantViolation: "schema_name",
		},
		{
			name: "cache hit ratio requires observed heap blocks",
			msg: &v1alpha1.TableCacheHitInsight{
				SchemaName: "public",
				TableName:  "events",
				HitRatio:   0.9,
			},
			wantViolation: "cache_hit_empty_ratio_zero",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validator.Validate(tt.msg)
			require.Error(t, err)

			var valErr *protovalidate.ValidationError
			require.ErrorAs(t, err, &valErr)

			assert.Contains(t, queryInsightViolationSummary(valErr), tt.wantViolation)
		})
	}
}

func queryInsightViolationSummary(err *protovalidate.ValidationError) string {
	parts := make([]string, 0, len(err.Violations))
	for _, violation := range err.Violations {
		parts = append(parts, protovalidate.FieldPathString(violation.Proto.GetField())+":"+violation.Proto.GetRuleId())
	}

	return strings.Join(parts, "\n")
}
