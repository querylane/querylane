package jet

import (
	"reflect"
	"strings"
	"testing"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
)

func TestRawPredicatePreservesPlaceholdersAfterBaseCondition(t *testing.T) {
	t.Parallel()

	where := strings.Join([]string{
		`("things"."value_1" = $1)`,
		`("things"."value_2" = $2)`,
		`("things"."value_3" = $3)`,
		`("things"."value_4" = $4)`,
		`("things"."value_5" = $5)`,
		`("things"."value_6" = $6)`,
		`("things"."value_7" = $7)`,
		`("things"."value_8" = $8)`,
		`("things"."value_9" = $9)`,
		`("things"."value_10" = $10)`,
	}, " AND ")
	predicateArgs := []any{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

	predicate := rawPredicate(where, predicateArgs)
	baseCondition := postgres.StringColumn("tenant_id").EQ(postgres.String("tenant-1"))
	query, args := postgres.SELECT(postgres.Raw("1")).
		WHERE(baseCondition.AND(predicate)).
		Sql()

	if !strings.Contains(query, `"things"."value_1" = $2`) {
		t.Fatalf("query = %q, want first predicate placeholder to follow the base condition", query)
	}

	if !strings.Contains(query, `"things"."value_10" = $11`) {
		t.Fatalf("query = %q, want $10 to remain distinct from $1", query)
	}

	wantArgs := []any{"tenant-1", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
	if !reflect.DeepEqual(args, wantArgs) {
		t.Fatalf("args = %v, want %v", args, wantArgs)
	}
}

func TestRawColumnExpressionQuotesJetIdentifiers(t *testing.T) {
	t.Parallel()

	column := postgres.StringColumn(`display"name`)
	postgres.NewTable("public", "things", "item", column)

	if got, want := rawColumnExpression(column), `"item"."display""name"`; got != want {
		t.Fatalf("rawColumnExpression() = %q, want %q", got, want)
	}
}

func TestRawSQLPredicateEmbedsWithBaseConditionAndMixedCursor(t *testing.T) {
	t.Parallel()

	type model struct {
		ID       string
		Name     string
		IsSystem bool
	}

	core := aip.NewSchema(
		"console.querylane.dev/AdapterTest",
		aip.Fields[model]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(row *model) any { return row.Name },
				Filterable: true,
			},
			"id": {
				Codec:    aip.StringCodec{},
				GetValue: func(row *model) any { return row.ID },
			},
			"is_system": {
				Codec:           aip.BoolCodec{},
				DisableOrdering: true,
				Filterable:      true,
			},
		},
		aip.WithDefaultOrder("name", aip.Asc),
		aip.WithTieBreaker("id", aip.Asc),
	)

	nameColumn := postgres.StringColumn("name")
	idColumn := postgres.StringColumn("id")
	isSystemColumn := postgres.BoolColumn("is_system")
	tenantColumn := postgres.StringColumn("tenant_id")
	postgres.NewTable("public", "things", "things", nameColumn, idColumn, isSystemColumn, tenantColumn)

	schema := Bind(core, Columns{
		"name":      nameColumn,
		"id":        idColumn,
		"is_system": isSystemColumn,
	})
	order := aip.OrderBy{Fields: []aip.OrderField{
		{Path: "name"},
		{Path: "id", Direction: aip.Desc},
	}}
	filter := `name:"foo" AND is_system = false`

	pageToken, err := aip.EncodeToken(
		"console.querylane.dev/AdapterTest",
		[]any{"alpha", "id-9"},
		order,
		filter,
		map[string]aip.CursorCodec{"name": aip.StringCodec{}, "id": aip.StringCodec{}},
	)
	if err != nil {
		t.Fatalf("EncodeToken() error = %v", err)
	}

	plan, err := aip.BuildPlan(core, aip.Params{
		PageToken: pageToken,
		Filter:    filter,
		OrderBy:   "name asc, id desc",
	})
	if err != nil {
		t.Fatalf("BuildPlan() error = %v", err)
	}

	clauses, err := rawsql.BuildClauses(schema.raw, plan, 1)
	if err != nil {
		t.Fatalf("rawsql.BuildClauses() error = %v", err)
	}

	query, args := postgres.SELECT(postgres.Raw("1")).
		WHERE(tenantColumn.EQ(postgres.String("tenant-1")).AND(rawPredicate(clauses.Where, clauses.Args))).
		ORDER_BY(orderByClauses(schema.cols, plan.OrderBy)...).
		LIMIT(int64(clauses.Limit)).
		Sql()

	for _, fragment := range []string{
		`"things"."name" ILIKE $2`,
		`"things"."is_system" = $3`,
		`"things"."name" > $4`,
		`"things"."name" = $5`,
		`"things"."id" < $6`,
		`ORDER BY things.name ASC, things.id DESC`,
	} {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query = %q, want fragment %q", query, fragment)
		}
	}

	wantArgs := []any{"tenant-1", "%foo%", false, "alpha", "alpha", "id-9", int64(51)}
	if !reflect.DeepEqual(args, wantArgs) {
		t.Fatalf("args = %v, want %v", args, wantArgs)
	}
}
