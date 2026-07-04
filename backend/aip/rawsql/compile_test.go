package rawsql

import (
	"strings"
	"testing"
	"time"

	"github.com/querylane/querylane/backend/aip"
)

type testModel struct {
	ID          string
	DisplayName string
	Engine      string
}

// tokTABLE is the stored object_type token reused across the filter tests.
const tokTABLE = "TABLE"

// newTestSchema creates a plain orderable schema bound to SQL expressions.
func newTestSchema() *Schema[testModel] {
	return Bind(
		aip.NewSchema(
			"console.querylane.dev/Test",
			aip.Fields[testModel]{
				"display_name": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *testModel) any { return m.DisplayName },
				},
				"id": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *testModel) any { return m.ID },
				},
			},
			aip.WithDefaultOrder("display_name", aip.Asc),
			aip.WithTieBreaker("id", aip.Asc),
		),
		Exprs{
			"display_name": "instance.display_name",
			"id":           "instance.id",
		},
	)
}

// newFilterTestSchema mirrors the core package's filter test schema with SQL
// expression bindings for every filterable field shape.
func newFilterTestSchema() *Schema[testModel] {
	return Bind(
		aip.NewSchema(
			"console.querylane.dev/FilterTest",
			aip.Fields[testModel]{
				"display_name": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *testModel) any { return m.DisplayName },
					Filterable: true,
				},
				"object_type": {
					Codec:        aip.StringCodec{},
					GetValue:     func(m *testModel) any { return m.Engine },
					Filterable:   true,
					FilterValues: []string{"TABLE", "VIEW"},
				},
				"is_system": {
					Codec:           aip.BoolCodec{},
					DisableOrdering: true,
					Filterable:      true,
				},
				"size_bytes": {
					Codec:           aip.Int64Codec{},
					DisableOrdering: true,
					Filterable:      true,
				},
				"create_time": {
					Codec:           aip.TimestampCodec{},
					DisableOrdering: true,
					Filterable:      true,
				},
				"secret": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *testModel) any { return m.ID },
				},
			},
			aip.WithDefaultOrder("display_name", aip.Asc),
		),
		Exprs{
			"display_name": "g.display_name",
			"object_type":  "g.object_type",
			"is_system":    "g.is_system",
			"size_bytes":   "g.size_bytes",
			"create_time":  "g.create_time",
			"secret":       "g.secret",
		},
	)
}

func mustBuildPlan(t *testing.T, schema *Schema[testModel], params aip.Params) *aip.Plan {
	t.Helper()

	plan, err := aip.BuildPlan(schema.core, params)
	if err != nil {
		t.Fatalf("BuildPlan() error = %v", err)
	}

	return plan
}

func encodeToken(t *testing.T, orderBy aip.OrderBy, vals []any, filter string) string {
	t.Helper()

	codecs := map[string]aip.CursorCodec{
		"display_name": aip.StringCodec{},
		"id":           aip.StringCodec{},
	}

	token, err := aip.EncodeToken("console.querylane.dev/Test", vals, orderBy, filter, codecs)
	if err != nil {
		t.Fatalf("EncodeToken() error = %v", err)
	}

	return token
}

