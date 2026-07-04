package aip

import (
	"errors"
	"testing"
)

func TestParseOrderBy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		input       string
		expected    OrderBy
		expectError bool
	}{
		{
			name:     "empty string",
			input:    "",
			expected: OrderBy{},
		},
		{
			name:     "whitespace only",
			input:    "   ",
			expected: OrderBy{},
		},
		{
			name:  "single field ascending default",
			input: "display_name",
			expected: OrderBy{Fields: []OrderField{
				{Path: "display_name", Direction: Asc},
			}},
		},
		{
			name:  "single field ascending explicit",
			input: "display_name asc",
			expected: OrderBy{Fields: []OrderField{
				{Path: "display_name", Direction: Asc},
			}},
		},
		{
			name:  "single field descending",
			input: "create_time desc",
			expected: OrderBy{Fields: []OrderField{
				{Path: "create_time", Direction: Desc},
			}},
		},
		{
			name:  "multiple fields",
			input: "display_name asc, create_time desc",
			expected: OrderBy{Fields: []OrderField{
				{Path: "display_name", Direction: Asc},
				{Path: "create_time", Direction: Desc},
			}},
		},
		{
			name:  "mixed spacing",
			input: "display_name  asc,   create_time desc  ",
			expected: OrderBy{Fields: []OrderField{
				{Path: "display_name", Direction: Asc},
				{Path: "create_time", Direction: Desc},
			}},
		},
		{
			name:  "uppercase directions",
			input: "field1 ASC, field2 DESC",
			expected: OrderBy{Fields: []OrderField{
				{Path: "field1", Direction: Asc},
				{Path: "field2", Direction: Desc},
			}},
		},
		{
			name:  "mixed case directions",
			input: "field1 AsC, field2 DeSc",
			expected: OrderBy{Fields: []OrderField{
				{Path: "field1", Direction: Asc},
				{Path: "field2", Direction: Desc},
			}},
		},
		{
			name:        "invalid character",
			input:       "field@name",
			expectError: true,
		},
		{
			name:        "invalid direction",
			input:       "field1 invalid",
			expectError: true,
		},
		{
			name:        "too many parts",
			input:       "field1 asc extra",
			expectError: true,
		},
		{
			name:        "trailing comma",
			input:       "display_name,",
			expectError: true,
		},
		{
			name:        "empty field spec in middle",
			input:       "field1,,field2",
			expectError: true,
		},
		{
			name:        "duplicate fields",
			input:       "display_name asc, display_name desc",
			expectError: true,
		},
		{
			name:        "duplicate fields same direction",
			input:       "field1, field1",
			expectError: true,
		},
		{
			name:        "dotted paths rejected",
			input:       "labels.environment desc",
			expectError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			ob, err := ParseOrderBy(tc.input)

			if tc.expectError {
				if err == nil {
					t.Error("expected error but got none")
				}

				if !errors.Is(err, ErrInvalidOrderBy) {
					t.Errorf("expected ErrInvalidOrderBy, got %v", err)
				}

				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(ob.Fields) != len(tc.expected.Fields) {
				t.Fatalf("field count: got %d, want %d", len(ob.Fields), len(tc.expected.Fields))
			}

			for i, f := range ob.Fields {
				exp := tc.expected.Fields[i]
				if f.Path != exp.Path || f.Direction != exp.Direction {
					t.Errorf("field[%d]: got {%q, desc=%v}, want {%q, desc=%v}",
						i, f.Path, f.Direction, exp.Path, exp.Direction)
				}
			}
		})
	}
}

func TestSchema_EffectiveOrderBy(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()

	t.Run("empty uses defaults and tie-breaker", func(t *testing.T) {
		t.Parallel()

		ob, err := schema.effectiveOrderBy("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(ob.Fields) != 2 {
			t.Fatalf("expected 2 fields, got %d", len(ob.Fields))
		}

		if ob.Fields[0].Path != "display_name" || ob.Fields[0].Direction != Asc {
			t.Errorf("expected display_name asc, got %s dir=%v", ob.Fields[0].Path, ob.Fields[0].Direction)
		}

		if ob.Fields[1].Path != "id" || ob.Fields[1].Direction != Asc {
			t.Errorf("expected id asc, got %s dir=%v", ob.Fields[1].Path, ob.Fields[1].Direction)
		}
	})

	t.Run("user order with tie-breaker appended", func(t *testing.T) {
		t.Parallel()

		ob, err := schema.effectiveOrderBy("create_time desc")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(ob.Fields) != 2 {
			t.Fatalf("expected 2 fields, got %d", len(ob.Fields))
		}

		if ob.Fields[0].Path != "create_time" || ob.Fields[0].Direction != Desc {
			t.Errorf("expected create_time desc, got %s dir=%v", ob.Fields[0].Path, ob.Fields[0].Direction)
		}

		if ob.Fields[1].Path != "id" || ob.Fields[1].Direction != Asc {
			t.Errorf("expected id asc, got %s dir=%v", ob.Fields[1].Path, ob.Fields[1].Direction)
		}
	})

	t.Run("tie-breaker not duplicated if user includes it", func(t *testing.T) {
		t.Parallel()

		ob, err := schema.effectiveOrderBy("id desc")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// "id" was user-specified, so tie-breaker should not add a duplicate
		if len(ob.Fields) != 1 {
			t.Fatalf("expected 1 field, got %d", len(ob.Fields))
		}
	})

	t.Run("invalid field rejected", func(t *testing.T) {
		t.Parallel()

		_, err := schema.effectiveOrderBy("nonexistent_field")
		if err == nil {
			t.Fatal("expected error for nonexistent field")
		}

		if !errors.Is(err, ErrInvalidOrderBy) {
			t.Errorf("expected ErrInvalidOrderBy, got: %v", err)
		}
	})
}

func TestIsUniformDirection(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		order  OrderBy
		expect bool
	}{
		{"empty", OrderBy{}, true},
		{"single ASC", OrderBy{Fields: []OrderField{{Path: "a"}}}, true},
		{"all ASC", OrderBy{Fields: []OrderField{{Path: "a"}, {Path: "b"}}}, true},
		{"all DESC", OrderBy{Fields: []OrderField{{Path: "a", Direction: Desc}, {Path: "b", Direction: Desc}}}, true},
		{"mixed", OrderBy{Fields: []OrderField{{Path: "a"}, {Path: "b", Direction: Desc}}}, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := tc.order.IsUniformDirection(); got != tc.expect {
				t.Errorf("IsUniformDirection() = %v, want %v", got, tc.expect)
			}
		})
	}
}
