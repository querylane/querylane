package postgres

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func convertToCell(v any) *api.TableCell {
	return &api.TableCell{Value: convertToValue(v)}
}

// convertToValue handles values without column metadata. Used by the SQL
// editor stream and as a fallback for the data-grid path. Prefer
// convertToValueTyped when the column's data_type is known.
func convertToValue(v any) *api.TableValue {
	if v == nil {
		return &api.TableValue{Kind: &api.TableValue_NullValue{}}
	}

	switch val := v.(type) {
	case bool:
		return &api.TableValue{Kind: &api.TableValue_BoolValue{BoolValue: val}}
	case int64:
		return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: val}}
	case int32:
		return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: int64(val)}}
	case float64:
		return &api.TableValue{Kind: &api.TableValue_DoubleValue{DoubleValue: val}}
	case string:
		return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: val}}
	case []byte:
		return &api.TableValue{Kind: &api.TableValue_BytesValue{BytesValue: val}}
	case time.Time:
		return &api.TableValue{Kind: &api.TableValue_TimestampValue{TimestampValue: val.Format(time.RFC3339Nano)}}
	default:
		return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: fmt.Sprintf("%v", val)}}
	}
}

// convertToValueTyped dispatches on the column's high-level DataType so
// that PostgreSQL types arriving as []byte from pgx (numeric, jsonb, uuid,
// etc.) are surfaced in the correct TableValue kind instead of falling
// through to bytes_value or string_value.
//
// The column metadata is the source of truth — pgx does not attach the
// column's pg type to the scanned value. When the value is nil we always
// return null_value regardless of the column type.
func convertToValueTyped(v any, col *api.TableResultColumn) *api.TableValue {
	if v == nil {
		return &api.TableValue{Kind: &api.TableValue_NullValue{}}
	}

	switch col.GetDataType() { //nolint:exhaustive // default falls through to convertToValue
	case api.DataType_DATA_TYPE_INTEGER:
		switch n := v.(type) {
		case int64:
			return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: n}}
		case int32:
			return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: int64(n)}}
		case int:
			return &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: int64(n)}}
		}
	case api.DataType_DATA_TYPE_FLOAT:
		// "numeric" and "decimal" arrive from pgx as []byte to preserve
		// arbitrary precision; surface them as numeric_value strings so the
		// frontend can render without precision loss.
		switch n := v.(type) {
		case float64:
			// real / double precision arrive as float64.
			return &api.TableValue{Kind: &api.TableValue_DoubleValue{DoubleValue: n}}
		case []byte:
			return &api.TableValue{Kind: &api.TableValue_NumericValue{NumericValue: string(n)}}
		case string:
			return &api.TableValue{Kind: &api.TableValue_NumericValue{NumericValue: n}}
		}
	case api.DataType_DATA_TYPE_JSON:
		// jsonb / json — pgx scans into []byte (raw JSON text).
		switch n := v.(type) {
		case []byte:
			return &api.TableValue{Kind: &api.TableValue_JsonValue{JsonValue: string(n)}}
		case string:
			return &api.TableValue{Kind: &api.TableValue_JsonValue{JsonValue: n}}
		}
	case api.DataType_DATA_TYPE_UUID:
		// uuid arrives from pgx as a [16]byte. Render it as the canonical
		// 8-4-4-4-12 hex string.
		switch n := v.(type) {
		case [16]byte:
			return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: uuid.UUID(n).String()}}
		case []byte:
			if len(n) == 16 {
				return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: uuid.UUID([16]byte(n)).String()}}
			}

			return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: string(n)}}
		case string:
			return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: n}}
		}
	case api.DataType_DATA_TYPE_BOOLEAN:
		if b, ok := v.(bool); ok {
			return &api.TableValue{Kind: &api.TableValue_BoolValue{BoolValue: b}}
		}
	case api.DataType_DATA_TYPE_BINARY:
		switch n := v.(type) {
		case []byte:
			return &api.TableValue{Kind: &api.TableValue_BytesValue{BytesValue: n}}
		case string:
			return &api.TableValue{Kind: &api.TableValue_BytesValue{BytesValue: []byte(n)}}
		}
	case api.DataType_DATA_TYPE_DATE, api.DataType_DATA_TYPE_TIME, api.DataType_DATA_TYPE_TIMESTAMP:
		if t, ok := v.(time.Time); ok {
			return &api.TableValue{Kind: &api.TableValue_TimestampValue{TimestampValue: t.Format(time.RFC3339Nano)}}
		}
	case api.DataType_DATA_TYPE_STRING:
		switch n := v.(type) {
		case string:
			return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: n}}
		case []byte:
			return &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: string(n)}}
		}
	}

	// Fall back to Go-type-driven conversion for ARRAY/GEOMETRY/UNKNOWN/etc.
	return convertToValue(v)
}

// extractTableValues turns proto TableValue oneofs into Go scalars suitable
// for parameterized SQL. Unknown kinds are passed through as their proto
// string form, mirroring the previous behavior with structpb.Value.
func extractTableValues(values []*api.TableValue) []any {
	result := make([]any, 0, len(values))

	for _, value := range values {
		switch kind := value.GetKind().(type) {
		case *api.TableValue_NullValue:
			result = append(result, nil)
		case *api.TableValue_BoolValue:
			result = append(result, kind.BoolValue)
		case *api.TableValue_Int64Value:
			result = append(result, kind.Int64Value)
		case *api.TableValue_DoubleValue:
			result = append(result, kind.DoubleValue)
		case *api.TableValue_StringValue:
			result = append(result, kind.StringValue)
		case *api.TableValue_BytesValue:
			result = append(result, kind.BytesValue)
		case *api.TableValue_JsonValue:
			result = append(result, kind.JsonValue)
		case *api.TableValue_NumericValue:
			result = append(result, kind.NumericValue)
		case *api.TableValue_TimestampValue:
			result = append(result, kind.TimestampValue)
		default:
			result = append(result, nil)
		}
	}

	return result
}
