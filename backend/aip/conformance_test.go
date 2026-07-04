package aip

import (
	"errors"
	"reflect"
	"sort"
	"testing"
	"time"
)

type conformanceList func(t *testing.T, params Params) ([]testModel, string, error)

func TestListConformance(t *testing.T) { //nolint:tparallel // Short-mode guard must run before t.Parallel().
	if testing.Short() {
		t.Skip("skipping AIP conformance tests in short mode")
	}

	t.Parallel()

	for name, list := range map[string]conformanceList{
		"plan_token_executor": newPlanTokenConformanceList(t),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			runListConformance(t, list)
		})
	}
}

func runListConformance(t *testing.T, list conformanceList) {
	t.Helper()

	t.Run("page_size_plus_one_boundary", func(t *testing.T) {
		t.Parallel()
		page, token, err := list(t, Params{PageSize: 2})
		requireNoErr(t, err)
		assertIDs(t, page, "a-1", "b-1")
		requireNotEmpty(t, token)
		page, token, err = list(t, Params{PageSize: 2, PageToken: token})
		requireNoErr(t, err)
		assertIDs(t, page, "b-2", "c-1")
		requireNotEmpty(t, token)
		page, token, err = list(t, Params{PageSize: 2, PageToken: token})
		requireNoErr(t, err)
		assertIDs(t, page, "d-1")
		requireEmpty(t, token)
	})

	t.Run("exact_page_size_has_empty_token", func(t *testing.T) {
		t.Parallel()
		page, token, err := list(t, Params{PageSize: 5})
		requireNoErr(t, err)
		assertIDs(t, page, "a-1", "b-1", "b-2", "c-1", "d-1")
		requireEmpty(t, token)
	})

	t.Run("order_by_change_rejected", func(t *testing.T) {
		t.Parallel()
		_, token, err := list(t, Params{PageSize: 2, OrderBy: "display_name asc"})
		requireNoErr(t, err)
		requireNotEmpty(t, token)
		_, _, err = list(t, Params{PageSize: 2, PageToken: token, OrderBy: "display_name desc"})
		requireErrIs(t, err, ErrInvalidPageToken)
	})

	t.Run("filter_change_rejected", func(t *testing.T) {
		t.Parallel()
		_, token, err := list(t, Params{PageSize: 2, Filter: "env = 'prod'"})
		requireNoErr(t, err)
		requireNotEmpty(t, token)
		_, _, err = list(t, Params{PageSize: 2, PageToken: token, Filter: "env = 'dev'"})
		requireErrIs(t, err, ErrFilterMismatch)
	})

	t.Run("invalid_token_rejected", func(t *testing.T) {
		t.Parallel()
		_, _, err := list(t, Params{PageSize: 2, PageToken: "not-valid-base64"})
		requireErrIs(t, err, ErrInvalidPageToken)
	})

	t.Run("stable_tie_breaker_no_duplicate_or_skip", func(t *testing.T) {
		t.Parallel()

		seen := make([]string, 0, 5)

		params := Params{PageSize: 1, OrderBy: "display_name asc"}
		for {
			page, token, err := list(t, params)
			requireNoErr(t, err)

			if len(page) != 1 {
				t.Fatalf("page len = %d, want 1", len(page))
			}

			seen = append(seen, page[0].ID)

			if token == "" {
				break
			}

			params.PageToken = token
		}

		assertStrings(t, seen, []string{"a-1", "b-1", "b-2", "c-1", "d-1"})
	})

	t.Run("descending_order_pages", func(t *testing.T) {
		t.Parallel()
		page, token, err := list(t, Params{PageSize: 3, OrderBy: "display_name desc"})
		requireNoErr(t, err)
		assertIDs(t, page, "d-1", "c-1", "b-1")
		requireNotEmpty(t, token)
		page, token, err = list(t, Params{PageSize: 3, PageToken: token, OrderBy: "display_name desc"})
		requireNoErr(t, err)
		assertIDs(t, page, "b-2", "a-1")
		requireEmpty(t, token)
	})
}

