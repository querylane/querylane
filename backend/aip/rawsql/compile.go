package rawsql

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/querylane/querylane/backend/aip"
)

// Clauses contains generated PostgreSQL clauses for a validated list-query plan.
type Clauses struct {
	Where   string
	Args    []any
	OrderBy string
	Limit   int32
}

// BuildClauses converts a validated plan into PostgreSQL WHERE/ORDER BY
// fragments with placeholders starting at $placeholderStart. Errors are
// internal invariant violations — BuildPlan already raised every
// client-attributable error.
//
// The filter and cursor predicates share a single builder and are combined
// here into one Where string. The filter predicate MUST be built first because
// placeholders ($n) are positional — filter params must precede cursor params.
// Empty fragments are skipped before joining: joinPredicates does not skip "",
// so joining ["", cursor] would emit invalid "() AND (cursor)". assembleQuery
// stays unaware of the filter/cursor distinction.
func BuildClauses[Model any](schema *Schema[Model], plan *aip.Plan, placeholderStart int) (*Clauses, error) {
	builder := argBuilder{next: placeholderStart}

	filterWhere, err := buildFilterPredicate(&builder, schema.exprs, plan.ParsedFilter())
	if err != nil {
		return nil, err
	}

	cursorWhere, err := buildKeysetPredicate(&builder, schema.exprs, plan.OrderBy, plan.CursorValues)
	if err != nil {
		return nil, err
	}

	orderBy, err := buildOrderBy(schema.exprs, plan.OrderBy)
	if err != nil {
		return nil, err
	}

	var parts []string
	if filterWhere != "" {
		parts = append(parts, filterWhere)
	}

	if cursorWhere != "" {
		parts = append(parts, cursorWhere)
	}

	return &Clauses{
		Where:   joinPredicates(parts, "AND"),
		Args:    builder.args,
		OrderBy: orderBy,
		Limit:   plan.PageSize + 1,
	}, nil
}

// buildFilterPredicate compiles a validated filter expression tree into one
// parameterized, fully parenthesized predicate. Returns "" for a nil tree.
// Operands are compiled depth-first left-to-right. Every returned fragment is
// wrapped in parentheses, so composing it with AND/OR/NOT or the cursor
// predicate can never change its precedence.
func buildFilterPredicate(b *argBuilder, exprs Exprs, expr aip.FilterExpr) (string, error) {
	if expr == nil {
		return "", nil
	}

	switch n := expr.(type) {
	case aip.FilterAnd:
		return buildFilterJunction(b, exprs, n.Operands, "AND")
	case aip.FilterOr:
		return buildFilterJunction(b, exprs, n.Operands, "OR")
	case aip.FilterNot:
		operand, err := buildFilterPredicate(b, exprs, n.Operand)
		if err != nil {
			return "", err
		}

		return "(NOT " + operand + ")", nil
	case aip.FilterCondition:
		return buildFilterLeaf(b, exprs, n)
	default:
		return "", fmt.Errorf("unsupported filter expression node %T", expr)
	}
}

func buildFilterJunction(b *argBuilder, exprs Exprs, operands []aip.FilterExpr, op string) (string, error) {
	fragments := make([]string, 0, len(operands))
	for _, operand := range operands {
		fragment, err := buildFilterPredicate(b, exprs, operand)
		if err != nil {
			return "", err
		}

		fragments = append(fragments, fragment)
	}

	return "(" + strings.Join(fragments, " "+op+" ") + ")", nil
}

