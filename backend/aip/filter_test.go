package aip

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

// tokTABLE is the stored object_type token reused across the filter tests.
const tokTABLE = "TABLE"

// newFilterTestSchema builds a backend-neutral schema exercising every
// filterable field shape (unbounded string, bounded enum string, bool, int64,
// timestamp, non-filterable). The backend subpackages bind columns/exprs to
// an equivalent schema in their own tests.
func newFilterTestSchema() *Schema[testModel] {
	return NewSchema(
		"console.querylane.dev/FilterTest",
		Fields[testModel]{
			"display_name": {
				Codec:      StringCodec{},
				GetValue:   func(m *testModel) any { return m.DisplayName },
				Filterable: true,
			},
			"object_type": {
				Codec:        StringCodec{},
				GetValue:     func(m *testModel) any { return m.Engine },
				Filterable:   true,
				FilterValues: []string{"TABLE", "VIEW"},
			},
			"is_system": {
				Codec:           BoolCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"size_bytes": {
				Codec:           Int64Codec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"create_time": {
				Codec:           TimestampCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
			"secret": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
		},
		WithDefaultOrder("display_name", Asc),
	)
}

func TestParseFilter_Valid(t *testing.T) {
	t.Parallel()

	cond := func(field string, op FilterOperator, value string, quoted bool) rawCondition {
		return rawCondition{field: field, op: op, value: value, quoted: quoted}
	}

	tests := []struct {
		name  string
		input string
		want  rawExpr
	}{
		{name: "empty", input: "", want: nil},
		{name: "whitespace only", input: "   ", want: nil},
		{
			name:  "equality double quotes",
			input: `object_type = "TABLE"`,
			want:  cond("object_type", OpEqual, "TABLE", true),
		},
		{
			name:  "equality single quotes",
			input: `object_type = 'TABLE'`,
			want:  cond("object_type", OpEqual, "TABLE", true),
		},
		{
			name:  "inequality",
			input: `object_type != "VIEW"`,
			want:  cond("object_type", OpNotEqual, "VIEW", true),
		},
		{
			name:  "contains substring",
			input: `display_name:"orders"`,
			want:  cond("display_name", OpContains, "orders", true),
		},
		{
			name:  "bare bool true",
			input: `is_system = true`,
			want:  cond("is_system", OpEqual, "true", false),
		},
		{
			name:  "comparison operators",
			input: `size_bytes >= 100 AND size_bytes < 200`,
			want: rawAnd{operands: []rawExpr{
				cond("size_bytes", OpGreaterEq, "100", false),
				cond("size_bytes", OpLess, "200", false),
			}},
		},
		{
			name:  "negative integer value",
			input: `size_bytes > -5`,
			want:  cond("size_bytes", OpGreater, "-5", false),
		},
		{
			name:  "case-insensitive AND",
			input: `object_type = "VIEW" and display_name:"user"`,
			want: rawAnd{operands: []rawExpr{
				cond("object_type", OpEqual, "VIEW", true),
				cond("display_name", OpContains, "user", true),
			}},
		},
		{
			name:  "OR binds tighter than AND (AIP-160 precedence)",
			input: `object_type = "TABLE" AND is_system = true OR is_system = false`,
			want: rawAnd{operands: []rawExpr{
				cond("object_type", OpEqual, "TABLE", true),
				rawOr{operands: []rawExpr{
					cond("is_system", OpEqual, "true", false),
					cond("is_system", OpEqual, "false", false),
				}},
			}},
		},
		{
			name:  "parentheses override precedence",
			input: `(object_type = "TABLE" AND is_system = true) OR is_system = false`,
			want: rawOr{operands: []rawExpr{
				rawAnd{operands: []rawExpr{
					cond("object_type", OpEqual, "TABLE", true),
					cond("is_system", OpEqual, "true", false),
				}},
				cond("is_system", OpEqual, "false", false),
			}},
		},
		{
			name:  "NOT keyword",
			input: `NOT display_name:"tmp"`,
			want:  rawNot{operand: cond("display_name", OpContains, "tmp", true)},
		},
		{
			name:  "minus negation",
			input: `-display_name:"tmp"`,
			want:  rawNot{operand: cond("display_name", OpContains, "tmp", true)},
		},
		{
			name:  "NOT over parenthesized expression",
			input: `NOT (is_system = true OR object_type = "VIEW")`,
			want: rawNot{operand: rawOr{operands: []rawExpr{
				cond("is_system", OpEqual, "true", false),
				cond("object_type", OpEqual, "VIEW", true),
			}}},
		},
		{
			name:  "operator-looking content inside quotes is literal",
			input: `display_name = ":"`,
			want:  cond("display_name", OpEqual, ":", true),
		},
		{
			name:  "AND keyword inside quotes is literal",
			input: `display_name = "x AND y"`,
			want:  cond("display_name", OpEqual, "x AND y", true),
		},
		{
			name:  "equals inside quotes survives",
			input: `display_name = "a=b"`,
			want:  cond("display_name", OpEqual, "a=b", true),
		},
		{
			name:  "escaped backslash and quote",
			input: `display_name = "a\\b\"c"`,
			want:  cond("display_name", OpEqual, `a\b"c`, true),
		},
		{
			name:  "duplicate field allowed",
			input: `display_name = "x" AND display_name = "y"`,
			want: rawAnd{operands: []rawExpr{
				cond("display_name", OpEqual, "x", true),
				cond("display_name", OpEqual, "y", true),
			}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := parseFilter(tt.input)
			if err != nil {
				t.Fatalf("parseFilter(%q) error = %v", tt.input, err)
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("parseFilter(%q) = %#v, want %#v", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseFilter_Invalid(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
	}{
		{name: "function call rejected", input: `display_name.contains("x")`},
		{name: "bare term rejected", input: `display_name`},
		{name: "empty value", input: `display_name = `},
		{name: "invalid escape", input: `display_name = "a\zb"`},
		{name: "unterminated quote", input: `display_name = "x`},
		{name: "trailing dangling backslash", input: `display_name = "x\"`},
		{name: "chars after closing quote", input: `display_name = "x"y`},
		{name: "invalid field name", input: `1bad = "x"`},
		{name: "leading AND", input: `AND display_name = "x"`},
		{name: "trailing AND", input: `display_name = "x" AND`},
		{name: "trailing OR", input: `display_name = "x" OR`},
		{name: "unbalanced open paren", input: `(display_name = "x"`},
		{name: "unbalanced close paren", input: `display_name = "x")`},
		{name: "empty parens", input: `()`},
		{name: "bare NOT", input: `NOT`},
		{name: "dangling minus value", input: `size_bytes > -`},
		{name: "keyword as field", input: `or = "x"`},
		{name: "too many bytes", input: `display_name = "` + strings.Repeat("a", maxFilterBytes) + `"`},
		{name: "too many conditions", input: strings.TrimSuffix(strings.Repeat(`display_name = "x" AND `, maxConditions+1), " AND ")},
		{name: "nesting too deep", input: strings.Repeat("(", maxNestingDepth+1) + `display_name = "x"` + strings.Repeat(")", maxNestingDepth+1)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseFilter(tt.input)
			if !errors.Is(err, ErrInvalidFilter) {
				t.Fatalf("parseFilter(%q) error = %v, want ErrInvalidFilter", tt.input, err)
			}
		})
	}
}

func TestValidateFilter(t *testing.T) {
	t.Parallel()

	schema := newFilterTestSchema()

	valid := []struct {
		name  string
		input string
		want  FilterExpr
	}{
		{
			name:  "mixed conjunction",
			input: `object_type = "TABLE" AND display_name:"ord" AND is_system = false`,
			want: FilterAnd{Operands: []FilterExpr{
				FilterCondition{Field: "object_type", Operator: OpEqual, Value: tokTABLE},
				FilterCondition{Field: "display_name", Operator: OpContains, Value: "ord"},
				FilterCondition{Field: "is_system", Operator: OpEqual, Value: false},
			}},
		},
		{
			name:  "int64 comparison",
			input: `size_bytes >= 1024`,
			want:  FilterCondition{Field: "size_bytes", Operator: OpGreaterEq, Value: int64(1024)},
		},
		{
			name:  "timestamp comparison",
			input: `create_time < "2026-01-02T15:04:05Z"`,
			want: FilterCondition{
				Field:    "create_time",
				Operator: OpLess,
				Value:    time.Date(2026, 1, 2, 15, 4, 5, 0, time.UTC),
			},
		},
		{
			name:  "negation and disjunction",
			input: `NOT is_system = true OR display_name:"x"`,
			want: FilterOr{Operands: []FilterExpr{
				FilterNot{Operand: FilterCondition{Field: "is_system", Operator: OpEqual, Value: true}},
				FilterCondition{Field: "display_name", Operator: OpContains, Value: "x"},
			}},
		},
	}

	for _, tt := range valid {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			raw, err := parseFilter(tt.input)
			if err != nil {
				t.Fatalf("parseFilter() error = %v", err)
			}

			got, err := validateFilter(schema, raw)
			if err != nil {
				t.Fatalf("validateFilter() error = %v", err)
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("validateFilter(%q) = %#v, want %#v", tt.input, got, tt.want)
			}
		})
	}

	invalid := []struct {
		name  string
		input string
	}{
		{name: "unknown field", input: `nope = "x"`},
		{name: "non-filterable field", input: `secret = "x"`},
		{name: "contains on bounded enum", input: `object_type:"TAB"`},
		{name: "value outside FilterValues", input: `object_type = "TABEL"`},
		{name: "comparison on bounded enum", input: `object_type > "TABLE"`},
		{name: "contains on bool", input: `is_system:"true"`},
		{name: "comparison on bool", input: `is_system < true`},
		{name: "comparison on string", input: `display_name > "x"`},
		{name: "quoted bool value", input: `is_system = "true"`},
		{name: "non-bool bool value", input: `is_system = maybe`},
		{name: "unquoted string value", input: `display_name = orders`},
		{name: "quoted int value", input: `size_bytes = "5"`},
		{name: "non-integer int value", input: `size_bytes = abc`},
		{name: "contains on int", input: `size_bytes:"5"`},
		{name: "unquoted timestamp", input: `create_time > 2026`},
		{name: "malformed timestamp", input: `create_time > "yesterday"`},
		{name: "nested invalid operand", input: `is_system = false OR secret = "x"`},
	}

	for _, tt := range invalid {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			raw, err := parseFilter(tt.input)
			if err != nil {
				// Some of these may fail at parse time too; that is still ErrInvalidFilter.
				if !errors.Is(err, ErrInvalidFilter) {
					t.Fatalf("parseFilter(%q) error = %v, want ErrInvalidFilter", tt.input, err)
				}

				return
			}

			if _, err := validateFilter(schema, raw); !errors.Is(err, ErrInvalidFilter) {
				t.Fatalf("validateFilter(%q) error = %v, want ErrInvalidFilter", tt.input, err)
			}
		})
	}
}

func TestBuildPlan_FilterRequiresFilterableFields(t *testing.T) {
	t.Parallel()

	// newTestSchema declares no Filterable fields, so any non-empty filter is
	// rejected up front (AIP-160: unsupported filters must error, never be
	// silently ignored).
	schema := newTestSchema()

	_, err := BuildPlan(schema, Params{Filter: `display_name = "x"`})
	if !errors.Is(err, ErrInvalidFilter) {
		t.Fatalf("BuildPlan() error = %v, want ErrInvalidFilter", err)
	}

	if _, err := BuildPlan(schema, Params{Filter: "  "}); err != nil {
		t.Fatalf("BuildPlan() with blank filter error = %v, want nil", err)
	}
}

func TestEscapeLikePattern(t *testing.T) {
	t.Parallel()

	tests := []struct {
		in   string
		want string
	}{
		{in: "orders", want: "orders"},
		{in: "50%", want: `50\%`},
		{in: "a_b", want: `a\_b`},
		{in: `a\b`, want: `a\\b`},
		{in: `%_\`, want: `\%\_\\`},
	}

	for _, tt := range tests {
		if got := escapeLikePattern(tt.in); got != tt.want {
			t.Fatalf("escapeLikePattern(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
