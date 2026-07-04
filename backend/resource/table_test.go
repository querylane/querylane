package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseTableName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    TableName
		wantErr bool
	}{
		{
			name:  "valid table",
			input: "instances/inst1/databases/db1/schemas/public/tables/users",
			want:  TableName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public", TableID: "users"},
		},
		{
			name:    "too few segments",
			input:   "instances/inst1/databases/db1/schemas/public",
			wantErr: true,
		},
		{
			name:    "wrong collection",
			input:   "instances/inst1/databases/db1/schemas/public/views/users",
			wantErr: true,
		},
		{
			name:    "empty table ID",
			input:   "instances/inst1/databases/db1/schemas/public/tables/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseTableName(tt.input)
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

func TestMustParseTableName(t *testing.T) {
	t.Parallel()

	want := TableName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public", TableID: "users"}
	assert.Equal(t, want, MustParseTableName("instances/inst1/databases/db1/schemas/public/tables/users"))
	require.Panics(t, func() { MustParseTableName("bogus") })
}

func TestTableNameHierarchy(t *testing.T) {
	t.Parallel()

	name := NewTableName("inst1", "db1", "public", "users")

	assert.Equal(t, TypeTable, name.ResourceType())
	assert.Equal(t, SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"}, name.Parent())
	assert.Equal(t, SchemaName{InstanceID: "inst1", DatabaseID: "db1", SchemaID: "public"}, name.Schema())
	assert.Equal(t, DatabaseName{InstanceID: "inst1", DatabaseID: "db1"}, name.Database())
	assert.Equal(t, InstanceName{InstanceID: "inst1"}, name.Instance())
	assert.Equal(t, "instances/inst1", name.InstanceName())
	assert.Equal(t, "instances/inst1/databases/db1", name.DatabaseName())
	assert.Equal(t, "instances/inst1/databases/db1/schemas/public", name.SchemaName())
}

func TestTableNameIsZero(t *testing.T) {
	t.Parallel()

	assert.True(t, TableName{}.IsZero())
	assert.False(t, NewTableName("inst1", "db1", "public", "users").IsZero())
	assert.False(t, TableName{TableID: "users"}.IsZero())
}

func TestTableNameTextRoundTrip(t *testing.T) {
	t.Parallel()

	name := NewTableName("inst1", "db1", "public", "users")

	data, err := name.MarshalText()
	require.NoError(t, err)
	assert.Equal(t, "instances/inst1/databases/db1/schemas/public/tables/users", string(data))

	var parsed TableName
	require.NoError(t, parsed.UnmarshalText(data))
	assert.Equal(t, name, parsed)

	require.Error(t, parsed.UnmarshalText([]byte("bogus")))
	assert.Equal(t, name, parsed, "failed unmarshal must not modify the receiver")
}
