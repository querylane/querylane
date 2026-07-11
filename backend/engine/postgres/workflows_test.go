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
		name              string
		err               error
		wantDurableAbsent bool
	}{
		{
			// df.list_instances() when the df schema exists but the function
			// does not (partial/broken install).
			name:              "undefined function means pg_durable absent",
			err:               &pgconn.PgError{Code: "42883", Message: "function df.list_instances(unknown, integer) does not exist"},
			wantDurableAbsent: true,
		},
		{
			// df.* calls when the df schema itself is missing (extension not
			// installed at all).
			name:              "invalid schema name means pg_durable absent",
			err:               &pgconn.PgError{Code: "3F000", Message: `schema "df" does not exist`},
			wantDurableAbsent: true,
		},
		{
			name: "other sqlstates keep regular classification",
			err:  &pgconn.PgError{Code: "42501", Message: "permission denied for function list_instances"},
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

			if tt.wantDurableAbsent {
				assert.ErrorIs(t, got, engine.ErrDurableNotInstalled)

				return
			}

			require.NotErrorIs(t, got, engine.ErrDurableNotInstalled)

			var pgErr *pgconn.PgError
			if errors.As(tt.err, &pgErr) {
				assert.ErrorIs(t, got, engine.ErrQueryPermissionDenied)
			}
		})
	}
}
