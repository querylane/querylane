package aip

import (
	"errors"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	commonv1 "github.com/querylane/querylane/backend/protogen/querylane/common/v1"
)

func TestEncodeDecodeToken_RoundTrip(t *testing.T) {
	t.Parallel()

	codecs := map[string]CursorCodec{
		"display_name": StringCodec{},
		"id":           StringCodec{},
	}

	orderBy := OrderBy{Fields: []OrderField{
		{Path: "display_name", Direction: Asc},
		{Path: "id", Direction: Asc},
	}}

	cursorValues := []any{"Test Name", "abc123"}

	tokenStr, err := EncodeToken("console.querylane.dev/Test", cursorValues, orderBy, "some-filter", codecs)
	if err != nil {
		t.Fatalf("EncodeToken failed: %v", err)
	}

	if tokenStr == "" {
		t.Fatal("expected non-empty token string")
	}

	// Decode it back
	token, err := decodeToken(tokenStr)
	if err != nil {
		t.Fatalf("decodeToken failed: %v", err)
	}

	if token.ResourceType != "console.querylane.dev/Test" {
		t.Errorf("resource type = %q, want %q", token.ResourceType, "console.querylane.dev/Test")
	}

	if len(token.OrderFields) != 2 {
		t.Fatalf("expected 2 order fields, got %d", len(token.OrderFields))
	}

	if token.OrderFields[0].FieldName != "display_name" {
		t.Errorf("order field 0 = %q, want %q", token.OrderFields[0].FieldName, "display_name")
	}

	if len(token.CursorValues) != 2 {
		t.Fatalf("expected 2 cursor values, got %d", len(token.CursorValues))
	}

	if token.CursorValues[0].GetStringValue() != "Test Name" {
		t.Errorf("cursor value 0 = %q, want %q", token.CursorValues[0].GetStringValue(), "Test Name")
	}

	if token.FilterHash == "" {
		t.Error("expected non-empty filter hash")
	}
}

func TestDecodeToken_Empty(t *testing.T) {
	t.Parallel()

	token, err := decodeToken("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if token != nil {
		t.Error("expected nil token for empty string")
	}
}

func TestDecodeToken_InvalidBase64(t *testing.T) {
	t.Parallel()

	_, err := decodeToken("not-valid-base64!@#$")
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
}

func TestDecodeToken_InvalidProto(t *testing.T) {
	t.Parallel()

	// Valid base64 but invalid protobuf - use raw bytes that aren't valid proto
	_, err := decodeToken("aGVsbG8gd29ybGQ=") // "hello world" in base64
	// This may or may not error depending on proto tolerance, but shouldn't panic
	_ = err
}

func TestValidateToken_Nil(t *testing.T) {
	t.Parallel()

	err := validateToken(nil, "console.querylane.dev/Test", "")
	if err != nil {
		t.Fatalf("unexpected error for nil token: %v", err)
	}
}

func TestValidateToken_Expired(t *testing.T) {
	t.Parallel()

	token := &commonv1.PageToken{
		CreateTime:   timestamppb.New(time.Now().Add(-25 * time.Hour)),
		ResourceType: "console.querylane.dev/Test",
	}

	err := validateToken(token, "console.querylane.dev/Test", "")
	if err == nil {
		t.Fatal("expected error for expired token")
	}

	if !errors.Is(err, errTokenExpired) {
		t.Errorf("expected errTokenExpired, got: %v", err)
	}
}

func TestValidateToken_WrongResourceType(t *testing.T) {
	t.Parallel()

	token := &commonv1.PageToken{
		CreateTime:   timestamppb.Now(),
		ResourceType: "console.querylane.dev/Other",
	}

	err := validateToken(token, "console.querylane.dev/Test", "")
	if err == nil {
		t.Fatal("expected error for wrong resource type")
	}

	if !errors.Is(err, errTokenWrongResource) {
		t.Errorf("expected errTokenWrongResource, got: %v", err)
	}
}

func TestValidateToken_FilterMismatch(t *testing.T) {
	t.Parallel()

	token := &commonv1.PageToken{
		CreateTime:   timestamppb.Now(),
		ResourceType: "console.querylane.dev/Test",
		FilterHash:   hashFilter("original-filter"),
	}

	err := validateToken(token, "console.querylane.dev/Test", "different-filter")
	if err == nil {
		t.Fatal("expected error for filter mismatch")
	}

	if !errors.Is(err, ErrFilterMismatch) {
		t.Errorf("expected ErrFilterMismatch, got: %v", err)
	}
}

