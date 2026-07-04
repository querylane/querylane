package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseViewName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    ViewName
		wantErr bool
	}{
		{
			name:  "valid view",
			input: "instances/inst1/databases/db1/schemas/public/views/active_users",
			want:  ViewName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public", ViewID: "active_users"},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1/databases/db1/schemas/public",
			wantErr: true,
		},
		{
			name:    "wrong collection",
			input:   "instances/inst1/databases/db1/schemas/public/tables/active_users",
			wantErr: true,
		},
		{
			name:    "empty view ID",
			input:   "instances/inst1/databases/db1/schemas/public/views/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseViewName(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				require.ErrorIs(t, err, ErrInvalidName)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.input, got.String(), "String() must round-trip")
		})
	}
}

func TestViewNameHierarchy(t *testing.T) {
	t.Parallel()

	name := NewViewName("inst1", "db1", "public", "active_users")

	assert.Equal(t, TypeView, name.ResourceType())
	assert.Equal(t, SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"}, name.Parent())
	assert.Equal(t, SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"}, name.Schema())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Database())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
}

func TestViewNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, ViewName{}.IsZero())
	assert.False(t, NewViewName("inst1", "db1", "public", "active_users").IsZero())
	assert.False(t, ViewName{ViewID: "active_users"}.IsZero())
}

func TestViewNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewViewName("inst1", "db1", "public", "active_users")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1/schemas/public/views/active_users", string(data))

	var parsed ViewName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
