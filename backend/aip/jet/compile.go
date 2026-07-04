package jet

import (
	"errors"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
)

// BuildClauses compiles a validated plan into the go-jet WHERE condition
// (filter AND keyset cursor; nil when neither applies) and ORDER BY clauses.
// Errors are internal invariant violations — BuildPlan already raised every
// client-attributable error.
func BuildClauses[Model any](schema *Schema[Model], plan *aip.Plan) (postgres.BoolExpression, []postgres.OrderByClause, error) {
	filterCond, err := buildFilterCondition(schema.cols, plan.ParsedFilter())
	if err != nil {
		return nil, nil, err
	}

	cursorCond, err := buildKeysetCondition(schema.cols, plan.OrderBy, plan.CursorValues)
	if err != nil {
		return nil, nil, err
	}

	return combineConditions(filterCond, cursorCond), orderByClauses(schema.cols, plan.OrderBy), nil
}

// orderByClauses converts an OrderBy into go-jet ORDER BY clauses.
func orderByClauses(cols Columns, order aip.OrderBy) []postgres.OrderByClause {
	clauses := make([]postgres.OrderByClause, len(order.Fields))
	for i, field := range order.Fields {
		col := cols[field.Path]
		if field.Direction == aip.Desc {
			clauses[i] = col.DESC()
		} else {
			clauses[i] = col.ASC()
		}
	}

	return clauses
}

// buildKeysetCondition builds the WHERE clause that skips past already-seen
// rows (keyset/cursor pagination). Given cursor values from the previous page's
// last row, it creates a condition that selects only rows "after" that position
// in the current sort order.
//
// For uniform-direction orderings (all ASC or all DESC — the common case),
// it uses PostgreSQL's native tuple comparison: ROW(col1, col2) > ROW(v1, v2).
// For mixed-direction orderings, it falls back to the traditional lexicographic
// OR-chain expansion, which is correct but more verbose.
func buildKeysetCondition(cols Columns, order aip.OrderBy, vals []any) (postgres.BoolExpression, error) {
	if len(vals) == 0 {
		return nil, nil //nolint:nilnil // No cursor is valid.
	}

	if len(order.Fields) == 0 {
		return nil, errors.New("no order fields provided")
	}

	if len(order.Fields) != len(vals) {
		return nil, errors.New("cursor/value length mismatch")
	}

	if order.IsUniformDirection() {
		return buildTupleComparison(cols, order, vals)
	}

	return buildLexicographicFallback(cols, order, vals)
}

// buildTupleComparison builds a ROW(col1, col2) > ROW(val1, val2) expression
// for uniform-direction ordering.
func buildTupleComparison(cols Columns, order aip.OrderBy, vals []any) (postgres.BoolExpression, error) {
	colExprs := make([]postgres.Expression, len(order.Fields))
	litVals := make([]postgres.Expression, len(vals))

	for i, f := range order.Fields {
		col, err := boundColumn(cols, f.Path)
		if err != nil {
			return nil, err
		}

		colExprs[i] = col

		lit, err := literal(col, vals[i])
		if err != nil {
			return nil, fmt.Errorf("field %q: %w", f.Path, err)
		}

		litVals[i] = lit
	}

	row := postgres.ROW(colExprs...)
	valRow := postgres.ROW(litVals...)

	if order.Fields[0].Direction == aip.Desc {
		return row.LT(valRow), nil
	}

	return row.GT(valRow), nil
}

// buildLexicographicFallback builds the traditional OR-chain keyset condition
// for mixed-direction orderings where tuple comparison cannot be used.
func buildLexicographicFallback(cols Columns, order aip.OrderBy, vals []any) (postgres.BoolExpression, error) {
	orConditions := make([]postgres.BoolExpression, 0, len(order.Fields))

	for i := range order.Fields {
		chain := make([]postgres.BoolExpression, 0, i+1)

		for j := range i {
			expr, err := binaryExpr(cols, order.Fields[j].Path, vals[j], "=")
			if err != nil {
				return nil, err
			}

			chain = append(chain, expr)
		}

		op := ">"
		if order.Fields[i].Direction == aip.Desc {
			op = "<"
		}

		cmp, err := binaryExpr(cols, order.Fields[i].Path, vals[i], op)
		if err != nil {
			return nil, err
		}

		chain = append(chain, cmp)
		orConditions = append(orConditions, postgres.AND(chain...))
	}

	return postgres.OR(orConditions...), nil
}

