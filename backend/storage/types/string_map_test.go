package types

import (
	"database/sql/driver"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStringMap_Scan(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   any
		want    StringMap
		wantErr string
	}{
		{name: "nil", input: nil, want: StringMap{}},
		{name: "empty_bytes", input: []byte{}, want: StringMap{}},
		{name: "empty_string", input: "", want: StringMap{}},
		{name: "bytes", input: []byte(`{"env":"prod","team":"data"}`), want: StringMap{"env": "prod", "team": "data"}},
		{name: "string", input: `{"role":"admin"}`, want: StringMap{"role": "admin"}},
		{name: "invalid_bytes", input: []byte(`{"env":`), wantErr: "invalid JSON in StringMap"},
		{name: "invalid_string", input: `{"env":`, wantErr: "invalid JSON string in StringMap"},
		{name: "unsupported", input: 42, wantErr: "cannot scan int into StringMap"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var got StringMap

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

func TestStringMap_Value(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		m    StringMap
		want string
	}{
		{name: "nil", m: nil, want: `{}`},
		{name: "empty", m: StringMap{}, want: `{}`},
		{name: "values", m: StringMap{"env": "prod", "team": "data"}, want: `{"env":"prod","team":"data"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := tt.m.Value()
			require.NoError(t, err)

			var jsonValue string

			switch v := got.(type) {
			case string:
				jsonValue = v
			case []byte:
				jsonValue = string(v)
			default:
				require.Failf(t, "unexpected driver value type", "%T is not a %T", got, driver.Value(nil))
			}

			assert.JSONEq(t, tt.want, jsonValue)
		})
	}
}

func TestStringMap_MapsAreDefensiveCopies(t *testing.T) {
	t.Parallel()

	original := map[string]string{"env": "prod"}
	m := FromMap(original)
	original["env"] = "dev"

	assert.Equal(t, StringMap{"env": "prod"}, m)

	copied := m.ToMap()
	copied["env"] = "stage"

	assert.Equal(t, StringMap{"env": "prod"}, m)
	assert.Empty(t, StringMap(nil).ToMap())
	assert.Empty(t, FromMap(nil))
}

func TestStringMap_JSONRoundTrip(t *testing.T) {
	t.Parallel()

	original := StringMap{"env": "prod", "owner": "querylane"}
	data, err := json.Marshal(original)
	require.NoError(t, err)

	var got StringMap
	require.NoError(t, json.Unmarshal(data, &got))
	assert.Equal(t, original, got)

	require.Error(t, json.Unmarshal([]byte(`{"env":`), &got))
}

func TestStringMap_PostgresHelpersBuildExpressions(t *testing.T) {
	t.Parallel()

	labels := StringMap{"owner": "o'reilly"}
	other := StringMap{"owner": "querylane"}

	assert.NotNil(t, labels.ToJSONB())
	assert.NotNil(t, labels.EQ(other))
	assert.NotNil(t, labels.Contains("owner"))
	assert.NotNil(t, labels.GetValue("owner"))
	assert.NotNil(t, StringMapContains(nil, "owner"))
	assert.NotNil(t, StringMapGetValue(nil, "owner"))
}
