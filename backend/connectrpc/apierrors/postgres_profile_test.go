package apierrors

import (
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/postgreserrors"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestClassifyPostgresErrorUsesExplicitProfile(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{Code: pgerrcode.UniqueViolation}
	defaultClassification := ClassifyPostgresError(
		pgErr,
		PostgresOperationLabel("create_resource"),
		postgreserrors.ProfileDefault,
	)
	consoleClassification := ClassifyPostgresError(
		pgErr,
		PostgresOperationLabel("execute_query"),
		postgreserrors.ProfileSQLConsole,
	)

	assert.Equal(t, connect.CodeAlreadyExists, defaultClassification.ConnectCode)
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS, defaultClassification.ErrorReason)
	assert.Equal(t, connect.CodeInvalidArgument, consoleClassification.ConnectCode)
	assert.Equal(t, consolev1alpha1.ErrorReason_INVALID_ARGUMENT, consoleClassification.ErrorReason)
}

func TestNewPostgresErrorExposesUserInstanceFields(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		SeverityUnlocalized: "ERROR",
		Code:                pgerrcode.UniqueViolation,
		Message:             "duplicate key value violates unique constraint",
		Detail:              "Key (email)=(user@example.com) already exists.",
		Hint:                "Choose another email address.",
		Where:               "PL/pgSQL function private_fn line 1",
		InternalQuery:       "SELECT secret FROM internal_table",
		SchemaName:          "public",
		TableName:           "users",
		ColumnName:          "email",
		DataTypeName:        "text",
		ConstraintName:      "users_email_key",
		Position:            42,
		File:                "nbtinsert.c",
		Line:                666,
		Routine:             "_bt_check_unique",
	}

	connectErr := NewPostgresError(
		pgErr,
		PostgresOperationLabel("create_user"),
		postgreserrors.ProfileDefault,
	)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeAlreadyExists, connectErr.Code())
	assert.Equal(t, "PostgreSQL 23505: duplicate key value violates unique constraint", connectErr.Message())

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, "23505", info.Metadata["sqlstate"])
	assert.NotContains(t, info.Metadata, "message")
	assert.NotContains(t, info.Metadata, "detail")
	assert.NotContains(t, info.Metadata, "hint")

	detail := requirePostgresErrorDetail(t, connectErr)
	assert.Equal(t, "duplicate key value violates unique constraint", detail.ServerFields["message"])
	assert.Equal(t, "Key (email)=(user@example.com) already exists.", detail.ServerFields["detail"])
	assert.Equal(t, "Choose another email address.", detail.ServerFields["hint"])
	assert.Equal(t, "users_email_key", detail.ServerFields["constraint_name"])
	assert.NotContains(t, detail.ServerFields, "where")
	assert.NotContains(t, detail.ServerFields, "internal_query")
	assert.NotContains(t, detail.ServerFields, "file")
	assert.NotContains(t, detail.ServerFields, "line")
	assert.NotContains(t, detail.ServerFields, "routine")

	var gotPgErr *pgconn.PgError
	require.ErrorAs(t, connectErr, &gotPgErr)
	assert.Same(t, pgErr, gotPgErr)
}

func TestPostgresErrorResponseFromErrorUsesWrappedClassification(t *testing.T) {
	t.Parallel()

	response, ok := PostgresErrorResponseFromError(
		postgreserrors.Wrap(&pgconn.PgError{
			Code:           "23505",
			Message:        "duplicate key value",
			Detail:         "Key (id)=(1) already exists.",
			ConstraintName: "users_pkey",
		}, postgreserrors.ProfileSQLConsole, "execute query"),
		PostgresOperationLabel("execute_query"),
	)

	require.True(t, ok)
	assert.Equal(t, connect.CodeInvalidArgument, response.ConnectCode)
	assert.Equal(t, "PostgreSQL 23505: duplicate key value", response.Message)
	assert.Equal(t, "23505", response.Metadata["sqlstate"])
	assert.NotContains(t, response.Metadata, "constraint_name")
	assert.NotContains(t, response.Metadata, "message")
	assert.NotContains(t, response.Metadata, "detail")
	assert.Equal(t, "duplicate key value", response.Detail.ServerFields["message"])
	assert.Equal(t, "Key (id)=(1) already exists.", response.Detail.ServerFields["detail"])
}
