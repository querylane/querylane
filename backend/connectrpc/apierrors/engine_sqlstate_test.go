package apierrors

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestMapEngineErrUsesWrappedPostgresProfile(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:           "23505",
		Message:        "duplicate key value violates unique constraint",
		ConstraintName: "users_email_key",
	}
	connectErr := MapEngineErr(
		context.Background(),
		postgreserrors.Wrap(pgErr, postgreserrors.ProfileSQLConsole, "execute query"),
		ResourceCtx{
			Type: resource.TypeDatabase,
			Name: "instances/prod/databases/app",
			Op:   "execute_query",
		},
	)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInvalidArgument, connectErr.Code())
	assert.Equal(t, "PostgreSQL 23505: duplicate key value violates unique constraint", connectErr.Message())
	assert.True(t, hasBadRequest(connectErr))
	assert.Equal(t, consolev1alpha1.ErrorReason_INVALID_ARGUMENT.String(), requireErrorInfo(t, connectErr).Reason)
	assert.Equal(t, "users_email_key", requirePostgresErrorDetail(t, connectErr).ServerFields["constraint_name"])

	var gotPgErr *pgconn.PgError
	require.ErrorAs(t, connectErr, &gotPgErr)
	assert.Same(t, pgErr, gotPgErr)
}

func TestMapEngineErrExposesPostgresHierarchyNotFound(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
	}{
		{
			name: "classified engine error",
			err: postgreserrors.Wrap(&pgconn.PgError{
				Code:    "3D000",
				Message: `database "missing" does not exist`,
			}, postgreserrors.ProfileDefault, "open database"),
		},
		{
			name: "raw driver error",
			err: &pgconn.PgError{
				Code:    "3D000",
				Message: `database "missing" does not exist`,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapEngineErr(
				context.Background(),
				tt.err,
				ResourceCtx{
					Type: resource.TypeTable,
					Name: "instances/prod/databases/missing/schemas/public/tables/users",
					Op:   "read_rows",
				},
			)

			require.NotNil(t, connectErr)
			assert.Equal(t, connect.CodeNotFound, connectErr.Code())
			assert.Equal(t, `PostgreSQL 3D000: database "missing" does not exist`, connectErr.Message())
			assert.Equal(t, "instances/prod/databases/missing", requireResourceInfo(t, connectErr).GetResourceName())
			assert.Equal(t, `database "missing" does not exist`, requirePostgresErrorDetail(t, connectErr).ServerFields["message"])

			var pgErr *pgconn.PgError
			require.ErrorAs(t, connectErr, &pgErr)
		})
	}
}

func TestMapEngineErrHierarchySentinelWinsPostgresStatus(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:    "42501",
		Message: "permission denied while opening missing database",
	}
	connectErr := MapEngineErr(
		context.Background(),
		fmt.Errorf("%w: %w", engine.ErrDatabaseNotFound, postgreserrors.Wrap(
			pgErr,
			postgreserrors.ProfileDefault,
			"open database",
		)),
		ResourceCtx{
			Type: resource.TypeSchema,
			Name: "instances/prod/databases/missing/schemas/public",
			Op:   "list_schemas",
		},
	)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeNotFound, connectErr.Code())
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND.String(), requireErrorInfo(t, connectErr).Reason)
	assert.Equal(t, "instances/prod/databases/missing", requireResourceInfo(t, connectErr).GetResourceName())
	assert.Equal(t, "PostgreSQL 42501: permission denied while opening missing database", connectErr.Message())
	assert.ErrorIs(t, connectErr, pgErr)
}

func requireErrorInfo(t *testing.T, connectErr *connect.Error) *errdetails.ErrorInfo {
	t.Helper()

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		require.NoError(t, err)

		if info, ok := value.(*errdetails.ErrorInfo); ok {
			return info
		}
	}

	t.Fatal("ErrorInfo detail not found")

	return nil
}

func hasBadRequest(connectErr *connect.Error) bool {
	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		if err != nil {
			continue
		}

		if _, ok := value.(*errdetails.BadRequest); ok {
			return true
		}
	}

	return false
}