func Test_BuildClauses(t *testing.T) {
	t.Parallel()

	t.Run("adds sentinel limit and order by", func(t *testing.T) {
		t.Parallel()

		schema := newTestSchema()
		plan := mustBuildPlan(t, schema, aip.Params{PageSize: 3})

		clauses, err := BuildClauses(schema, plan, 1)
		if err != nil {
			t.Fatalf("BuildClauses() error = %v", err)
		}

		if clauses.Where != "" {
			t.Fatalf("clauses.Where = %q, want empty", clauses.Where)
		}

		if clauses.OrderBy != "instance.display_name ASC, instance.id ASC" {
			t.Fatalf("clauses.OrderBy = %q", clauses.OrderBy)
		}

		if clauses.Limit != 4 {
			t.Fatalf("clauses.Limit = %d, want 4", clauses.Limit)
		}
	})

	t.Run("offsets cursor placeholders after base args", func(t *testing.T) {
		t.Parallel()

		schema := newTestSchema()
		orderBy := aip.OrderBy{Fields: []aip.OrderField{
			{Path: "display_name"},
			{Path: "id"},
		}}
		token := encodeToken(t, orderBy, []any{"alpha", "id-1"}, "")
		plan := mustBuildPlan(t, schema, aip.Params{PageSize: 2, PageToken: token})

		clauses, err := BuildClauses(schema, plan, 2)
		if err != nil {
			t.Fatalf("BuildClauses() error = %v", err)
		}

		// Uniform-direction ordering compiles to the ROW() tuple fast path with
		// placeholders continuing after the base args.
		const wantWhere = "(ROW(instance.display_name, instance.id) > ROW($2, $3))"
		if clauses.Where != wantWhere {
			t.Fatalf("clauses.Where = %q, want %q", clauses.Where, wantWhere)
		}
	})

	t.Run("multi-field keyset predicate stays inside base where", func(t *testing.T) {
		t.Parallel()

		// Regression: with a mixed-direction order the keyset predicate is a
		// disjunction (chain1 OR chain2). Appended to a base WHERE via AND
		// without outer parentheses it parses as
		// (base AND chain1) OR chain2, so chain2 leaks rows that the base
		// WHERE (e.g. a tenant filter) must exclude on every later page.
		// (Uniform-direction orderings take the ROW() tuple path instead.)
		schema := newTestSchema()
		orderBy := aip.OrderBy{Fields: []aip.OrderField{
			{Path: "display_name"},
			{Path: "id", Direction: aip.Desc},
		}}
		token := encodeToken(t, orderBy, []any{"alpha", "id-1"}, "")
		plan := mustBuildPlan(t, schema, aip.Params{PageSize: 2, PageToken: token, OrderBy: "display_name asc, id desc"})

		clauses, err := BuildClauses(schema, plan, 2)
		if err != nil {
			t.Fatalf("BuildClauses() error = %v", err)
		}

		gotSQL, gotArgs := assembleQuery(Query{
			BaseQuery: "SELECT id FROM things WHERE tenant_id = $1",
			Args:      []any{"tenant-1"},
			HasWhere:  true,
		}, clauses)

		wantSQL := "SELECT id FROM things WHERE tenant_id = $1 AND " +
			"((instance.display_name > $2) OR ((instance.display_name = $3) AND (instance.id < $4))) " +
			"ORDER BY instance.display_name ASC, instance.id DESC LIMIT 3"
		if gotSQL != wantSQL {
			t.Fatalf("assembleQuery() sql = %q, want %q", gotSQL, wantSQL)
		}

		if len(gotArgs) != 4 {
			t.Fatalf("assembleQuery() arg len = %d, want 4", len(gotArgs))
		}
	})

	t.Run("descending order uses less-than comparator", func(t *testing.T) {
		t.Parallel()

		schema := newTestSchema()
		orderBy := aip.OrderBy{Fields: []aip.OrderField{
			{Path: "display_name", Direction: aip.Desc},
			{Path: "id"},
		}}
		token := encodeToken(t, orderBy, []any{"alpha", "id-1"}, "")
		plan := mustBuildPlan(t, schema, aip.Params{PageToken: token, OrderBy: "display_name desc"})

		clauses, err := BuildClauses(schema, plan, 1)
		if err != nil {
			t.Fatalf("BuildClauses() error = %v", err)
		}

		if !strings.Contains(clauses.Where, "instance.display_name < $1") {
			t.Fatalf("clauses.Where = %q, want descending comparator", clauses.Where)
		}
	})
}

