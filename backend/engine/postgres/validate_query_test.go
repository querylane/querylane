package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestDiagnosticFromError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		err     error
		want    *engine.QueryDiagnostic
		wantErr bool
	}{
		{name: "nil passes through", err: nil},
		{
			name: "syntax error becomes a diagnostic",
			err: &pgconn.PgError{
				Code:     pgerrcode.SyntaxError,
				Message:  `syntax error at or near "FORM"`,
				Position: 10,
			},
			want: &engine.QueryDiagnostic{
				SQLState: "42601",
				Message:  `syntax error at or near "FORM"`,
				Position: 10,
			},
		},
		{
			name: "unknown column keeps the hint",
			err: &pgconn.PgError{
				Code:     pgerrcode.UndefinedColumn,
				Message:  `column "emial" does not exist`,
				Hint:     `Perhaps you meant to reference the column "customer.email".`,
				Position: 8,
			},
			want: &engine.QueryDiagnostic{
				SQLState: "42703",
				Message:  `column "emial" does not exist`,
				Hint:     `Perhaps you meant to reference the column "customer.email".`,
				Position: 8,
			},
		},
		{
			name:    "operator intervention stays an error",
			err:     &pgconn.PgError{Code: pgerrcode.QueryCanceled, Message: "canceling statement"},
			wantErr: true,
		},
		{
			name:    "non-postgres errors stay errors",
			err:     errors.New("connection reset"),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := diagnosticFromError(tt.err)
			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestValidateQueryRejectsNonPgxConnections(t *testing.T) {
	t.Parallel()

	db, _ := openExecuteQueryFakeDB(t)
	defer db.Close()

	_, err := (&Postgres{}).ValidateQuery(context.Background(), db, engine.ValidateQueryParams{Statement: "select 1", Timeout: time.Second})
	require.ErrorIs(t, err, errValidateUnsupported)
}
