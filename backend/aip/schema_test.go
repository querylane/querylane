package aip

import (
	"strings"
	"testing"
	"time"
)

// testModel is a minimal model for testing.
type testModel struct {
	ID          string
	DisplayName string
	Engine      string
	CreatedAt   time.Time
}

// newTestSchema creates a schema for testModel used across tests.
func newTestSchema() *Schema[testModel] {
	return NewSchema(
		"console.querylane.dev/Test",
		Fields[testModel]{
			"display_name": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.DisplayName },
			},
			"engine": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.Engine },
			},
			"create_time": {
				Codec:    TimestampCodec{},
				GetValue: func(m *testModel) any { return m.CreatedAt },
			},
			"id": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
		},
		WithDefaultOrder("display_name", Asc),
		WithTieBreaker("id", Asc),
	)
}

func TestNewSchema_Defaults(t *testing.T) {
	t.Parallel()

	schema := NewSchema(
		"console.querylane.dev/Test",
		Fields[testModel]{
			"id": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
		},
	)

	if schema.defaultPageSize != 50 {
		t.Errorf("expected default page size 50, got %d", schema.defaultPageSize)
	}

	if schema.resourceType != "console.querylane.dev/Test" {
		t.Errorf("expected resource type %q, got %q", "console.querylane.dev/Test", schema.resourceType)
	}

	if schema.maxPageSize != 1000 {
		t.Errorf("expected max page size 1000, got %d", schema.maxPageSize)
	}
}

func TestNewSchema_CustomPageSize(t *testing.T) {
	t.Parallel()

	schema := NewSchema(
		"console.querylane.dev/Test",
		Fields[testModel]{
			"id": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
		},
		WithDefaultPageSize(25),
		WithMaxPageSize(500),
	)

	if schema.defaultPageSize != 25 {
		t.Errorf("expected default page size 25, got %d", schema.defaultPageSize)
	}

	if schema.maxPageSize != 500 {
		t.Errorf("expected max page size 500, got %d", schema.maxPageSize)
	}
}

func TestSchema_AllowedFields(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()
	allowed := schema.allowedFields()

	expected := []string{"create_time", "display_name", "engine", "id"}
	if len(allowed) != len(expected) {
		t.Fatalf("expected %d allowed fields, got %d", len(expected), len(allowed))
	}

	for i, f := range allowed {
		if f != expected[i] {
			t.Errorf("allowed[%d] = %q, want %q", i, f, expected[i])
		}
	}
}

func TestSchema_OrderByErrorListsOnlyOrderableFields(t *testing.T) {
	t.Parallel()

	schema := NewSchema(
		"console.querylane.dev/Test",
		Fields[testModel]{
			"name": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
			"display_name": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.DisplayName },
			},
			"is_system": {
				Codec:           BoolCodec{},
				DisableOrdering: true,
				GetValue:        func(_ *testModel) any { return true },
			},
		},
		WithNameOrdering(),
	)

	tests := []struct {
		name    string
		orderBy string
	}{
		{name: "unknown field", orderBy: "nonexistent asc"},
		{name: "ordering-disabled field", orderBy: "is_system asc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := schema.effectiveOrderBy(tt.orderBy)
			if err == nil {
				t.Fatal("expected error for non-orderable field")
			}

			if !strings.HasSuffix(err.Error(), "(allowed: display_name, name)") {
				t.Errorf("error %q should list only orderable fields, ending with %q",
					err.Error(), "(allowed: display_name, name)")
			}
		})
	}
}

func TestSchema_ExtractCursorValues(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()
	now := time.Date(2025, 1, 15, 10, 30, 0, 0, time.UTC)

	row := &testModel{
		ID:          "test-123",
		DisplayName: "My Instance",
		Engine:      "POSTGRESQL",
		CreatedAt:   now,
	}

	t.Run("string fields", func(t *testing.T) {
		t.Parallel()

		orderBy := OrderBy{Fields: []OrderField{
			{Path: "display_name"},
			{Path: "id"},
		}}

		vals, err := schema.extractCursorValues(row, orderBy)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(vals) != 2 {
			t.Fatalf("expected 2 values, got %d", len(vals))
		}

		if vals[0] != "My Instance" {
			t.Errorf("vals[0] = %v, want %q", vals[0], "My Instance")
		}

		if vals[1] != "test-123" {
			t.Errorf("vals[1] = %v, want %q", vals[1], "test-123")
		}
	})

	t.Run("timestamp field", func(t *testing.T) {
		t.Parallel()

		orderBy := OrderBy{Fields: []OrderField{
			{Path: "create_time", Direction: Desc},
			{Path: "id"},
		}}

		vals, err := schema.extractCursorValues(row, orderBy)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(vals) != 2 {
			t.Fatalf("expected 2 values, got %d", len(vals))
		}

		if gotTime, ok := vals[0].(time.Time); !ok || !gotTime.Equal(now) {
			t.Errorf("vals[0] = %v, want %v", vals[0], now)
		}
	})

	t.Run("unknown field", func(t *testing.T) {
		t.Parallel()

		orderBy := OrderBy{Fields: []OrderField{
			{Path: "nonexistent"},
		}}

		_, err := schema.extractCursorValues(row, orderBy)
		if err == nil {
			t.Fatal("expected error for unknown field")
		}
	})
}

func TestNewSchema_ValidationPanics(t *testing.T) {
	t.Parallel()

	t.Run("missing codec panics", func(t *testing.T) {
		t.Parallel()

		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic for missing codec")
			}
		}()

		NewSchema(
			"console.querylane.dev/Test",
			Fields[testModel]{
				"id": {
					GetValue: func(m *testModel) any { return m.ID },
				},
			},
			WithDefaultOrder("id", Asc),
		)
	})

	// Missing database bindings are validated by the backend subpackages'
	// Bind (aip/jet, aip/rawsql), not by NewSchema — see their tests.

	t.Run("invalid default order panics", func(t *testing.T) {
		t.Parallel()

		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic for nonexistent default order field")
			}
		}()

		NewSchema(
			"console.querylane.dev/Test",
			Fields[testModel]{
				"id": {
					Codec:    StringCodec{},
					GetValue: func(m *testModel) any { return m.ID },
				},
			},
			WithDefaultOrder("nonexistent", Asc),
		)
	})

	t.Run("disabled ordering in tie-breaker panics", func(t *testing.T) {
		t.Parallel()

		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic for disabled ordering in tie-breaker")
			}
		}()

		NewSchema(
			"console.querylane.dev/Test",
			Fields[testModel]{
				"id": {
					Codec:           StringCodec{},
					DisableOrdering: true,
					GetValue:        func(m *testModel) any { return m.ID },
				},
			},
			WithTieBreaker("id", Asc),
		)
	})
}

func TestBuildPlan_MaxPageSize(t *testing.T) {
	t.Parallel()

	schema := NewSchema(
		"console.querylane.dev/Test",
		Fields[testModel]{
			"id": {
				Codec:    StringCodec{},
				GetValue: func(m *testModel) any { return m.ID },
			},
		},
		WithDefaultOrder("id", Asc),
		WithMaxPageSize(100),
	)

	plan, err := BuildPlan[testModel](schema, Params{PageSize: 500})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if plan.PageSize != 100 {
		t.Errorf("expected page size clamped to 100, got %d", plan.PageSize)
	}
}