func newPlanTokenConformanceList(t *testing.T) conformanceList {
	t.Helper()

	schema := newConformanceSchema()
	rows := []testModel{
		{ID: "d-1", DisplayName: "Delta", CreatedAt: time.Date(2025, 1, 5, 0, 0, 0, 0, time.UTC)},
		{ID: "b-2", DisplayName: "Beta", CreatedAt: time.Date(2025, 1, 4, 0, 0, 0, 0, time.UTC)},
		{ID: "b-1", DisplayName: "Beta", CreatedAt: time.Date(2025, 1, 3, 0, 0, 0, 0, time.UTC)},
		{ID: "c-1", DisplayName: "Charlie", CreatedAt: time.Date(2025, 1, 2, 0, 0, 0, 0, time.UTC)},
		{ID: "a-1", DisplayName: "Alpha", CreatedAt: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)},
	}

	return func(t *testing.T, params Params) ([]testModel, string, error) {
		t.Helper()

		plan, err := BuildPlan(schema, params)
		if err != nil {
			return nil, "", err
		}

		ordered := append([]testModel(nil), rows...)
		sort.SliceStable(ordered, func(i, j int) bool { return compareConformanceRow(ordered[i], ordered[j], plan.OrderBy) < 0 })

		if len(plan.CursorValues) > 0 {
			ordered = conformanceRowsAfterCursor(ordered, plan)
		}

		if limit := int(plan.PageSize) + 1; len(ordered) > limit {
			ordered = ordered[:limit]
		}

		token, err := schema.NextPageToken(plan, ordered)
		if err != nil {
			return nil, "", err
		}

		if len(ordered) > int(plan.PageSize) {
			ordered = ordered[:plan.PageSize]
		}

		return ordered, token, nil
	}
}

func newConformanceSchema() *Schema[testModel] {
	return NewSchema("console.querylane.dev/Test", Fields[testModel]{
		"display_name": {Codec: StringCodec{}, GetValue: func(m *testModel) any { return m.DisplayName }},
		"create_time":  {Codec: TimestampCodec{}, GetValue: func(m *testModel) any { return m.CreatedAt }},
		"id":           {Codec: StringCodec{}, GetValue: func(m *testModel) any { return m.ID }},
	}, WithDefaultOrder("display_name", Asc), WithTieBreaker("id", Asc))
}

func conformanceRowsAfterCursor(rows []testModel, plan *Plan) []testModel {
	for i, row := range rows {
		if compareConformanceRowToCursor(row, plan.OrderBy, plan.CursorValues) > 0 {
			return rows[i:]
		}
	}

	return nil
}

func compareConformanceRow(a, b testModel, order OrderBy) int {
	for _, field := range order.Fields {
		cmp := compareConformanceValue(conformanceValue(a, field.Path), conformanceValue(b, field.Path))
		if cmp == 0 {
			continue
		}

		if field.Direction == Desc {
			return -cmp
		}

		return cmp
	}

	return 0
}

func compareConformanceRowToCursor(row testModel, order OrderBy, cursor []any) int {
	for i, field := range order.Fields {
		cmp := compareConformanceValue(conformanceValue(row, field.Path), cursor[i])
		if cmp == 0 {
			continue
		}

		if field.Direction == Desc {
			return -cmp
		}

		return cmp
	}

	return 0
}

func conformanceValue(row testModel, field string) any {
	switch field {
	case "display_name":
		return row.DisplayName
	case "create_time":
		return row.CreatedAt
	case "id":
		return row.ID
	default:
		return ""
	}
}

func compareConformanceValue(a, b any) int {
	switch av := a.(type) {
	case string:
		bv, ok := b.(string)
		if !ok {
			return 0
		}

		if av < bv {
			return -1
		}

		if av > bv {
			return 1
		}

		return 0
	case time.Time:
		bv, ok := b.(time.Time)
		if !ok {
			return 0
		}

		if av.Before(bv) {
			return -1
		}

		if av.After(bv) {
			return 1
		}

		return 0
	default:
		return 0
	}
}

func assertIDs(t *testing.T, rows []testModel, want ...string) {
	t.Helper()

	got := make([]string, len(rows))
	for i, row := range rows {
		got[i] = row.ID
	}

	assertStrings(t, got, want)
}

func assertStrings(t *testing.T, got, want []string) {
	t.Helper()

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func requireNoErr(t *testing.T, err error) {
	t.Helper()

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func requireErrIs(t *testing.T, err, target error) {
	t.Helper()

	if !errors.Is(err, target) {
		t.Fatalf("error = %v, want %v", err, target)
	}
}

func requireEmpty(t *testing.T, s string) {
	t.Helper()

	if s != "" {
		t.Fatalf("got non-empty string %q", s)
	}
}

func requireNotEmpty(t *testing.T, s string) {
	t.Helper()

	if s == "" {
		t.Fatal("got empty string")
	}
}
