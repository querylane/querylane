package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseSchemaName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    SchemaName
		wantErr bool
	}{
		{
			name:  "valid schema",
			input: "instances/inst1/databases/db1/schemas/public",
			want:  SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1/databases/db1",
			wantErr: true,
		},
		{
			name:    "wrong collection",
			input:   "instances/inst1/databases/db1/tables/public",
			wantErr: true,
		},
		{
			name:    "empty schema ID",
			input:   "instances/inst1/databases/db1/schemas/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseSchemaName(tt.input)
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

func TestMustParseSchemaName(t *testing.T) {
	t.Parallel()

	want := SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"}
	assert.Equal(t, want, MustParseSchemaName("instances/inst1/databases/db1/schemas/public"))
	require.Panics(t, func() { MustParseSchemaName("bogus") })
}

func TestSchemaNameHierarchy(t *testing.T) {
	t.Parallel()

	name := NewSchemaName("inst1", "db1", "public")

	assert.Equal(t, TypeSchema, name.ResourceType())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Parent())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Database())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
	assert.Equal(t, "instances/inst1", name.InstanceName())
	assert.Equal(t, "instances/inst1/databases/db1", name.DatabaseName())
}

func TestSchemaNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, SchemaName{}.IsZero())
	assert.False(t, NewSchemaName("inst1", "db1", "public").IsZero())
	assert.False(t, SchemaName{SchemaID: "public"}.IsZero())
}

func TestSchemaNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewSchemaName("inst1", "db1", "public")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1/schemas/public", string(data))

	var parsed SchemaName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
