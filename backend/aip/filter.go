package aip

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

// FilterOperator identifies the comparison used by a single filter condition.
type FilterOperator int

const (
	// OpEqual is the "=" operator.
	OpEqual FilterOperator = iota
	// OpNotEqual is the "!=" operator.
	OpNotEqual
	// OpContains is the ":" operator: a case-insensitive substring match
	// (AIP-160's HAS spelling, restricted to string fields in this subset).
	OpContains
	// OpLess is the "<" operator (int64/timestamp fields).
	OpLess
	// OpLessEq is the "<=" operator (int64/timestamp fields).
	OpLessEq
	// OpGreater is the ">" operator (int64/timestamp fields).
	OpGreater
	// OpGreaterEq is the ">=" operator (int64/timestamp fields).
	OpGreaterEq
)

// String renders the operator using its filter-grammar spelling.
func (op FilterOperator) String() string {
	switch op {
	case OpEqual:
		return "="
	case OpNotEqual:
		return "!="
	case OpContains:
		return ":"
	case OpLess:
		return "<"
	case OpLessEq:
		return "<="
	case OpGreater:
		return ">"
	case OpGreaterEq:
		return ">="
	default:
		return "unknown"
	}
}

// FilterExpr is a node in a validated, schema-aware filter expression tree.
// The SQL compiler translates it into parameterized predicates. Leaves are
// FilterCondition; interior nodes are FilterAnd, FilterOr, and FilterNot.
type FilterExpr interface {
	isFilterExpr()
}

// FilterAnd is the conjunction of two or more sub-expressions.
type FilterAnd struct {
	Operands []FilterExpr
}

func (FilterAnd) isFilterExpr() {}

// FilterOr is the disjunction of two or more sub-expressions.
type FilterOr struct {
	Operands []FilterExpr
}

func (FilterOr) isFilterExpr() {}

// FilterNot negates its operand.
type FilterNot struct {
	Operand FilterExpr
}

func (FilterNot) isFilterExpr() {}

// FilterCondition is a validated, schema-aware filter condition. Value holds
// the coerced Go value (string, bool, int64, or time.Time, matching the field
// codec); the compiler translates it into a parameterized predicate.
type FilterCondition struct {
	Field    string
	Operator FilterOperator
	Value    any
}

func (FilterCondition) isFilterExpr() {}

// Abuse guards bounding pathological filter inputs before any compilation.
const (
	maxFilterBytes   = 1024
	maxConditions    = 16
	maxNestingDepth  = 8
	andKeyword       = "AND"
	orKeyword        = "OR"
	notKeyword       = "NOT"
	rfc3339MinLength = len("2006-01-02T15:04:05Z")
)

// Grammar
//
// parseFilter implements a curated subset of AIP-160
// (https://google.aip.dev/160), keeping the spec's counter-intuitive
// precedence: OR binds TIGHTER than AND, so `a AND b OR c` means
// `a AND (b OR c)`. Keywords are case-insensitive.
//
// Productions, bottom-up:
//
//	restriction = ident op value
//	simple      = "(" expression ")" | restriction
//	term        = [ NOT | "-" ] simple
//	factor      = term { OR term }
//	expression  = factor { AND factor }
//	op          = "=" | "!=" | ":" | "<" | "<=" | ">" | ">="
//	value       = quoted string | bare token (true/false/integers)
//
// Not supported (rejected with ErrInvalidFilter): bare fuzzy-match terms,
// function calls, dotted traversal, wildcard string matching.

// rawExpr is a parsed but not yet schema-validated expression node.
type rawExpr interface {
	isRawExpr()
}

type rawAnd struct{ operands []rawExpr }

func (rawAnd) isRawExpr() {}

type rawOr struct{ operands []rawExpr }

func (rawOr) isRawExpr() {}

type rawNot struct{ operand rawExpr }

func (rawNot) isRawExpr() {}

// rawCondition is a single lexed condition. It is schema-free: value is the
// unescaped lexeme and quoted records whether the source was a quoted string
// (so validateFilter can enforce per-codec literal rules).
type rawCondition struct {
	field  string
	op     FilterOperator
	value  string
	quoted bool
}

func (rawCondition) isRawExpr() {}

// tokenKind classifies lexer output.
type tokenKind int

