package resource

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseRelationName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    RelationName
		wantErr bool
	}{
		{
			name:  "table",
			input: "instances/inst1/databases/db1/schemas/public/tables/users",
			want: RelationName{
				InstanceID: "inst1",
				DatabaseID: "db1",
				SchemaID:   "public",
				RelationID: "users",
				Type:       TypeTable,
			},
		},
		{
			name:  "view",
			input: "instances/inst1/databases/db1/schemas/public/views/daily_revenue",
			want: RelationName{
				InstanceID: "inst1",
				DatabaseID: "db1",
				SchemaID:   "public",
				RelationID: "daily_revenue",
				Type:       TypeView,
			},
		},
		{
			name:    "unsupported collection",
			input:   "instances/inst1/databases/db1/schemas/public/sequences/id_seq",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := ParseRelationName(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				require.ErrorIs(t, err, ErrInvalidName)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.input, got.String())
		})
	}
}