func buildFilterLeaf(b *argBuilder, exprs Exprs, cond aip.FilterCondition) (string, error) {
	expr, err := boundExpr(exprs, cond.Field)
	if err != nil {
		return "", err
	}

	switch cond.Operator {
	case aip.OpEqual:
		return fmt.Sprintf("(%s = %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpNotEqual:
		return fmt.Sprintf("(%s <> %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpLess:
		return fmt.Sprintf("(%s < %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpLessEq:
		return fmt.Sprintf("(%s <= %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpGreater:
		return fmt.Sprintf("(%s > %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpGreaterEq:
		return fmt.Sprintf("(%s >= %s)", expr, b.placeholder(cond.Value)), nil
	case aip.OpContains:
		term, ok := cond.Value.(string)
		if !ok {
			return "", fmt.Errorf("filter field %q: substring match requires a string value", cond.Field)
		}

		return fmt.Sprintf("(%s ILIKE %s)", expr, b.placeholder(aip.ContainsPattern(term))), nil
	default:
		return "", fmt.Errorf("filter field %q: unsupported operator %q", cond.Field, cond.Operator)
	}
}

// argBuilder allocates positional placeholders and collects their bound values.
type argBuilder struct {
	args []any
	next int
}

func (b *argBuilder) placeholder(value any) string {
	b.args = append(b.args, value)
	placeholder := fmt.Sprintf("$%d", b.next)
	b.next++

	return placeholder
}

// buildKeysetPredicate builds the WHERE fragment that skips past already-seen
// rows. It uses ROW() tuple comparison for uniform-direction orderings and a
// lexicographic OR-chain for mixed ones.
func buildKeysetPredicate(b *argBuilder, exprs Exprs, order aip.OrderBy, cursorValues []any) (string, error) {
	if len(cursorValues) == 0 {
		return "", nil
	}

	if len(order.Fields) == 0 {
		return "", errors.New("no order fields provided")
	}

	if len(order.Fields) != len(cursorValues) {
		return "", errors.New("cursor/value length mismatch")
	}

	if order.IsUniformDirection() {
		return buildTupleComparison(b, exprs, order, cursorValues)
	}

	orChains := make([]string, 0, len(order.Fields))
	for i := range order.Fields {
		chain := make([]string, 0, i+1)

		for j := range i {
			expr, err := boundExpr(exprs, order.Fields[j].Path)
			if err != nil {
				return "", err
			}

			chain = append(chain, fmt.Sprintf("(%s = %s)", expr, b.placeholder(cursorValues[j])))
		}

		cmp, err := buildDirectionPredicate(b, exprs, order.Fields[i], cursorValues[i])
		if err != nil {
			return "", err
		}

		chain = append(chain, cmp)
		orChains = append(orChains, joinPredicates(chain, "AND"))
	}

	return joinPredicates(orChains, "OR"), nil
}

// buildTupleComparison builds a ROW(col1, col2) > ROW($1, $2) predicate for
// uniform-direction orderings so all callers produce index-friendly tuple
// comparisons.
func buildTupleComparison(b *argBuilder, exprs Exprs, order aip.OrderBy, cursorValues []any) (string, error) {
	cols := make([]string, len(order.Fields))
	placeholders := make([]string, len(cursorValues))

	for i, f := range order.Fields {
		expr, err := boundExpr(exprs, f.Path)
		if err != nil {
			return "", err
		}

		if err := validateCursorValueType(cursorValues[i]); err != nil {
			return "", err
		}

		cols[i] = expr
		placeholders[i] = b.placeholder(cursorValues[i])
	}

	operator := ">"
	if order.Fields[0].Direction == aip.Desc {
		operator = "<"
	}

	return fmt.Sprintf("(ROW(%s) %s ROW(%s))",
		strings.Join(cols, ", "), operator, strings.Join(placeholders, ", ")), nil
}

func buildDirectionPredicate(b *argBuilder, exprs Exprs, orderField aip.OrderField, value any) (string, error) {
	expr, err := boundExpr(exprs, orderField.Path)
	if err != nil {
		return "", err
	}

	operator := ">"
	if orderField.Direction == aip.Desc {
		operator = "<"
	}

	if err := validateCursorValueType(value); err != nil {
		return "", err
	}

	return fmt.Sprintf("(%s %s %s)", expr, operator, b.placeholder(value)), nil
}

// validateCursorValueType rejects value types no codec produces. Cursor values
// come from codec decodes, so anything else is an internal invariant violation.
func validateCursorValueType(value any) error {
	switch value.(type) {
	case string, bool, int64, time.Time:
		return nil
	default:
		return fmt.Errorf("unsupported cursor type %T", value)
	}
}

func buildOrderBy(exprs Exprs, order aip.OrderBy) (string, error) {
	parts := make([]string, 0, len(order.Fields))
	for _, field := range order.Fields {
		expr, err := boundExpr(exprs, field.Path)
		if err != nil {
			return "", err
		}

		direction := "ASC"
		if field.Direction == aip.Desc {
			direction = "DESC"
		}

		parts = append(parts, fmt.Sprintf("%s %s", expr, direction))
	}

	return strings.Join(parts, ", "), nil
}

// boundExpr looks up a path's SQL expression. Bind validated all orderable
// and filterable paths, so a miss is an internal invariant violation.
func boundExpr(exprs Exprs, path string) (string, error) {
	expr := exprs[path]
	if expr == "" {
		return "", fmt.Errorf("schema misconfiguration: field %q has no SQL expression binding", path)
	}

	return expr, nil
}

// joinPredicates combines already-parenthesized predicates with the given
// operator. Multi-predicate results are wrapped in one outer pair of
// parentheses so callers can append them to an existing WHERE clause with
// AND without the operator escaping the base condition (e.g.
// "base AND (chain1 OR chain2)" instead of "base AND chain1 OR chain2").
func joinPredicates(predicates []string, op string) string {
	switch len(predicates) {
	case 0:
		return ""
	case 1:
		return predicates[0]
	default:
		return "(" + strings.Join(predicates, " "+op+" ") + ")"
	}
}
