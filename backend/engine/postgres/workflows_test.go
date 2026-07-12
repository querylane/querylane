package postgres

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestClassifyWorkflowError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		err          error
		wantSentinel error // nil means "must not be a durable sentinel"
	}{
		{
			// df.list_instances() when the df schema exists but the function
			// does not (partial/broken install).
			name:         "undefined function means pg_durable absent",
			err:          &pgconn.PgError{Code: "42883", Message: "function df.list_instances(unknown, integer) does not exist"},
			wantSentinel: engine.ErrDurableNotInstalled,
		},
		{
			// df.* calls when the df schema itself is missing (extension not
			// installed at all).
			name:         "invalid schema name means pg_durable absent",
			err:          &pgconn.PgError{Code: "3F000", Message: `schema "df" does not exist`},
			wantSentinel: engine.ErrDurableNotInstalled,
		},
		{
			// Every WorkflowService query targets the df schema, so an
			// insufficient-privilege error here always means the connection
			// role was never granted df.grant_usage — not a normal table ACL.
			name:         "insufficient privilege means df access not granted",
			err:          &pgconn.PgError{Code: "42501", Message: "permission denied for schema df"},
			wantSentinel: engine.ErrDurableAccessDenied,
		},
		{
			name: "non-postgres errors pass through classification",
			err:  errors.New("connection refused"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := classifyWorkflowError("list workflows", tt.err)
			require.Error(t, got)

			if tt.wantSentinel != nil {
				assert.ErrorIs(t, got, tt.wantSentinel)

				return
			}

			require.NotErrorIs(t, got, engine.ErrDurableNotInstalled)
			require.NotErrorIs(t, got, engine.ErrDurableAccessDenied)
		})
	}
}