func Test_buildFilterPredicate(t *testing.T) {
	t.Parallel()

	schema := newFilterTestSchema()

	tests := []struct {
		name      string
		filter    string
		wantWhere string
		wantArgs  []any
	}{
		{
			name:      "equality",
			filter:    `object_type = "TABLE"`,
			wantWhere: "(g.object_type = $1)",
			wantArgs:  []any{tokTABLE},
		},
		{
			name:      "inequality uses <>",
			filter:    `object_type != "VIEW"`,
			wantWhere: "(g.object_type <> $1)",
			wantArgs:  []any{"VIEW"},
		},
		{
			name:      "contains uses ILIKE with escaped wildcards",
			filter:    `display_name:"50%_x"`,
			wantWhere: "(g.display_name ILIKE $1)",
			wantArgs:  []any{`%50\%\_x%`},
		},
		{
			name:      "bool equality",
			filter:    `is_system = false`,
			wantWhere: "(g.is_system = $1)",
			wantArgs:  []any{false},
		},
		{
			name:      "combined AND",
			filter:    `object_type = "TABLE" AND display_name:"foo"`,
			wantWhere: "((g.object_type = $1) AND (g.display_name ILIKE $2))",
			wantArgs:  []any{tokTABLE, "%foo%"},
		},
		{
			name:      "disjunction",
			filter:    `object_type = "TABLE" OR is_system = false`,
			wantWhere: "((g.object_type = $1) OR (g.is_system = $2))",
			wantArgs:  []any{tokTABLE, false},
		},
		{
			name:      "negation",
			filter:    `NOT display_name:"tmp"`,
			wantWhere: "(NOT (g.display_name ILIKE $1))",
			wantArgs:  []any{"%tmp%"},
		},
		{
			name:      "precedence: OR binds tighter than AND",
			filter:    `object_type = "TABLE" AND is_system = false OR display_name:"x"`,
			wantWhere: "((g.object_type = $1) AND ((g.is_system = $2) OR (g.display_name ILIKE $3)))",
			wantArgs:  []any{tokTABLE, false, "%x%"},
		},
		{
			name:      "int64 comparison",
			filter:    `size_bytes >= 1024`,
			wantWhere: "(g.size_bytes >= $1)",
			wantArgs:  []any{int64(1024)},
		},
		{
			name:      "timestamp comparison",
			filter:    `create_time < "2026-01-02T15:04:05Z"`,
			wantWhere: "(g.create_time < $1)",
			wantArgs:  []any{time.Date(2026, 1, 2, 15, 4, 5, 0, time.UTC)},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			plan := mustBuildPlan(t, schema, aip.Params{Filter: tt.filter})

			b := argBuilder{next: 1}

			gotWhere, err := buildFilterPredicate(&b, schema.exprs, plan.ParsedFilter())
			if err != nil {
				t.Fatalf("buildFilterPredicate() error = %v", err)
			}

			if gotWhere != tt.wantWhere {
				t.Fatalf("buildFilterPredicate() where = %q, want %q", gotWhere, tt.wantWhere)
			}

			if len(b.args) != len(tt.wantArgs) {
				t.Fatalf("buildFilterPredicate() args = %v, want %v", b.args, tt.wantArgs)
			}

			for i := range b.args {
				if b.args[i] != tt.wantArgs[i] {
					t.Fatalf("buildFilterPredicate() args[%d] = %v, want %v", i, b.args[i], tt.wantArgs[i])
				}
			}
		})
	}
}

func Test_BuildClauses_FilterBeforeCursor(t *testing.T) {
	t.Parallel()

	schema := newFilterTestSchema()

	orderBy := aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name"}}}

	codecs := map[string]aip.CursorCodec{"display_name": aip.StringCodec{}}

	const filter = `object_type = "TABLE"`

	token, err := aip.EncodeToken("console.querylane.dev/FilterTest", []any{"alpha"}, orderBy, filter, codecs)
	if err != nil {
		t.Fatalf("EncodeToken() error = %v", err)
	}

	plan := mustBuildPlan(t, schema, aip.Params{PageSize: 5, PageToken: token, Filter: filter})

	clauses, err := BuildClauses(schema, plan, 1)
	if err != nil {
		t.Fatalf("BuildClauses() error = %v", err)
	}

	// Filter params come first ($1), cursor params after ($2). joinPredicates
	// wraps the two branches in one outer pair of parentheses.
	const wantWhere = "((g.object_type = $1) AND (ROW(g.display_name) > ROW($2)))"
	if clauses.Where != wantWhere {
		t.Fatalf("clauses.Where = %q, want %q", clauses.Where, wantWhere)
	}

	if len(clauses.Args) != 2 || clauses.Args[0] != tokTABLE || clauses.Args[1] != "alpha" {
		t.Fatalf("clauses.Args = %v, want [TABLE alpha]", clauses.Args)
	}
}

