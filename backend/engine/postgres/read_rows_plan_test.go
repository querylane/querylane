package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestBuildResultColumnsForPlan(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		plan *paginationPlan
		want []*api.TableResultColumn
	}{
		{
			name: "uses catalog metadata and preview mask",
			plan: &paginationPlan{
				publicColumns: []engine.Column{
					{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER, RawType: "int8", IsNullable: false},
					{Name: "payload", DataType: api.DataType_DATA_TYPE_JSON, RawType: "jsonb", IsNullable: true},
				},
				previewMask: []bool{false, true},
			},
			want: []*api.TableResultColumn{
				{ColumnName: "id", DataType: api.DataType_DATA_TYPE_INTEGER, RawType: "int8", IsNullable: false, MayTruncate: false},
				{ColumnName: "payload", DataType: api.DataType_DATA_TYPE_JSON, RawType: "jsonb", IsNullable: true, MayTruncate: true},
			},
		},
		{
			name: "missing preview mask is non-truncating",
			plan: &paginationPlan{
				publicColumns: []engine.Column{
					{Name: "payload", DataType: api.DataType_DATA_TYPE_STRING, RawType: "text", IsNullable: true},
				},
			},
			want: []*api.TableResultColumn{
				{ColumnName: "payload", DataType: api.DataType_DATA_TYPE_STRING, RawType: "text", IsNullable: true, MayTruncate: false},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := buildResultColumnsForPlan(tt.plan)

			assert.Equal(t, tt.want, got)
		})
	}
}