// buildFilterCondition compiles a validated filter expression tree into a
// go-jet BoolExpression. Returns nil for a nil tree, which combineConditions
// treats as a no-op. Operands are compiled depth-first left-to-right so bound
// arguments appear in the same order as the rawsql backend's.
func buildFilterCondition(cols Columns, expr aip.FilterExpr) (postgres.BoolExpression, error) {
	if expr == nil {
		return nil, nil //nolint:nilnil // No filter is valid.
	}

	switch n := expr.(type) {
	case aip.FilterAnd:
		operands, err := buildFilterOperands(cols, n.Operands)
		if err != nil {
			return nil, err
		}

		return postgres.AND(operands...), nil
	case aip.FilterOr:
		operands, err := buildFilterOperands(cols, n.Operands)
		if err != nil {
			return nil, err
		}

		return postgres.OR(operands...), nil
	case aip.FilterNot:
		operand, err := buildFilterCondition(cols, n.Operand)
		if err != nil {
			return nil, err
		}

		return postgres.NOT(operand), nil
	case aip.FilterCondition:
		compiled, err := filterExpr(cols, n)
		if err != nil {
			return nil, fmt.Errorf("filter field %q: %w", n.Field, err)
		}

		return compiled, nil
	default:
		return nil, fmt.Errorf("unsupported filter expression node %T", expr)
	}
}

func buildFilterOperands(cols Columns, exprs []aip.FilterExpr) ([]postgres.BoolExpression, error) {
	operands := make([]postgres.BoolExpression, 0, len(exprs))
	for _, e := range exprs {
		operand, err := buildFilterCondition(cols, e)
		if err != nil {
			return nil, err
		}

		operands = append(operands, operand)
	}

	return operands, nil
}

// filterExpr builds the go-jet predicate for one filter condition.
func filterExpr(cols Columns, cond aip.FilterCondition) (postgres.BoolExpression, error) {
	switch cond.Operator {
	case aip.OpEqual:
		return binaryExpr(cols, cond.Field, cond.Value, "=")
	case aip.OpNotEqual:
		return binaryExpr(cols, cond.Field, cond.Value, "<>")
	case aip.OpLess:
		return binaryExpr(cols, cond.Field, cond.Value, "<")
	case aip.OpLessEq:
		return binaryExpr(cols, cond.Field, cond.Value, "<=")
	case aip.OpGreater:
		return binaryExpr(cols, cond.Field, cond.Value, ">")
	case aip.OpGreaterEq:
		return binaryExpr(cols, cond.Field, cond.Value, ">=")
	case aip.OpContains:
		term, ok := cond.Value.(string)
		if !ok {
			return nil, errors.New("substring match requires a string value")
		}

		col, err := boundColumn(cols, cond.Field)
		if err != nil {
			return nil, err
		}

		// Emit `col ILIKE $n` so the pg_trgm GIN index can be used. go-jet has no
		// native ILIKE method, so build it via BinaryOperator. The pattern is a
		// bound parameter, so no explicit ESCAPE clause is needed.
		return postgres.BoolExp(postgres.BinaryOperator(col, postgres.String(aip.ContainsPattern(term)), "ILIKE")), nil
	default:
		return nil, fmt.Errorf("unsupported operator %q", cond.Operator)
	}
}

// combineConditions ANDs together non-nil conditions.
func combineConditions(conditions ...postgres.BoolExpression) postgres.BoolExpression {
	combined := make([]postgres.BoolExpression, 0, len(conditions))
	for _, condition := range conditions {
		if condition != nil {
			combined = append(combined, condition)
		}
	}

	if len(combined) == 0 {
		return nil
	}

	return postgres.AND(combined...)
}

// binaryExpr builds `col <op> value` with the value bound as a parameter.
// op is one of the plain SQL comparison operators (=, <>, <, >, ...). Value
// types are guaranteed by the field codecs, so a single literal conversion
// covers every operator; column/codec type agreement was checked by Bind.
func binaryExpr(cols Columns, path string, v any, op string) (postgres.BoolExpression, error) {
	col, err := boundColumn(cols, path)
	if err != nil {
		return nil, err
	}

	lit, err := literal(col, v)
	if err != nil {
		return nil, fmt.Errorf("field %q: %w", path, err)
	}

	return postgres.BoolExp(postgres.BinaryOperator(col, lit, op)), nil
}

// boundColumn looks up a path's column. Bind validated all orderable and
// filterable paths, so a miss is an internal invariant violation.
func boundColumn(cols Columns, path string) (postgres.Column, error) {
	col, ok := cols[path]
	if !ok || col == nil {
		return nil, fmt.Errorf("schema misconfiguration: field %q has no column binding", path)
	}

	return col, nil
}

// literal converts a cursor/filter value into a go-jet literal expression
// (rendered as a bound parameter). time.Time maps to timestamp or timestamptz
// depending on the column type so comparisons never go through an implicit
// timezone conversion.
func literal(col postgres.Column, v any) (postgres.Expression, error) {
	switch val := v.(type) {
	case string:
		return postgres.String(val), nil
	case bool:
		return postgres.Bool(val), nil
	case int64:
		return postgres.Int64(val), nil
	case time.Time:
		switch col.(type) {
		case postgres.TimestampzExpression:
			return postgres.TimestampzT(val), nil
		case postgres.TimestampExpression:
			return postgres.TimestampT(val), nil
		default:
			return nil, errors.New("column is not a timestamp(z) expression")
		}
	default:
		return nil, fmt.Errorf("unsupported value type %T", v)
	}
}