const (
	tokBare   tokenKind = iota // unquoted word: idents, keywords, bools, ints
	tokString                  // quoted string, unescaped
	tokOp                      // = != : < <= > >=
	tokLParen
	tokRParen
	tokMinus
	tokEOF
)

type token struct {
	kind tokenKind
	text string
	op   FilterOperator // valid when kind == tokOp
}

// parseFilter parses the filter subset into a raw expression tree. It returns
// nil for an empty/whitespace-only filter. All coercion and schema validation
// happen later in validateFilter; parseFilter only builds structure.
func parseFilter(raw string) (rawExpr, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil //nolint:nilnil // An empty filter is valid and compiles to no predicate.
	}

	if len(raw) > maxFilterBytes {
		return nil, fmt.Errorf("%w: filter exceeds %d bytes", ErrInvalidFilter, maxFilterBytes)
	}

	toks, err := lexFilter(raw)
	if err != nil {
		return nil, err
	}

	p := &parser{toks: toks}

	expr, err := p.parseExpression(0)
	if err != nil {
		return nil, err
	}

	if p.peek().kind != tokEOF {
		return nil, fmt.Errorf("%w: unexpected %q after expression", ErrInvalidFilter, p.peek().text)
	}

	return expr, nil
}

// lexFilter tokenizes the filter string. Quoted values keep their unescaped
// content; everything else is split on structural characters and whitespace.
func lexFilter(s string) ([]token, error) {
	var toks []token

	for i := 0; i < len(s); {
		c := s[i]

		switch {
		case isFilterSpace(c):
			i++
		case c == '(':
			toks = append(toks, token{kind: tokLParen, text: "("})
			i++
		case c == ')':
			toks = append(toks, token{kind: tokRParen, text: ")"})
			i++
		case c == '-':
			toks = append(toks, token{kind: tokMinus, text: "-"})
			i++
		case c == '"' || c == '\'':
			value, width, err := lexQuoted(s[i:])
			if err != nil {
				return nil, err
			}

			toks = append(toks, token{kind: tokString, text: value})
			i += width
		default:
			if op, width, ok := lexOperator(s[i:]); ok {
				toks = append(toks, token{kind: tokOp, text: op.String(), op: op})
				i += width

				continue
			}

			word, width, err := lexBare(s[i:])
			if err != nil {
				return nil, err
			}

			toks = append(toks, token{kind: tokBare, text: word})
			i += width
		}
	}

	return append(toks, token{kind: tokEOF, text: "<end of filter>"}), nil
}

// lexOperator matches a comparison operator at the start of s, longest first.
func lexOperator(s string) (FilterOperator, int, bool) {
	switch {
	case strings.HasPrefix(s, "!="):
		return OpNotEqual, 2, true
	case strings.HasPrefix(s, "<="):
		return OpLessEq, 2, true
	case strings.HasPrefix(s, ">="):
		return OpGreaterEq, 2, true
	case strings.HasPrefix(s, "="):
		return OpEqual, 1, true
	case strings.HasPrefix(s, ":"):
		return OpContains, 1, true
	case strings.HasPrefix(s, "<"):
		return OpLess, 1, true
	case strings.HasPrefix(s, ">"):
		return OpGreater, 1, true
	default:
		return 0, 0, false
	}
}

