package postgres

import (
	"fmt"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	maxFilterDepth = 8
	maxFilterNodes = 256
)

// validateReadRowsRequest performs cheap pre-flight validation of the
// projected columns, ORDER BY, and filter tree against the table catalog
// before SQL is built. Errors are wrapped with engine.ErrQueryInvalid and
// carry a structured field path so the service layer can surface them as
// `InvalidArgument` field violations.
//
// v1 keeps validation deliberately bounded:
//   - column existence everywhere a column name appears.
//   - filter tree depth/node caps.
//   - operator arity (IS_NULL=0, IN/NOT_IN ≥ 1, BETWEEN=2, others=1).
//   - obvious operator/type mismatches (LIKE on int, JSON_CONTAINS on text,
//     BETWEEN on non-ordered types).
//
// Full PostgreSQL type-compatibility checks grow later.
func validateReadRowsRequest(columns []engine.Column, params engine.ReadRowsParams) error {
	// Non-positive page sizes are accepted here: callers normalize zero and
	// negative values to the service default. Validation only caps explicit
	// oversized requests before SQL construction.
	if params.PageSize > maxPageSize {
		return invalidAt("page_size", fmt.Sprintf("page size must be at most %d", maxPageSize))
	}

	idx := newColumnIndex(columns)

	seenSelectedColumns := make(map[string]struct{}, len(params.SelectedColumns))
	for i, col := range params.SelectedColumns {
		if !idx.has(col) {
			return invalidColumn("selected_columns", col)
		}

		if _, ok := seenSelectedColumns[col]; ok {
			return invalidAt(
				fmt.Sprintf("selected_columns[%d]", i),
				fmt.Sprintf("column %q repeated", col),
			)
		}

		seenSelectedColumns[col] = struct{}{}
	}

	for i, ord := range params.OrderBy {
		if !idx.has(ord.GetColumn()) {
			return invalidColumn(fmt.Sprintf("order_by[%d].column", i), ord.GetColumn())
		}
	}

	if params.Filter != nil {
		nodes := 0
		if err := validateFilter(params.Filter, idx, "filter", 0, &nodes); err != nil {
			return err
		}
	}

	return nil
}

type columnIndex struct {
	byName map[string]engine.Column
}

func newColumnIndex(cols []engine.Column) *columnIndex {
	m := make(map[string]engine.Column, len(cols))
	for _, c := range cols {
		m[c.Name] = c
	}

	return &columnIndex{byName: m}
}

func (c *columnIndex) has(name string) bool { _, ok := c.byName[name]; return ok }

func (c *columnIndex) get(name string) (engine.Column, bool) {
	col, ok := c.byName[name]
	return col, ok
}

func invalidColumn(path, name string) error {
	return engine.NewInvalidQueryError(path, fmt.Sprintf("unknown column %q", name))
}

func invalidAt(path, msg string) error {
	return engine.NewInvalidQueryError(path, msg)
}

// validateFilter walks the filter tree recursively, enforcing depth/node
// caps and per-predicate semantic checks.
func validateFilter(node *api.RowFilter, idx *columnIndex, path string, depth int, nodes *int) error {
	if node == nil {
		return nil
	}

	*nodes++
	if *nodes > maxFilterNodes {
		return invalidAt(path, fmt.Sprintf("filter has more than %d nodes", maxFilterNodes))
	}

	if depth > maxFilterDepth {
		return invalidAt(path, fmt.Sprintf("filter exceeds depth %d", maxFilterDepth))
	}

	switch n := node.GetNode().(type) {
	case *api.RowFilter_Group:
		group := n.Group

		children := group.GetChildren()
		for i, child := range children {
			childPath := fmt.Sprintf("%s.children[%d]", path, i)
			if err := validateFilter(child, idx, childPath, depth+1, nodes); err != nil {
				return err
			}
		}
	case *api.RowFilter_Predicate:
		return validatePredicate(n.Predicate, idx, path+".predicate")
	default:
		// Catches an unset oneof (nil n) or any future variant we haven't
		// taught the validator about. Rejecting here keeps an empty filter
		// from silently producing an unconstrained scan.
		return invalidAt(path, "node oneof must be set (group or predicate)")
	}

	return nil
}

func validatePredicate(pred *api.RowPredicate, idx *columnIndex, path string) error {
	col, ok := idx.get(pred.GetColumn())
	if !ok {
		return invalidColumn(path+".column", pred.GetColumn())
	}

	op := pred.GetOperator()
	values := pred.GetValues()

	if err := checkOperatorArity(op, len(values), path); err != nil {
		return err
	}

	if err := checkOperatorType(op, col, path); err != nil {
		return err
	}

	return nil
}

func checkOperatorArity(op api.RowPredicate_Operator, n int, path string) error {
	switch op { //nolint:exhaustive // default branch covers single-value operators
	case api.RowPredicate_OPERATOR_IS_NULL, api.RowPredicate_OPERATOR_IS_NOT_NULL:
		if n != 0 {
			return invalidAt(path+".values", fmt.Sprintf("%s takes no values, got %d", op, n))
		}
	case api.RowPredicate_OPERATOR_IN, api.RowPredicate_OPERATOR_NOT_IN:
		if n < 1 {
			return invalidAt(path+".values", fmt.Sprintf("%s requires at least one value", op))
		}
	case api.RowPredicate_OPERATOR_BETWEEN:
		if n != 2 {
			return invalidAt(path+".values", fmt.Sprintf("BETWEEN requires exactly two values, got %d", n))
		}
	case api.RowPredicate_OPERATOR_UNSPECIFIED:
		return invalidAt(path+".operator", "operator is required")
	default:
		if n != 1 {
			return invalidAt(path+".values", fmt.Sprintf("%s takes exactly one value, got %d", op, n))
		}
	}

	return nil
}

// checkOperatorType rejects obvious mismatches (LIKE on int, JSON_CONTAINS
// on text). Other type checks fall through to PostgreSQL.
func checkOperatorType(op api.RowPredicate_Operator, col engine.Column, path string) error {
	switch op { //nolint:exhaustive // most operators have no additional type rule
	case api.RowPredicate_OPERATOR_LIKE, api.RowPredicate_OPERATOR_ILIKE:
		if col.DataType != api.DataType_DATA_TYPE_STRING && col.DataType != api.DataType_DATA_TYPE_UNKNOWN {
			return invalidAt(path+".operator", fmt.Sprintf("%s requires a string column, got %s", op, col.RawType))
		}
	case api.RowPredicate_OPERATOR_JSON_CONTAINS:
		if col.DataType != api.DataType_DATA_TYPE_JSON {
			return invalidAt(path+".operator", "JSON_CONTAINS requires a JSON/JSONB column, got "+col.RawType)
		}
	case api.RowPredicate_OPERATOR_BETWEEN:
		switch col.DataType { //nolint:exhaustive // explicit allow-list
		case api.DataType_DATA_TYPE_INTEGER,
			api.DataType_DATA_TYPE_FLOAT,
			api.DataType_DATA_TYPE_DATE,
			api.DataType_DATA_TYPE_TIME,
			api.DataType_DATA_TYPE_TIMESTAMP,
			api.DataType_DATA_TYPE_UNKNOWN:
			// OK.
		default:
			return invalidAt(path+".operator", "BETWEEN requires a numeric/date/time/timestamp column, got "+col.RawType)
		}
	}

	return nil
}
