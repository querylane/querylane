package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeRoleMemberships(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name: "decodes single membership",
			input: `[
				{
					"roleName": "app_writer",
					"adminOption": true,
					"inheritOption": true,
					"setOption": false,
					"grantor": "postgres"
				}
			]`,
		},
		{
			name:    "rejects malformed json",
			input:   `[{"roleName":`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			memberships, err := decodeRoleMemberships(tt.input)
			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Len(t, memberships, 1)

			got := memberships[0]
			assert.Equal(t, "app_writer", got.RoleName)
			assert.True(t, got.AdminOption)
			assert.True(t, got.InheritOption)
			assert.False(t, got.SetOption)
			assert.Equal(t, "postgres", got.Grantor)
		})
	}
}
