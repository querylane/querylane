package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStringArray_Scan(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   any
		want    StringArray
		wantErr string
	}{
		{
			name:  "nil",
			input: nil,
			want:  nil,
		},
		{
			name:  "empty_array_string",
			input: "{}",
			want:  StringArray{},
		},
		{
			name:  "empty_array_bytes",
			input: []byte("{}"),
			want:  StringArray{},
		},
		{
			name:  "single_element",
			input: "{foo}",
			want:  StringArray{"foo"},
		},
		{
			name:  "multiple_elements",
			input: "{foo,bar,baz}",
			want:  StringArray{"foo", "bar", "baz"},
		},
		{
			name:  "quoted_elements",
			input: `{"foo","bar"}`,
			want:  StringArray{"foo", "bar"},
		},
		{
			name:  "quoted_with_spaces",
			input: `{"has spaces","another one"}`,
			want:  StringArray{"has spaces", "another one"},
		},
		{
			name:  "quoted_with_comma",
			input: `{"a,b","c"}`,
			want:  StringArray{"a,b", "c"},
		},
		{
			name:  "escaped_quotes",
			input: `{"has \"quotes\""}`,
			want:  StringArray{`has "quotes"`},
		},
		{
			name:  "escaped_backslash",
			input: `{"has \\backslash"}`,
			want:  StringArray{`has \backslash`},
		},
		{
			name:  "bytes_input",
			input: []byte("{foo,bar}"),
			want:  StringArray{"foo", "bar"},
		},
		{
			name:    "null_element",
			input:   "{foo,NULL,bar}",
			wantErr: "cannot convert nil to string",
		},
		{
			name:    "multidimensional",
			input:   "{{a,b},{c,d}}",
			wantErr: "cannot convert ARRAY",
		},
		{
			name:    "unsupported_type",
			input:   42,
			wantErr: "cannot convert int to StringArray",
		},
		{
			name:    "invalid_format",
			input:   "not an array",
			wantErr: "unable to parse array",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var got StringArray

			err := got.Scan(tt.input)

			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringArray_Value(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		arr  StringArray
		want any
	}{
		{
			name: "nil",
			arr:  nil,
			want: nil,
		},
		{
			name: "empty",
			arr:  StringArray{},
			want: "{}",
		},
		{
			name: "single",
			arr:  StringArray{"foo"},
			want: `{"foo"}`,
		},
		{
			name: "multiple",
			arr:  StringArray{"foo", "bar"},
			want: `{"foo","bar"}`,
		},
		{
			name: "element_with_quotes",
			arr:  StringArray{`has "quotes"`},
			want: `{"has \"quotes\""}`,
		},
		{
			name: "element_with_backslash",
			arr:  StringArray{`has \backslash`},
			want: `{"has \\backslash"}`,
		},
		{
			name: "element_with_comma",
			arr:  StringArray{"a,b", "c"},
			want: `{"a,b","c"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := tt.arr.Value()
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringArray_RoundTrip(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		arr  StringArray
	}{
		{"empty", StringArray{}},
		{"simple", StringArray{"foo", "bar", "baz"}},
		{"with_spaces", StringArray{"hello world", "foo bar"}},
		{"with_quotes", StringArray{`has "quotes"`, "normal"}},
		{"with_backslash", StringArray{`path\to\file`}},
		{"with_comma", StringArray{"a,b", "c,d"}},
		{"single", StringArray{"only"}},
		{"realistic_columns", StringArray{"id", "customer_id", "created_at"}},
		{"realistic_events", StringArray{"INSERT", "UPDATE", "DELETE"}},
		{"realistic_roles", StringArray{"public", "admin"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			val, err := tt.arr.Value()
			require.NoError(t, err)

			var got StringArray

			err = got.Scan(val)
			require.NoError(t, err)

			assert.Equal(t, tt.arr, got)
		})
	}
}