func Test_BuildClauses_FilterOnlyNoCursor(t *testing.T) {
	t.Parallel()

	schema := newFilterTestSchema()
	plan := mustBuildPlan(t, schema, aip.Params{PageSize: 5, Filter: `object_type = "TABLE"`})

	clauses, err := BuildClauses(schema, plan, 1)
	if err != nil {
		t.Fatalf("BuildClauses() error = %v", err)
	}

	// No cursor: the filter must not be ANDed with an empty fragment.
	if clauses.Where != "(g.object_type = $1)" {
		t.Fatalf("clauses.Where = %q, want %q", clauses.Where, "(g.object_type = $1)")
	}

	if len(clauses.Args) != 1 || clauses.Args[0] != tokTABLE {
		t.Fatalf("clauses.Args = %v, want [TABLE]", clauses.Args)
	}
}

func TestAssembleQuery(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		query      Query
		clauses    *Clauses
		wantSQL    string
		wantArgLen int
	}{
		{
			name: "first page without where",
			query: Query{
				BaseQuery: "SELECT id FROM things",
			},
			clauses: &Clauses{
				OrderBy: "id ASC",
				Limit:   3,
			},
			wantSQL:    "SELECT id FROM things ORDER BY id ASC LIMIT 3",
			wantArgLen: 0,
		},
		{
			name: "first page with base where",
			query: Query{
				BaseQuery: "SELECT id FROM things WHERE tenant_id = $1",
				Args:      []any{"tenant-1"},
				HasWhere:  true,
			},
			clauses: &Clauses{
				OrderBy: "id ASC",
				Limit:   3,
			},
			wantSQL:    "SELECT id FROM things WHERE tenant_id = $1 ORDER BY id ASC LIMIT 3",
			wantArgLen: 1,
		},
		{
			name: "later page with cursor only",
			query: Query{
				BaseQuery: "SELECT id FROM things",
			},
			clauses: &Clauses{
				Where:   "(id > $1)",
				Args:    []any{"row-1"},
				OrderBy: "id ASC",
				Limit:   3,
			},
			wantSQL:    "SELECT id FROM things WHERE (id > $1) ORDER BY id ASC LIMIT 3",
			wantArgLen: 1,
		},
		{
			name: "later page with base and cursor",
			query: Query{
				BaseQuery: "SELECT id FROM things WHERE tenant_id = $1",
				Args:      []any{"tenant-1"},
				HasWhere:  true,
			},
			clauses: &Clauses{
				Where:   "(id > $2)",
				Args:    []any{"row-1"},
				OrderBy: "id ASC",
				Limit:   3,
			},
			wantSQL:    "SELECT id FROM things WHERE tenant_id = $1 AND (id > $2) ORDER BY id ASC LIMIT 3",
			wantArgLen: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			gotSQL, gotArgs := assembleQuery(tt.query, tt.clauses)
			if gotSQL != tt.wantSQL {
				t.Fatalf("assembleQuery() sql = %q, want %q", gotSQL, tt.wantSQL)
			}

			if len(gotArgs) != tt.wantArgLen {
				t.Fatalf("assembleQuery() arg len = %d, want %d", len(gotArgs), tt.wantArgLen)
			}
		})
	}
}

func TestBind_PanicsOnUnboundOrderableField(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Bind() did not panic on a missing binding")
		}
	}()

	Bind(
		aip.NewSchema(
			"console.querylane.dev/Bad",
			aip.Fields[testModel]{
				"name": {Codec: aip.StringCodec{}, GetValue: func(m *testModel) any { return m.ID }},
			},
			aip.WithNameOrdering(),
		),
		Exprs{},
	)
}

func TestBind_PanicsOnUnknownPath(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Bind() did not panic on an unknown binding path")
		}
	}()

	Bind(
		aip.NewSchema(
			"console.querylane.dev/Bad",
			aip.Fields[testModel]{
				"name": {Codec: aip.StringCodec{}, GetValue: func(m *testModel) any { return m.ID }},
			},
			aip.WithNameOrdering(),
		),
		Exprs{"name": "t.name", "nope": "t.nope"},
	)
}
