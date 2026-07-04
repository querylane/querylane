package postgres

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func col(dataType api.DataType) *api.TableResultColumn {
	return &api.TableResultColumn{DataType: dataType}
}

func TestConvertToValueTyped(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		value  any
		column *api.TableResultColumn
		check  func(t *testing.T, v *api.TableValue)
	}{
		{
			name:   "nil_returns_null",
			value:  nil,
			column: col(api.DataType_DATA_TYPE_STRING),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()

				_, ok := v.GetKind().(*api.TableValue_NullValue)
				assert.True(t, ok, "expected null_value, got %T", v.GetKind())
			},
		},
		{
			name:   "integer_int64",
			value:  int64(42),
			column: col(api.DataType_DATA_TYPE_INTEGER),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.EqualValues(t, 42, v.GetInt64Value())
			},
		},
		{
			name:   "integer_int32",
			value:  int32(7),
			column: col(api.DataType_DATA_TYPE_INTEGER),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.EqualValues(t, 7, v.GetInt64Value())
			},
		},
		{
			name:   "float_double",
			value:  float64(3.14),
			column: col(api.DataType_DATA_TYPE_FLOAT),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.InEpsilon(t, 3.14, v.GetDoubleValue(), 0.0001)
			},
		},
		{
			name:   "numeric_bytes_becomes_numeric_value",
			value:  []byte("123.4500"),
			column: col(api.DataType_DATA_TYPE_FLOAT),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, "123.4500", v.GetNumericValue())
			},
		},
		{
			name:   "jsonb_bytes_becomes_json_value",
			value:  []byte(`{"a":1}`),
			column: col(api.DataType_DATA_TYPE_JSON),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, `{"a":1}`, v.GetJsonValue())
			},
		},
		{
			name: "uuid_16bytes_becomes_canonical_string",
			value: [16]byte{
				0x55, 0x07, 0x10, 0xa6, 0x88, 0x14, 0x40, 0x00,
				0x80, 0x00, 0x00, 0x80, 0x5f, 0x9b, 0x34, 0xfb,
			},
			column: col(api.DataType_DATA_TYPE_UUID),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, "550710a6-8814-4000-8000-00805f9b34fb", v.GetStringValue())
			},
		},
		{
			name:   "boolean",
			value:  true,
			column: col(api.DataType_DATA_TYPE_BOOLEAN),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.True(t, v.GetBoolValue())
			},
		},
		{
			name:   "binary_bytes",
			value:  []byte{0xde, 0xad, 0xbe, 0xef},
			column: col(api.DataType_DATA_TYPE_BINARY),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, []byte{0xde, 0xad, 0xbe, 0xef}, v.GetBytesValue())
			},
		},
		{
			name:   "timestamp_time",
			value:  time.Date(2025, 5, 10, 12, 34, 56, 0, time.UTC),
			column: col(api.DataType_DATA_TYPE_TIMESTAMP),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, "2025-05-10T12:34:56Z", v.GetTimestampValue())
			},
		},
		{
			name:   "string_text",
			value:  "hello",
			column: col(api.DataType_DATA_TYPE_STRING),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, "hello", v.GetStringValue())
			},
		},
		{
			name:   "string_from_bytes",
			value:  []byte("abc"),
			column: col(api.DataType_DATA_TYPE_STRING),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.Equal(t, "abc", v.GetStringValue())
			},
		},
		{
			name:   "unknown_falls_back_to_go_type_switch",
			value:  int64(99),
			column: col(api.DataType_DATA_TYPE_UNKNOWN),
			check: func(t *testing.T, v *api.TableValue) {
				t.Helper()
				assert.EqualValues(t, 99, v.GetInt64Value())
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := convertToValueTyped(tt.value, tt.column)
			require.NotNil(t, got)
			tt.check(t, got)
		})
	}
}
