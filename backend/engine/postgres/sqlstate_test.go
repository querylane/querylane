package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
)

func TestClassifyQueryErrorUsesDefaultPostgresProfile(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:           pgerrcode.UniqueViolation,
		Message:        "role already exists",
		ConstraintName: "roles_name_key",
	}
	err := classifyQueryError("create role", pgErr)

	var classified *postgreserrors.Error
	require.ErrorAs(t, err, &classified)
	assert.Equal(t, postgreserrors.ProfileDefault, classified.Classification().Profile)
	assert.Equal(t, postgreserrors.KindAlreadyExists, classified.Classification().Kind)
	assert.Equal(t, "unique_violation", classified.Classification().Condition)
	assert.Equal(t, "role already exists", classified.Classification().ClientFields.Message)
	assert.Equal(t, "roles_name_key", classified.Classification().ClientFields.ConstraintName)
	assert.Equal(t, "create role", classified.Operation())
	assert.ErrorIs(t, err, pgErr)
}

func TestClassifySQLConsoleErrorUsesStatementProfile(t *testing.T) {
	t.Parallel()

	err := classifySQLConsoleError("execute query", &pgconn.PgError{
		Code:    pgerrcode.UniqueViolation,
		Message: "duplicate key value violates unique constraint",
	})

	var classified *postgreserrors.Error
	require.ErrorAs(t, err, &classified)
	assert.Equal(t, postgreserrors.ProfileSQLConsole, classified.Classification().Profile)
	assert.Equal(t, postgreserrors.KindInvalidArgument, classified.Classification().Kind)
}

func TestClassifyQueryErrorPreservesContextSemantics(t *testing.T) {
	t.Parallel()

	require.ErrorIs(t, classifyQueryError("query rows", context.Canceled), engine.ErrQueryCanceled)
	require.ErrorIs(t, classifyQueryError("query rows", context.DeadlineExceeded), engine.ErrQueryTimeout)
}

func TestClassifyQueryErrorPreservesNonPostgresCause(t *testing.T) {
	t.Parallel()

	driverErr := errors.New("driver failed")
	err := classifyQueryError("query rows", driverErr)

	require.ErrorIs(t, err, driverErr)

	var classified *postgreserrors.Error
	assert.NotErrorAs(t, err, &classified)
}

func TestClassifyQueryErrorKeepsMalformedSQLStateInternal(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{Code: "bad", Message: "server rejected request"}
	err := classifyQueryError("query rows", pgErr)

	var classified *postgreserrors.Error
	require.ErrorAs(t, err, &classified)
	assert.Equal(t, postgreserrors.KindInternal, classified.Classification().Kind)
	assert.Empty(t, classified.Classification().SQLState)
	assert.ErrorIs(t, err, pgErr)
}
