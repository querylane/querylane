package storage

import (
	"errors"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParsePostgresErrorMapsConstraintAndTransactionSQLStates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		code    string
		wantErr error
	}{
		{name: "unique violation uses caller override", code: pgerrcode.UniqueViolation, wantErr: ErrAlreadyExists},
		{name: "foreign key violation", code: pgerrcode.ForeignKeyViolation, wantErr: ErrInvalidReference},
		{name: "check violation", code: pgerrcode.CheckViolation, wantErr: ErrInvalidInput},
		{name: "not null violation", code: pgerrcode.NotNullViolation, wantErr: ErrInvalidInput},
		{name: "restrict violation", code: pgerrcode.RestrictViolation, wantErr: ErrInvalidReference},
		{name: "exclusion violation", code: pgerrcode.ExclusionViolation, wantErr: ErrInvalidInput},
		{name: "unknown integrity violation class", code: "23ZZZ", wantErr: ErrInvalidInput},
		{name: "normalized integrity violation class", code: " 23p01 ", wantErr: ErrInvalidInput},
		{name: "serialization failure", code: pgerrcode.SerializationFailure, wantErr: ErrConcurrentModification},
		{name: "deadlock detected", code: pgerrcode.DeadlockDetected, wantErr: ErrConcurrentModification},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			pgErr := &pgconn.PgError{Code: tt.code}
			got := ParsePostgresError(pgErr, ErrAlreadyExists)

			require.ErrorIs(t, got, tt.wantErr)

			var gotPgErr *pgconn.PgError
			require.ErrorAs(t, got, &gotPgErr)
			assert.Same(t, pgErr, gotPgErr)
		})
	}
}

func TestParsePostgresErrorLeavesUnknownErrorsUntouched(t *testing.T) {
	t.Parallel()

	input := errors.New("not postgres")
	assert.Same(t, input, ParsePostgresError(input, ErrAlreadyExists))

	pgErr := &pgconn.PgError{Code: "ZZ999"}
	assert.Same(t, pgErr, ParsePostgresError(pgErr, ErrAlreadyExists))
}
