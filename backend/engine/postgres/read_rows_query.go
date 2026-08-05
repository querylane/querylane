package postgres

import (
	"fmt"
	"strings"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// buildReadRowsQuery produces the SELECT statement that drives ReadRows.
//
// Projection layout (left-to-right): public columns (optionally truncated
// for preview, with size companions appended by previewProjection), then
// trailing un-truncated cursor projections — one per ORDER BY column —
// aliased with cursorAliasSuffix so the row scanner can pick them out.
//
// LIMIT is always pageSize+1 so the caller can detect "more" without an
// extra COUNT(*).
func buildReadRowsQuery(params engine.ReadRowsParams, plan *paginationPlan) (string, []any, error) {
	args := &argList{}

	var b strings.Builder

	b.WriteString("SELECT ")

	projCols := make([]string, 0, len(plan.publicColumns)+len(plan.cursorColumns))

	for i, c := range plan.publicColumns {
		if plan.previewMode && i < len(plan.previewMask) && plan.previewMask[i] {
			projCols = append(projCols, previewProjection(c, plan.maxCellChars))
			continue
		}

		projCols = append(projCols, quoteIdent(c.Name))
	}

	for _, c := range plan.cursorColumns {
		projCols = append(projCols, columnRef(c.Name)+" AS "+quoteIdent(c.Name+cursorAliasSuffix))
	}

	if len(projCols) == 0 {
		b.WriteString("*")
	} else {
		b.WriteString(strings.Join(projCols, ", "))
	}

	b.WriteString(" FROM ")
	b.WriteString(quoteIdent(params.SchemaName))
	b.WriteString(".")
	b.WriteString(quoteIdent(params.TableName))

	whereParts := make([]string, 0, 2)

	if params.Filter != nil && params.Filter.GetNode() != nil {
		clause, err := buildFilterNode(args, params.Filter)
		if err != nil {
			return "", nil, err
		}

		if clause != "" {
			whereParts = append(whereParts, clause)
		}
	}

	if plan.strategy == api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET && len(plan.cursorValues) > 0 {
		cursorArgs := extractTableValues(plan.cursorValues)
		if len(cursorArgs) != len(plan.order) {
			return "", nil, fmt.Errorf("%w: cursor values do not match order shape", engine.ErrInvalidPageToken)
		}

		clause := keysetCursorPredicate(args, plan.order, cursorArgs)
		if clause != "" {
			whereParts = append(whereParts, "("+clause+")")
		}
	}

	if len(whereParts) > 0 {
		b.WriteString(" WHERE ")
		b.WriteString(strings.Join(whereParts, " AND "))
	}

	if len(plan.order) > 0 {
		b.WriteString(" ORDER BY ")

		for i, e := range plan.order {
			if i > 0 {
				b.WriteString(", ")
			}

			b.WriteString(quoteIdent(e.column))

			if e.dirAsc {
				b.WriteString(" ASC")
			} else {
				b.WriteString(" DESC")
			}

			switch e.nullOrder { //nolint:exhaustive // unspecified → PG default
			case api.RowOrder_NULL_ORDER_FIRST:
				b.WriteString(" NULLS FIRST")
			case api.RowOrder_NULL_ORDER_LAST:
				b.WriteString(" NULLS LAST")
			}
		}
	}

	// Fetch one extra row to detect "more" without an extra COUNT.
	fmt.Fprintf(&b, " LIMIT %d", params.PageSize+1)

	if plan.strategy == api.PaginationStrategy_PAGINATION_STRATEGY_OFFSET && plan.offset > 0 {
		fmt.Fprintf(&b, " OFFSET %d", plan.offset)
	}

	return b.String(), args.values(), nil
}

// buildFilterNode walks a RowFilter recursively and emits a SQL clause,
// appending parameterised values to args. Empty groups produce an empty
// clause.
func buildFilterNode(args *argList, filter *api.RowFilter) (string, error) {
	if filter == nil {
		return "", nil
	}

	switch node := filter.GetNode().(type) {
	case *api.RowFilter_Predicate:
		return buildPredicate(args, node.Predicate)
	case *api.RowFilter_Group:
		group := node.Group

		children := group.GetChildren()
		if len(children) == 0 {
			return "", nil
		}

		joiner := " AND "
		if group.GetLogic() == api.RowFilterGroup_LOGIC_OR {
			joiner = " OR "
		}

		parts := make([]string, 0, len(children))

		for _, child := range children {
			clause, err := buildFilterNode(args, child)
			if err != nil {
				return "", err
			}

			if clause == "" {
				continue
			}

			parts = append(parts, clause)
		}

		if len(parts) == 0 {
			return "", nil
		}

		if len(parts) == 1 {
			return parts[0], nil
		}

		return "(" + strings.Join(parts, joiner) + ")", nil
	default:
		return "", nil
	}
}

func buildPredicate(args *argList, pred *api.RowPredicate) (string, error) {
	col := quoteIdent(pred.GetColumn())

	var clause string

	switch pred.GetOperator() {
	case api.RowPredicate_OPERATOR_IS_NULL:
		clause = col + " IS NULL"
	case api.RowPredicate_OPERATOR_IS_NOT_NULL:
		clause = col + " IS NOT NULL"
	case api.RowPredicate_OPERATOR_IS_TRUE:
		clause = col + " IS TRUE"
	case api.RowPredicate_OPERATOR_IS_FALSE:
		clause = col + " IS FALSE"
	case api.RowPredicate_OPERATOR_IS_UNKNOWN:
		clause = col + " IS UNKNOWN"
	case api.RowPredicate_OPERATOR_IN, api.RowPredicate_OPERATOR_NOT_IN:
		placeholders := args.addAll(extractTableValues(pred.GetValues()))

		op := "IN"
		if pred.GetOperator() == api.RowPredicate_OPERATOR_NOT_IN {
			op = "NOT IN"
		}

		clause = fmt.Sprintf("%s %s (%s)", col, op, strings.Join(placeholders, ", "))
	case api.RowPredicate_OPERATOR_BETWEEN:
		placeholders := args.addAll(extractTableValues(pred.GetValues()))
		clause = fmt.Sprintf("%s BETWEEN %s AND %s", col, placeholders[0], placeholders[1])
	case api.RowPredicate_OPERATOR_JSON_CONTAINS:
		placeholder := args.add(extractTableValues(pred.GetValues())[0])
		clause = fmt.Sprintf("%s @> %s::jsonb", col, placeholder)
	case api.RowPredicate_OPERATOR_EQUAL,
		api.RowPredicate_OPERATOR_NOT_EQUAL,
		api.RowPredicate_OPERATOR_GREATER_THAN,
		api.RowPredicate_OPERATOR_GREATER_THAN_OR_EQUAL,
		api.RowPredicate_OPERATOR_LESS_THAN,
		api.RowPredicate_OPERATOR_LESS_THAN_OR_EQUAL,
		api.RowPredicate_OPERATOR_LIKE,
		api.RowPredicate_OPERATOR_ILIKE,
		api.RowPredicate_OPERATOR_MATCH,
		api.RowPredicate_OPERATOR_IMATCH,
		api.RowPredicate_OPERATOR_IS_DISTINCT:
		operator, ok := comparisonOperatorSQL(pred.GetOperator())
		if !ok {
			return "", fmt.Errorf("%w: unsupported comparison operator %s", engine.ErrQueryInvalid, pred.GetOperator())
		}

		columnExpression := col
		if pred.GetOperator() == api.RowPredicate_OPERATOR_MATCH || pred.GetOperator() == api.RowPredicate_OPERATOR_IMATCH {
			columnExpression += "::text"
		}

		placeholder := args.add(extractTableValues(pred.GetValues())[0])
		clause = fmt.Sprintf("%s %s %s", columnExpression, operator, placeholder)
	case api.RowPredicate_OPERATOR_UNSPECIFIED:
		return "", fmt.Errorf("%w: row predicate operator is required", engine.ErrQueryInvalid)
	default:
		return "", fmt.Errorf("%w: unsupported row predicate operator %s", engine.ErrQueryInvalid, pred.GetOperator())
	}

	if pred.GetNegated() {
		return "NOT (" + clause + ")", nil
	}

	return clause, nil
}

func comparisonOperatorSQL(operator api.RowPredicate_Operator) (string, bool) {
	switch operator { //nolint:exhaustive // non-comparison operators return false
	case api.RowPredicate_OPERATOR_EQUAL:
		return "=", true
	case api.RowPredicate_OPERATOR_NOT_EQUAL:
		return "!=", true
	case api.RowPredicate_OPERATOR_GREATER_THAN:
		return ">", true
	case api.RowPredicate_OPERATOR_GREATER_THAN_OR_EQUAL:
		return ">=", true
	case api.RowPredicate_OPERATOR_LESS_THAN:
		return "<", true
	case api.RowPredicate_OPERATOR_LESS_THAN_OR_EQUAL:
		return "<=", true
	case api.RowPredicate_OPERATOR_LIKE:
		return "LIKE", true
	case api.RowPredicate_OPERATOR_ILIKE:
		return "ILIKE", true
	case api.RowPredicate_OPERATOR_MATCH:
		return "~", true
	case api.RowPredicate_OPERATOR_IMATCH:
		return "~*", true
	case api.RowPredicate_OPERATOR_IS_DISTINCT:
		return "IS DISTINCT FROM", true
	default:
		return "", false
	}
}