// lexQuoted consumes a quoted value with the spec's backslash escape rules:
// `\\` -> `\` and `\<quote>` -> `<quote>`. Any other escape, a dangling
// backslash, or an unterminated value is an error. Returns the unescaped
// content and the number of source bytes consumed (including both quotes).
func lexQuoted(s string) (string, int, error) {
	quote := s[0]

	var b strings.Builder

	for i := 1; i < len(s); {
		c := s[i]

		if c == '\\' {
			if i+1 >= len(s) {
				return "", 0, fmt.Errorf("%w: dangling backslash in quoted value", ErrInvalidFilter)
			}

			next := s[i+1]
			if next != '\\' && next != quote {
				return "", 0, fmt.Errorf("%w: invalid escape %q in quoted value", ErrInvalidFilter, `\`+string(next))
			}

			b.WriteByte(next)

			i += 2

			continue
		}

		if c == quote {
			return b.String(), i + 1, nil
		}

		b.WriteByte(c)

		i++
	}

	return "", 0, fmt.Errorf("%w: unterminated quoted value", ErrInvalidFilter)
}

// lexBare consumes a run of bare-word bytes (letters, digits, underscore).
func lexBare(s string) (string, int, error) {
	i := 0
	for i < len(s) && isBareChar(s[i]) {
		i++
	}

	if i == 0 {
		return "", 0, fmt.Errorf("%w: unexpected character %q", ErrInvalidFilter, string(s[0]))
	}

	return s[:i], i, nil
}

func isBareChar(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
}

func isFilterSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

// parser is a recursive-descent parser over the token stream.
type parser struct {
	toks   []token
	pos    int
	leaves int
}

func (p *parser) peek() token {
	return p.toks[p.pos]
}

func (p *parser) advance() {
	if p.toks[p.pos].kind != tokEOF {
		p.pos++
	}
}

// keyword reports whether the next token is the given bare keyword
// (case-insensitive) and consumes it if so.
func (p *parser) keyword(kw string) bool {
	t := p.peek()
	if t.kind == tokBare && strings.EqualFold(t.text, kw) {
		p.pos++

		return true
	}

	return false
}

// parseExpression parses `factor { AND factor }` — AND is the LOWEST
// precedence operator in AIP-160.
func (p *parser) parseExpression(depth int) (rawExpr, error) {
	first, err := p.parseFactor(depth)
	if err != nil {
		return nil, err
	}

	operands := []rawExpr{first}

	for p.keyword(andKeyword) {
		next, nextErr := p.parseFactor(depth)
		if nextErr != nil {
			return nil, nextErr
		}

		operands = append(operands, next)
	}

	if len(operands) == 1 {
		return operands[0], nil
	}

	return rawAnd{operands: operands}, nil
}

// parseFactor parses `term { OR term }` — OR binds tighter than AND.
func (p *parser) parseFactor(depth int) (rawExpr, error) {
	first, err := p.parseTerm(depth)
	if err != nil {
		return nil, err
	}

	operands := []rawExpr{first}

	for p.keyword(orKeyword) {
		next, nextErr := p.parseTerm(depth)
		if nextErr != nil {
			return nil, nextErr
		}

		operands = append(operands, next)
	}

	if len(operands) == 1 {
		return operands[0], nil
	}

	return rawOr{operands: operands}, nil
}

// parseTerm parses an optionally negated simple: `[ NOT | "-" ] simple`.
func (p *parser) parseTerm(depth int) (rawExpr, error) {
	negated := p.keyword(notKeyword)
	if !negated && p.peek().kind == tokMinus {
		p.pos++
		negated = true
	}

	inner, err := p.parseSimple(depth)
	if err != nil {
		return nil, err
	}

	if negated {
		return rawNot{operand: inner}, nil
	}

	return inner, nil
}

// parseSimple parses a parenthesized expression or a single restriction.
func (p *parser) parseSimple(depth int) (rawExpr, error) {
	if depth >= maxNestingDepth {
		return nil, fmt.Errorf("%w: filter nests deeper than %d levels", ErrInvalidFilter, maxNestingDepth)
	}

	if p.peek().kind == tokLParen {
		p.pos++

		inner, err := p.parseExpression(depth + 1)
		if err != nil {
			return nil, err
		}

		if p.peek().kind != tokRParen {
			return nil, fmt.Errorf("%w: missing closing parenthesis, got %q", ErrInvalidFilter, p.peek().text)
		}

		p.pos++

		return inner, nil
	}

	return p.parseRestriction()
}

// parseRestriction parses `ident op value`.
func (p *parser) parseRestriction() (rawExpr, error) {
	ident := p.peek()
	if ident.kind != tokBare {
		return nil, fmt.Errorf("%w: expected a field name, got %q", ErrInvalidFilter, ident.text)
	}

	if isKeyword(ident.text) {
		return nil, fmt.Errorf("%w: %q is a reserved keyword", ErrInvalidFilter, ident.text)
	}

	if err := validateIdentifier(ident.text); err != nil {
		return nil, err
	}

	p.advance()

	opTok := p.peek()
	if opTok.kind != tokOp {
		return nil, fmt.Errorf("%w: field %q must be followed by an operator (=, !=, :, <, <=, >, >=), got %q",
			ErrInvalidFilter, ident.text, opTok.text)
	}

	p.advance()

	value, quoted, err := p.parseValue(ident.text)
	if err != nil {
		return nil, err
	}

	p.leaves++
	if p.leaves > maxConditions {
		return nil, fmt.Errorf("%w: filter has more than %d conditions", ErrInvalidFilter, maxConditions)
	}

	return rawCondition{field: ident.text, op: opTok.op, value: value, quoted: quoted}, nil
}

// parseValue parses a restriction's value: a quoted string or a bare token
// (bool or integer, with optional leading minus).
func (p *parser) parseValue(field string) (string, bool, error) {
	t := p.peek()

	switch t.kind {
	case tokString:
		p.advance()

		return t.text, true, nil
	case tokMinus:
		p.advance()

		num := p.peek()
		if num.kind != tokBare {
			return "", false, fmt.Errorf("%w: condition for field %q has a dangling minus", ErrInvalidFilter, field)
		}

		p.advance()

		return "-" + num.text, false, nil
	case tokBare:
		if isKeyword(t.text) {
			return "", false, fmt.Errorf("%w: condition for field %q has no value", ErrInvalidFilter, field)
		}

		p.advance()

		return t.text, false, nil
	case tokOp, tokLParen, tokRParen, tokEOF:
		return "", false, fmt.Errorf("%w: condition for field %q has no value", ErrInvalidFilter, field)
	default:
		return "", false, fmt.Errorf("%w: condition for field %q has no value", ErrInvalidFilter, field)
	}
}

func isKeyword(s string) bool {
	return strings.EqualFold(s, andKeyword) || strings.EqualFold(s, orKeyword) || strings.EqualFold(s, notKeyword)
}

// validateIdentifier checks a bare field name: a letter or underscore followed
// by letters, digits, or underscores.
func validateIdentifier(field string) error {
	for i := range len(field) {
		c := field[i]

		isLetter := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
		isDigit := c >= '0' && c <= '9'

		if i == 0 && !isLetter {
			return fmt.Errorf("%w: invalid field name %q", ErrInvalidFilter, field)
		}

		if !isLetter && !isDigit {
			return fmt.Errorf("%w: invalid field name %q", ErrInvalidFilter, field)
		}
	}

	return nil
}

// validateFilter turns a raw expression tree into a schema-aware FilterExpr:
// every leaf's field must exist and be filterable, the operator must be
// allowed for the field, and the value must coerce to the field's codec type
// (and lie within any bounded FilterValues set). Returns nil for nil input.
func validateFilter[M any](schema *Schema[M], raw rawExpr) (FilterExpr, error) {
	if raw == nil {
		return nil, nil //nolint:nilnil // An empty filter is valid and compiles to no predicate.
	}

	switch n := raw.(type) {
	case rawAnd:
		operands, err := validateOperands(schema, n.operands)
		if err != nil {
			return nil, err
		}

		return FilterAnd{Operands: operands}, nil
	case rawOr:
		operands, err := validateOperands(schema, n.operands)
		if err != nil {
			return nil, err
		}

		return FilterOr{Operands: operands}, nil
	case rawNot:
		operand, err := validateFilter(schema, n.operand)
		if err != nil {
			return nil, err
		}

		return FilterNot{Operand: operand}, nil
	case rawCondition:
		return validateCondition(schema, n)
	default:
		return nil, fmt.Errorf("%w: unsupported expression node %T", ErrInvalidFilter, raw)
	}
}

func validateOperands[M any](schema *Schema[M], raws []rawExpr) ([]FilterExpr, error) {
	operands := make([]FilterExpr, 0, len(raws))
	for _, r := range raws {
		operand, err := validateFilter(schema, r)
		if err != nil {
			return nil, err
		}

		operands = append(operands, operand)
	}

	return operands, nil
}

func validateCondition[M any](schema *Schema[M], rc rawCondition) (FilterExpr, error) {
	field, ok := schema.fields[rc.field]
	if !ok || !field.Filterable {
		return nil, newFilterFieldError(rc.field, schema.filterableFields())
	}

	if !slices.Contains(allowedOps(field), rc.op) {
		return nil, fmt.Errorf("%w: operator %q not allowed for field %q", ErrInvalidFilter, rc.op, rc.field)
	}

	value, err := coerceFilterValue(field, rc)
	if err != nil {
		return nil, err
	}

	return FilterCondition{Field: rc.field, Operator: rc.op, Value: value}, nil
}

// allowedOps derives the permitted operators for a field. A bounded enum
// (FilterValues set) is equality-only; otherwise operators come from the codec.
func allowedOps[M any](field Field[M]) []FilterOperator {
	if len(field.FilterValues) > 0 {
		return []FilterOperator{OpEqual, OpNotEqual}
	}

	switch field.Codec.(type) {
	case StringCodec:
		return []FilterOperator{OpEqual, OpNotEqual, OpContains}
	case BoolCodec:
		return []FilterOperator{OpEqual, OpNotEqual}
	case Int64Codec, TimestampCodec:
		return []FilterOperator{OpEqual, OpNotEqual, OpLess, OpLessEq, OpGreater, OpGreaterEq}
	default:
		return nil
	}
}

// coerceFilterValue converts a raw lexeme into the field codec's Go type.
func coerceFilterValue[M any](field Field[M], rc rawCondition) (any, error) {
	switch field.Codec.(type) {
	case StringCodec:
		if !rc.quoted {
			return nil, fmt.Errorf("%w: field %q requires a quoted string value", ErrInvalidFilter, rc.field)
		}

		if len(field.FilterValues) > 0 && !slices.Contains(field.FilterValues, rc.value) {
			return nil, fmt.Errorf("%w: value %q not allowed for field %q (allowed: %s)",
				ErrInvalidFilter, rc.value, rc.field, strings.Join(field.FilterValues, ", "))
		}

		return rc.value, nil
	case BoolCodec:
		if rc.quoted {
			return nil, fmt.Errorf("%w: field %q is boolean; use true or false without quotes", ErrInvalidFilter, rc.field)
		}

		switch rc.value {
		case "true":
			return true, nil
		case "false":
			return false, nil
		default:
			return nil, fmt.Errorf("%w: field %q expects true or false, got %q", ErrInvalidFilter, rc.field, rc.value)
		}
	case Int64Codec:
		if rc.quoted {
			return nil, fmt.Errorf("%w: field %q is an integer; use an unquoted number", ErrInvalidFilter, rc.field)
		}

		n, err := strconv.ParseInt(rc.value, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: field %q expects an integer, got %q", ErrInvalidFilter, rc.field, rc.value)
		}

		return n, nil
	case TimestampCodec:
		if !rc.quoted {
			return nil, fmt.Errorf("%w: field %q expects a quoted RFC 3339 timestamp", ErrInvalidFilter, rc.field)
		}

		if len(rc.value) < rfc3339MinLength {
			return nil, fmt.Errorf("%w: field %q expects an RFC 3339 timestamp, got %q", ErrInvalidFilter, rc.field, rc.value)
		}

		ts, err := time.Parse(time.RFC3339Nano, rc.value)
		if err != nil {
			return nil, fmt.Errorf("%w: field %q expects an RFC 3339 timestamp, got %q", ErrInvalidFilter, rc.field, rc.value)
		}

		return ts, nil
	default:
		return nil, fmt.Errorf("%w: field %q has an unsupported codec for filtering", ErrInvalidFilter, rc.field)
	}
}

// newFilterFieldError mirrors newFieldError but wraps ErrInvalidFilter.
func newFilterFieldError(path string, allowed []string) error {
	return fmt.Errorf("%w: field %q is not filterable (filterable: %s)",
		ErrInvalidFilter, path, strings.Join(allowed, ", "))
}

// escapeLikePattern escapes the LIKE/ILIKE metacharacters (\, %, _) using the
// default backslash escape so user text matches literally. Because the pattern
// is always passed as a bound parameter, no explicit ESCAPE clause is needed.
func escapeLikePattern(s string) string {
	var b strings.Builder

	b.Grow(len(s))

	for i := range len(s) {
		c := s[i]
		if c == '\\' || c == '%' || c == '_' {
			b.WriteByte('\\')
		}

		b.WriteByte(c)
	}

	return b.String()
}

// ContainsPattern wraps an escaped substring term in % wildcards for ILIKE.
// Backend compilers use it to translate the ":" operator; the result must
// always be passed as a bound parameter, never interpolated.
func ContainsPattern(v string) string {
	return "%" + escapeLikePattern(v) + "%"
}