func TestValidateToken_Valid(t *testing.T) {
	t.Parallel()

	filter := "status=active"
	token := &commonv1.PageToken{
		CreateTime:   timestamppb.Now(),
		ResourceType: "console.querylane.dev/Test",
		FilterHash:   hashFilter(filter),
	}

	err := validateToken(token, "console.querylane.dev/Test", filter)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHashFilter(t *testing.T) {
	t.Parallel()

	t.Run("empty filter returns empty hash", func(t *testing.T) {
		t.Parallel()

		if h := hashFilter(""); h != "" {
			t.Errorf("expected empty hash, got %q", h)
		}
	})

	t.Run("same filter produces same hash", func(t *testing.T) {
		t.Parallel()

		h1 := hashFilter("status=active")

		h2 := hashFilter("status=active")
		if h1 != h2 {
			t.Errorf("hashes differ for same filter: %q vs %q", h1, h2)
		}
	})

	t.Run("different filters produce different hashes", func(t *testing.T) {
		t.Parallel()

		h1 := hashFilter("status=active")

		h2 := hashFilter("status=inactive")
		if h1 == h2 {
			t.Error("expected different hashes for different filters")
		}
	})
}

func TestDecodeCursorValues(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()

	t.Run("nil token returns nil values", func(t *testing.T) {
		t.Parallel()

		vals, err := schema.decodeCursorValues(nil, OrderBy{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if vals != nil {
			t.Error("expected nil values for nil token")
		}
	})

	t.Run("valid token decodes values", func(t *testing.T) {
		t.Parallel()

		token := &commonv1.PageToken{
			OrderFields: []*commonv1.OrderField{
				{FieldName: "display_name", Direction: commonv1.OrderDirection_ORDER_DIRECTION_ASC},
				{FieldName: "id", Direction: commonv1.OrderDirection_ORDER_DIRECTION_ASC},
			},
			CursorValues: []*structpb.Value{
				structpb.NewStringValue("Test"),
				structpb.NewStringValue("abc123"),
			},
		}

		orderBy := OrderBy{Fields: []OrderField{
			{Path: "display_name", Direction: Asc},
			{Path: "id", Direction: Asc},
		}}

		vals, err := schema.decodeCursorValues(token, orderBy)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(vals) != 2 {
			t.Fatalf("expected 2 values, got %d", len(vals))
		}

		if vals[0] != "Test" {
			t.Errorf("vals[0] = %v, want %q", vals[0], "Test")
		}
	})

	t.Run("cursor/order field count mismatch", func(t *testing.T) {
		t.Parallel()

		token := &commonv1.PageToken{
			OrderFields: []*commonv1.OrderField{
				{FieldName: "display_name", Direction: commonv1.OrderDirection_ORDER_DIRECTION_ASC},
			},
			CursorValues: []*structpb.Value{
				structpb.NewStringValue("Test"),
				structpb.NewStringValue("extra"),
			},
		}

		orderBy := OrderBy{Fields: []OrderField{
			{Path: "display_name", Direction: Asc},
		}}

		_, err := schema.decodeCursorValues(token, orderBy)
		if err == nil {
			t.Fatal("expected error for mismatched counts")
		}
	})

	t.Run("order changed since token issued", func(t *testing.T) {
		t.Parallel()

		token := &commonv1.PageToken{
			OrderFields: []*commonv1.OrderField{
				{FieldName: "display_name", Direction: commonv1.OrderDirection_ORDER_DIRECTION_ASC},
			},
			CursorValues: []*structpb.Value{
				structpb.NewStringValue("Test"),
			},
		}

		// Different ordering than token
		orderBy := OrderBy{Fields: []OrderField{
			{Path: "display_name", Direction: Desc}, // DESC instead of ASC
		}}

		_, err := schema.decodeCursorValues(token, orderBy)
		if err == nil {
			t.Fatal("expected error for order mismatch")
		}
	})
}

func TestBuildPlan_InvalidOrderBy(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()

	_, err := BuildPlan(schema, Params{OrderBy: "nonexistent_field"})
	if err == nil {
		t.Fatal("expected error for invalid order_by")
	}

	if !errors.Is(err, ErrInvalidOrderBy) {
		t.Errorf("expected ErrInvalidOrderBy, got: %v", err)
	}
}

func TestBuildPlan_InvalidPageToken(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()

	_, err := BuildPlan(schema, Params{PageToken: "not-valid-base64!@#$"})
	if err == nil {
		t.Fatal("expected error for invalid page_token")
	}

	if !errors.Is(err, ErrInvalidPageToken) {
		t.Errorf("expected ErrInvalidPageToken, got: %v", err)
	}
}

func TestBuildPlan_FilterMismatch(t *testing.T) {
	t.Parallel()

	schema := newTestSchema()

	// Create a valid token with filter "foo"
	codecs := map[string]CursorCodec{
		"display_name": StringCodec{},
		"id":           StringCodec{},
	}

	orderBy := OrderBy{Fields: []OrderField{
		{Path: "display_name", Direction: Asc},
		{Path: "id", Direction: Asc},
	}}

	tokenStr, err := EncodeToken(
		"console.querylane.dev/Test",
		[]any{"test", "abc123"},
		orderBy, "foo", codecs)
	if err != nil {
		t.Fatalf("failed to create token: %v", err)
	}

	// Use token with different filter
	_, err = BuildPlan(schema, Params{PageToken: tokenStr, Filter: "bar"})
	if err == nil {
		t.Fatal("expected error for filter mismatch")
	}

	if !errors.Is(err, ErrFilterMismatch) {
		t.Errorf("expected ErrFilterMismatch, got: %v", err)
	}
}
