package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseViewDependencyName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    ViewDependencyName
		wantErr bool
	}{
		{
			name:  "valid dependency",
			input: "instances/inst1/databases/db1/schemas/public/views/active_users/viewDependencies/abc123",
			want: ViewDependencyName{
				InstanceID:       "inst1",
				DatabaseID:       "db1",
				SchemaID:         "public",
				ViewID:           "active_users",
				ViewDependencyID: "abc123",
			},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1/databases/db1/schemas/public/views/active_users",
			wantErr: true,
		},
		{
			name:    "wrong collection",
			input:   "instances/inst1/databases/db1/schemas/public/views/active_users/dependencies/abc123",
			wantErr: true,
		},
		{
			name:    "empty dependency ID",
			input:   "instances/inst1/databases/db1/schemas/public/views/active_users/viewDependencies/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseViewDependencyName(tt.input)
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

func TestViewDependencyNameHierarchy(t *testing.T) {
	t.Parallel()

	name := NewViewDependencyName("inst1", "db1", "public", "active_users", "abc123")

	assert.Equal(t, TypeViewDependency, name.ResourceType())
	assert.Equal(t, NewViewName("inst1", "db1", "public", "active_users"), name.Parent())
	assert.Equal(t, NewViewName("inst1", "db1", "public", "active_users"), name.View())
	assert.Equal(t, NewSchemaName("inst1", "db1", "public"), name.Schema())
	assert.Equal(t, NewDatabaseName("inst1", "db1"), name.Database())
	assert.Equal(t, NewInstanceName("inst1"), name.Instance())
}

func TestViewDependencyNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, ViewDependencyName{}.IsZero())
	assert.False(t, NewViewDependencyName("inst1", "db1", "public", "active_users", "abc123").IsZero())
	assert.False(t, ViewDependencyName{ViewDependencyID: "abc123"}.IsZero())
}

func TestViewDependencyNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewViewDependencyName("inst1", "db1", "public", "active_users", "abc123")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1/schemas/public/views/active_users/viewDependencies/abc123", string(data))

	var parsed ViewDependencyName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
