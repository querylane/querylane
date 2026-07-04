package jet_test

import (
	"strings"
	"testing"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
)

type testModel struct {
	ID          string
	DisplayName string
	Engine      string
}

// tokTABLE is the stored object_type token reused across the filter tests.
const tokTABLE = "TABLE"

// newFilterTestCore mirrors the core package's filter test schema; the jet
// tests bind go-jet columns to it.
func newFilterTestCore() *aip.Schema[testModel] {
	return aip.NewSchema(
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
	)
}

func newFilterTestColumns() aipjet.Columns {
	return aipjet.Columns{
		"display_name": postgres.StringColumn("g.display_name"),
		"object_type":  postgres.StringColumn("g.object_type"),
		"is_system":    postgres.BoolColumn("g.is_system"),
		"size_bytes":   postgres.IntegerColumn("g.size_bytes"),
		"create_time":  postgres.TimestampzColumn("g.create_time"),
		"secret":       postgres.StringColumn("g.secret"),
	}
}

// filterSQL compiles a filter through the public plan+clauses API and
// serializes it inside a SELECT so the parameterized SQL (Sql(), which keeps
// $n placeholders) can be asserted.
func filterSQL(t *testing.T, filter string) (string, []any) {
	t.Helper()

	core := newFilterTestCore()
	schema := aipjet.Bind(core, newFilterTestColumns())

	plan, err := aip.BuildPlan(core, aip.Params{Filter: filter})
	if err != nil {
		t.Fatalf("BuildPlan() error = %v", err)
	}

	where, _, err := aipjet.BuildClauses(schema, plan)
	if err != nil {
		t.Fatalf("BuildClauses() error = %v", err)
	}

	query, args := postgres.SELECT(postgres.StringColumn("g.display_name")).WHERE(where).Sql()

	return query, args
}

func Test_BuildClauses_Contains_UsesILIKE(t *testing.T) {
	t.Parallel()

	query, args := filterSQL(t, `display_name:"orders"`)

	if !strings.Contains(query, "ILIKE") {
		t.Fatalf("query = %q, want it to contain ILIKE", query)
	}

	// Guard against accidentally emitting LOWER(col) LIKE ..., which would
	// disable the pg_trgm GIN index.
	if strings.Contains(strings.ToUpper(query), "LOWER(") {
		t.Fatalf("query = %q, must not wrap the column in LOWER()", query)
	}

	if len(args) != 1 || args[0] != "%orders%" {
		t.Fatalf("args = %v, want [%%orders%%]", args)
	}
}

func Test_BuildClauses_EqualityAndInequality(t *testing.T) {
	t.Parallel()

	t.Run("equality", func(t *testing.T) {
		t.Parallel()

		query, args := filterSQL(t, `object_type = "TABLE"`)
		if !strings.Contains(query, "g.object_type") || !strings.Contains(query, "=") {
			t.Fatalf("query = %q, want an equality on g.object_type", query)
		}

		if len(args) != 1 || args[0] != tokTABLE {
			t.Fatalf("args = %v, want [TABLE]", args)
		}
	})

	t.Run("inequality", func(t *testing.T) {
		t.Parallel()

		query, args := filterSQL(t, `object_type != "VIEW"`)
		if !strings.Contains(query, "g.object_type") {
			t.Fatalf("query = %q, want a predicate on g.object_type", query)
		}

		if len(args) != 1 || args[0] != "VIEW" {
			t.Fatalf("args = %v, want [VIEW]", args)
		}
	})

	t.Run("bool", func(t *testing.T) {
		t.Parallel()

		query, args := filterSQL(t, `is_system = false`)
		if !strings.Contains(query, "g.is_system") {
			t.Fatalf("query = %q, want a predicate on g.is_system", query)
		}

		if len(args) != 1 || args[0] != false {
			t.Fatalf("args = %v, want [false]", args)
		}
	})
}

func Test_BuildClauses_CombinedAND(t *testing.T) {
	t.Parallel()

	query, args := filterSQL(t, `object_type = "TABLE" AND display_name:"foo"`)

	if !strings.Contains(query, "ILIKE") || !strings.Contains(strings.ToUpper(query), " AND ") {
		t.Fatalf("query = %q, want both conditions ANDed", query)
	}

	if len(args) != 2 || args[0] != tokTABLE || args[1] != "%foo%" {
		t.Fatalf("args = %v, want [TABLE %%foo%%]", args)
	}
}

func Test_BuildClauses_NoFilterNoCursor(t *testing.T) {
	t.Parallel()

	core := newFilterTestCore()
	schema := aipjet.Bind(core, newFilterTestColumns())

	plan, err := aip.BuildPlan(core, aip.Params{})
	if err != nil {
		t.Fatalf("BuildPlan() error = %v", err)
	}

	where, orderBy, err := aipjet.BuildClauses(schema, plan)
	if err != nil {
		t.Fatalf("BuildClauses() error = %v", err)
	}

	if where != nil {
		t.Fatalf("BuildClauses() where = %v, want nil", where)
	}

	if len(orderBy) != 1 {
		t.Fatalf("BuildClauses() orderBy len = %d, want 1 (default order)", len(orderBy))
	}
}

func TestBind_PanicsOnUnboundOrderableField(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Bind() did not panic on a missing binding")
		}
	}()

	aipjet.Bind(newFilterTestCore(), aipjet.Columns{
		"display_name": postgres.StringColumn("g.display_name"),
		// object_type, is_system, secret unbound.
	})
}

func TestBind_PanicsOnCodecColumnMismatch(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Bind() did not panic on a StringCodec field bound to a bool column")
		}
	}()

	cols := newFilterTestColumns()
	cols["display_name"] = postgres.BoolColumn("g.display_name")

	aipjet.Bind(newFilterTestCore(), cols)
}

func TestBind_PanicsOnUnknownPath(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Bind() did not panic on an unknown binding path")
		}
	}()

	cols := newFilterTestColumns()
	cols["nope"] = postgres.StringColumn("g.nope")

	aipjet.Bind(newFilterTestCore(), cols)
}
