package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func sampleColumns() []engine.Column {
	return []engine.Column{
		{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER, RawType: "bigint"},
		{Name: "email", DataType: api.DataType_DATA_TYPE_STRING, RawType: "text"},
		{Name: "metadata", DataType: api.DataType_DATA_TYPE_JSON, RawType: "jsonb"},
		{Name: "created_at", DataType: api.DataType_DATA_TYPE_TIMESTAMP, RawType: "timestamptz"},
	}
}

func mkLeaf(col string, op api.RowPredicate_Operator, vals ...*api.TableValue) *api.RowFilter {
	return &api.RowFilter{Node: &api.RowFilter_Predicate{Predicate: &api.RowPredicate{
		Column:   col,
		Operator: op,
		Values:   vals,
	}}}
}

func mkGroup(logic api.RowFilterGroup_Logic, children ...*api.RowFilter) *api.RowFilter {
	return &api.RowFilter{Node: &api.RowFilter_Group{Group: &api.RowFilterGroup{
		Logic:    logic,
		Children: children,
	}}}
}

func intVal(v int64) *api.TableValue {
	return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: v}}
}

func strVal(s string) *api.TableValue {
	return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: s}}
}

func TestValidateReadRowsRequest(t *testing.T) {
	t.Parallel()

	cols := sampleColumns()

	tests := []struct {
		name   string
		params engine.ReadRowsParams
		wantOK bool
		// substring expected in the error message (only checked when !wantOK)
		wantErr string
	}{
		{
			name:   "ok_no_filter",
			params: engine.ReadRowsParams{},
			wantOK: true,
		},
		{
			name: "page_size_above_hard_cap",
			params: engine.ReadRowsParams{
				PageSize: maxPageSize + 1,
			},
			wantErr: "page_size",
		},
		{
			name: "selected_columns_unknown",
			params: engine.ReadRowsParams{
				SelectedColumns: []string{"id", "nope"},
			},
			wantErr: `selected_columns: unknown column "nope"`,
		},
		{
			name: "selected_columns_duplicate",
			params: engine.ReadRowsParams{
				SelectedColumns: []string{"id", "email", "id"},
			},
			wantErr: `selected_columns[2]: column "id" repeated`,
		},
		{
			name: "order_by_unknown",
			params: engine.ReadRowsParams{
				OrderBy: []*api.RowOrder{{Column: "missing"}},
			},
			wantErr: `order_by[0].column: unknown column "missing"`,
		},
		{
			name: "filter_predicate_unknown_column",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("nope", api.RowPredicate_OPERATOR_EQUAL, intVal(1)),
			},
			wantErr: `filter.predicate.column: unknown column "nope"`,
		},
		{
			name: "like_on_int",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("id", api.RowPredicate_OPERATOR_LIKE, strVal("%foo%")),
			},
			wantErr: "LIKE requires a string column",
		},
		{
			name: "json_contains_on_text",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("email", api.RowPredicate_OPERATOR_JSON_CONTAINS, strVal(`{}`)),
			},
			wantErr: "JSON_CONTAINS requires a JSON/JSONB column",
		},
		{
			name: "between_arity",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("id", api.RowPredicate_OPERATOR_BETWEEN, intVal(1), intVal(2), intVal(3)),
			},
			wantErr: "BETWEEN requires exactly two values, got 3",
		},
		{
			name: "between_on_text",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("email", api.RowPredicate_OPERATOR_BETWEEN, strVal("a"), strVal("z")),
			},
			wantErr: "BETWEEN requires a numeric/date/time/timestamp column",
		},
		{
			name: "is_null_with_values",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("id", api.RowPredicate_OPERATOR_IS_NULL, intVal(1)),
			},
			wantErr: "takes no values",
		},
		{
			name: "in_no_values",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("id", api.RowPredicate_OPERATOR_IN),
			},
			wantErr: "requires at least one value",
		},
		{
			name: "equal_too_many_values",
			params: engine.ReadRowsParams{
				Filter: mkLeaf("id", api.RowPredicate_OPERATOR_EQUAL, intVal(1), intVal(2)),
			},
			wantErr: "takes exactly one value",
		},
		{
			name: "ok_recursive",
			params: engine.ReadRowsParams{
				Filter: mkGroup(api.RowFilterGroup_LOGIC_AND,
					mkLeaf("id", api.RowPredicate_OPERATOR_EQUAL, intVal(1)),
					mkGroup(api.RowFilterGroup_LOGIC_OR,
						mkLeaf("email", api.RowPredicate_OPERATOR_LIKE, strVal("%@a%")),
						mkLeaf("metadata", api.RowPredicate_OPERATOR_IS_NULL),
					),
				),
			},
			wantOK: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := validateReadRowsRequest(cols, tt.params)
			if tt.wantOK {
				require.NoError(t, err)
				return
			}

			require.Error(t, err)
			require.ErrorIs(t, err, engine.ErrQueryInvalid)
			assert.Contains(t, err.Error(), tt.wantErr,
				"error %q does not contain %q", err.Error(), tt.wantErr)
		})
	}
}

func TestValidateFilter_DepthCap(t *testing.T) {
	t.Parallel()

	// Build a chain of nested groups deeper than the cap.
	leaf := mkLeaf("id", api.RowPredicate_OPERATOR_EQUAL, intVal(1))

	cur := leaf
	for range maxFilterDepth + 2 {
		cur = mkGroup(api.RowFilterGroup_LOGIC_AND, cur)
	}

	err := validateReadRowsRequest(sampleColumns(), engine.ReadRowsParams{Filter: cur})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrQueryInvalid)
	assert.Contains(t, err.Error(), "exceeds depth")
}

func TestValidateFilter_NodeCap(t *testing.T) {
	t.Parallel()

	// One AND group with maxFilterNodes+5 leaves.
	leaves := make([]*api.RowFilter, 0, maxFilterNodes+5)
	for range maxFilterNodes + 5 {
		leaves = append(leaves, mkLeaf("id", api.RowPredicate_OPERATOR_EQUAL, intVal(1)))
	}

	root := mkGroup(api.RowFilterGroup_LOGIC_AND, leaves...)

	err := validateReadRowsRequest(sampleColumns(), engine.ReadRowsParams{Filter: root})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrQueryInvalid)
	assert.Contains(t, err.Error(), "more than")
}

func TestValidateReadRowsRequest_NilFilter(t *testing.T) {
	t.Parallel()

	require.NoError(t, validateReadRowsRequest(sampleColumns(), engine.ReadRowsParams{}))
}

func TestValidateFilter_RejectsUnsetOneof(t *testing.T) {
	t.Parallel()

	// A RowFilter whose Node oneof is unset is treated as a programming
	// error rather than an empty WHERE clause — surface it at the boundary.
	err := validateReadRowsRequest(sampleColumns(), engine.ReadRowsParams{
		Filter: &api.RowFilter{},
	})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrQueryInvalid)
	assert.Contains(t, err.Error(), "node oneof must be set")
}

func TestValidateReadRowsRequest_ErrIs(t *testing.T) {
	t.Parallel()

	err := validateReadRowsRequest(sampleColumns(), engine.ReadRowsParams{
		SelectedColumns: []string{"missing"},
	})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrQueryInvalid)
}
