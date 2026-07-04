package jet_test

import (
	"testing"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
	"github.com/querylane/querylane/backend/aip/rawsql"
)

// The parity tests assert the two backend compilers — go-jet (aip/jet) and
// raw SQL (aip/rawsql) — emit IDENTICAL bound arguments (values and order)
// for the same plan. The backends render different column-reference syntax by
// design, but the bound parameters (escaped ILIKE patterns, coerced literals,
// cursor values, and their filter-before-cursor ordering) are
// backend-independent and must agree byte-for-byte.
//
// No production schema is compiled through both backends (catalog lists are
// jet-only, engine lists are rawsql-only), so without these tests the two
// compilers can silently drift on escaping/operator/value handling and every
// per-backend test still passes.

func newParityExprs() rawsql.Exprs {
	return rawsql.Exprs{
		"display_name": "g.display_name",
		"object_type":  "g.object_type",
		"is_system":    "g.is_system",
		"size_bytes":   "g.size_bytes",
		"create_time":  "g.create_time",
		"secret":       "g.secret",
	}
}

// compileBoth compiles the same params through both backends and returns the
// bound args of each (jet args extracted by serializing the WHERE condition).
func compileBoth(t *testing.T, params aip.Params) ([]any, []any) {
	t.Helper()

	core := newFilterTestCore()

	plan, err := aip.BuildPlan(core, params)
	if err != nil {
		t.Fatalf("BuildPlan() error = %v", err)
	}

	where, _, err := aipjet.BuildClauses(aipjet.Bind(core, newFilterTestColumns()), plan)
	if err != nil {
		t.Fatalf("jet.BuildClauses() error = %v", err)
	}

	var jetArgs []any
	if where != nil {
		_, jetArgs = postgres.SELECT(postgres.StringColumn("g.display_name")).WHERE(where).Sql()
	}

	clauses, err := rawsql.BuildClauses(rawsql.Bind(core, newParityExprs()), plan, 1)
	if err != nil {
		t.Fatalf("rawsql.BuildClauses() error = %v", err)
	}

	return jetArgs, clauses.Args
}

func assertArgsEqual(t *testing.T, jetArgs, sqlArgs []any) {
	t.Helper()

	if len(jetArgs) != len(sqlArgs) {
		t.Fatalf("arg count mismatch: jet=%v sql=%v", jetArgs, sqlArgs)
	}

	for i := range jetArgs {
		if jetArgs[i] != sqlArgs[i] {
			t.Fatalf("arg[%d] mismatch: jet=%v (%T) sql=%v (%T)",
				i, jetArgs[i], jetArgs[i], sqlArgs[i], sqlArgs[i])
		}
	}
}

func Test_FilterBackendParity(t *testing.T) {
	t.Parallel()

	// Cover every operator/codec path, including the escape-sensitive ILIKE case
	// (% and _ must be neutralized identically by both backends) and a combined
	// AND (arg ordering must match).
	filters := []string{
		`object_type = "TABLE"`,
		`object_type != "VIEW"`,
		`display_name:"orders"`,
		`display_name:"50%_x"`,
		`is_system = false`,
		`is_system != true`,
		`object_type = "TABLE" AND display_name:"foo"`,
		`object_type = "TABLE" OR is_system = false`,
		`NOT display_name:"tmp"`,
		`object_type = "TABLE" AND is_system = false OR display_name:"x"`,
		`(object_type = "TABLE" OR object_type = "VIEW") AND -display_name:"tmp"`,
		`size_bytes >= 1024 AND size_bytes < 1000000`,
		`create_time < "2026-01-02T15:04:05Z" AND create_time >= "2025-01-01T00:00:00Z"`,
	}

	for _, filter := range filters {
		t.Run(filter, func(t *testing.T) {
			t.Parallel()

			jetArgs, sqlArgs := compileBoth(t, aip.Params{Filter: filter})
			assertArgsEqual(t, jetArgs, sqlArgs)
		})
	}
}

// Test_KeysetBackendParity is the same drift guard for the keyset compilers:
// both backends must choose the same algorithm (ROW() tuple comparison for
// uniform-direction orderings, lexicographic OR-chain for mixed ones) and
// emit identical bound arguments in identical order — including filter args
// preceding cursor args when both are present.
func Test_KeysetBackendParity(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		orderBy string
		order   aip.OrderBy
		vals    []any
		filter  string
	}{
		{
			name:    "uniform asc tuple",
			orderBy: "display_name asc, secret asc",
			order:   aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name"}, {Path: "secret"}}},
			vals:    []any{"alpha", "id-1"},
		},
		{
			name:    "uniform desc tuple",
			orderBy: "display_name desc, secret desc",
			order:   aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name", Direction: aip.Desc}, {Path: "secret", Direction: aip.Desc}}},
			vals:    []any{"alpha", "id-1"},
		},
		{
			name:    "mixed direction or-chain",
			orderBy: "display_name asc, secret desc",
			order:   aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name"}, {Path: "secret", Direction: aip.Desc}}},
			vals:    []any{"alpha", "id-1"},
		},
		{
			name:    "single field",
			orderBy: "display_name asc",
			order:   aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name"}}},
			vals:    []any{"alpha"},
		},
		{
			name:    "filter args precede cursor args",
			orderBy: "display_name asc",
			order:   aip.OrderBy{Fields: []aip.OrderField{{Path: "display_name"}}},
			vals:    []any{"alpha"},
			filter:  `object_type = "TABLE" AND display_name:"50%_x"`,
		},
	}

	codecs := map[string]aip.CursorCodec{
		"display_name": aip.StringCodec{},
		"secret":       aip.StringCodec{},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			token, err := aip.EncodeToken("console.querylane.dev/FilterTest", tc.vals, tc.order, tc.filter, codecs)
			if err != nil {
				t.Fatalf("EncodeToken() error = %v", err)
			}

			jetArgs, sqlArgs := compileBoth(t, aip.Params{
				PageToken: token,
				OrderBy:   tc.orderBy,
				Filter:    tc.filter,
			})
			assertArgsEqual(t, jetArgs, sqlArgs)
		})
	}
}
