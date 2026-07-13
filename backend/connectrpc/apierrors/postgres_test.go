package apierrors

import (
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/postgreserrors"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestClassifyPostgresErrorUsesClassFallbackForKnownClasses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code          string
		conditionName string
		connectCode   connect.Code
		reason        consolev1alpha1.ErrorReason
	}{
		{code: "08ZZZ", conditionName: "connection_exception", connectCode: connect.CodeUnavailable, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "0AZZZ", conditionName: "feature_not_supported", connectCode: connect.CodeUnimplemented, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "21ZZZ", conditionName: "cardinality_violation", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "22ZZZ", conditionName: "data_exception", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "23ZZZ", conditionName: "integrity_constraint_violation", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "25ZZZ", conditionName: "invalid_transaction_state", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "28ZZZ", conditionName: "invalid_authorization_specification", connectCode: connect.CodeUnauthenticated, reason: consolev1alpha1.ErrorReason_UNAUTHENTICATED},
		{code: "40ZZZ", conditionName: "transaction_rollback", connectCode: connect.CodeAborted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "42ZZZ", conditionName: "syntax_error_or_access_rule_violation", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "53ZZZ", conditionName: "insufficient_resources", connectCode: connect.CodeResourceExhausted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "54ZZZ", conditionName: "program_limit_exceeded", connectCode: connect.CodeResourceExhausted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "55ZZZ", conditionName: "object_not_in_prerequisite_state", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "57ZZZ", conditionName: "operator_intervention", connectCode: connect.CodeUnavailable, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "58ZZZ", conditionName: "system_error", connectCode: connect.CodeInternal, reason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
		{code: "HVZZZ", conditionName: "fdw_error", connectCode: connect.CodeUnavailable, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "P0ZZZ", conditionName: "plpgsql_error", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "XXZZZ", conditionName: "internal_error", connectCode: connect.CodeInternal, reason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			t.Parallel()

			classification := ClassifyPostgresError(
				&pgconn.PgError{Code: tt.code},
				PostgresOperationLabel("execute_query"),
				postgreserrors.ProfileDefault,
			)

			assert.Equal(t, tt.code, classification.SQLState)
			assert.Equal(t, tt.code[:2], classification.SQLStateClass)
			assert.Equal(t, tt.conditionName, classification.ConditionName)
			assert.Equal(t, tt.connectCode, classification.ConnectCode)
			assert.Equal(t, tt.reason, classification.ErrorReason)
		})
	}
}

func TestClassifyPostgresErrorRecognizesPostgres16To19Deltas(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code          string
		conditionName string
	}{
		{code: "72000", conditionName: "snapshot_too_old"},
		{code: "25P04", conditionName: "transaction_timeout"},
		{code: "10608", conditionName: "invalid_argument_for_xquery"},
		{code: "58P03", conditionName: "file_name_too_long"},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			t.Parallel()

			classification := ClassifyPostgresError(
				&pgconn.PgError{Code: tt.code},
				PostgresOperationLabel("execute_query"),
				postgreserrors.ProfileDefault,
			)

			assert.Equal(t, tt.conditionName, classification.ConditionName)
		})
	}
}

func TestNewPostgresErrorAddsSafeConnectDetails(t *testing.T) {
	t.Parallel()

	connectErr := NewPostgresError(&pgconn.PgError{
		Severity:       "ERROR",
		Code:           "23505",
		Message:        "duplicate key value contains customer@example.com",
		Detail:         "password=super-secret",
		Hint:           "try host admin.example.com",
		Where:          "SQL statement with customer data",
		SchemaName:     "public",
		TableName:      "users",
		ColumnName:     "email",
		DataTypeName:   "text",
		ConstraintName: "users_email_key",
		Position:       42,
		File:           "nbtinsert.c",
		Routine:        "_bt_check_unique",
	}, PostgresOperationLabel("create_user"), postgreserrors.ProfileDefault)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeAlreadyExists, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "customer@example.com")
	assert.NotContains(t, connectErr.Message(), "password=super-secret")
	assert.NotContains(t, connectErr.Message(), "admin.example.com")

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS.String(), info.Reason)
	assert.Equal(t, string(DomainConsole), info.Domain)
	assert.Equal(t, "23505", info.Metadata["sqlstate"])
	assert.Equal(t, "23", info.Metadata["sqlstate_class"])
	assert.Equal(t, "unique_violation", info.Metadata["condition_name"])
	assert.Equal(t, "create_user", info.Metadata["operation"])
	assert.NotContains(t, info.Metadata, "severity")
	assert.NotContains(t, info.Metadata, "schema_name")
	assert.NotContains(t, info.Metadata, "table_name")
	assert.NotContains(t, info.Metadata, "column_name")
	assert.NotContains(t, info.Metadata, "data_type_name")
	assert.NotContains(t, info.Metadata, "constraint_name")
	assert.NotContains(t, info.Metadata, "position")
	assert.NotContains(t, info.Metadata, "schemaName")
	assert.NotContains(t, info.Metadata, "tableName")
	assert.NotContains(t, info.Metadata, "columnName")
	assert.NotContains(t, info.Metadata, "dataTypeName")
	assert.NotContains(t, info.Metadata, "constraintName")
	assert.NotContains(t, info.Metadata, "message")
	assert.NotContains(t, info.Metadata, "detail")
	assert.NotContains(t, info.Metadata, "hint")
	assert.NotContains(t, info.Metadata, "where")
	assert.NotContains(t, info.Metadata, "file")
	assert.NotContains(t, info.Metadata, "routine")

	detail := requirePostgresErrorDetail(t, connectErr)
	assert.Equal(t, "23505", detail.Sqlstate)
	assert.Equal(t, "23", detail.SqlstateClass)
	assert.Equal(t, "unique_violation", detail.ConditionName)
	assert.Equal(t, "create_user", detail.Operation)
	assert.Equal(t, map[string]string{
		"column_name":     "email",
		"constraint_name": "users_email_key",
		"data_type_name":  "text",
		"detail":          "password=super-secret",
		"hint":            "try host admin.example.com",
		"message":         "duplicate key value contains customer@example.com",
		"position":        "42",
		"schema_name":     "public",
		"severity":        "ERROR",
		"table_name":      "users",
	}, detail.ServerFields)
}

func TestNewPostgresErrorKeepsUnknownClassInternal(t *testing.T) {
	t.Parallel()

	connectErr := NewPostgresError(&pgconn.PgError{
		Code:    "ZZ999",
		Message: "raw error with api_key=secret",
	}, PostgresOperationLabel("execute_query"), postgreserrors.ProfileDefault)

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInternal, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "api_key=secret")

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_INTERNAL_ERROR.String(), info.Reason)
	assert.Equal(t, "ZZ999", info.Metadata["sqlstate"])
	assert.Equal(t, "ZZ", info.Metadata["sqlstate_class"])
	assert.Equal(t, "execute_query", info.Metadata["operation"])
	assert.NotContains(t, info.Metadata, "condition_name")

	detail := requirePostgresErrorDetail(t, connectErr)
	assert.Equal(t, "ZZ999", detail.Sqlstate)
	assert.Equal(t, "ZZ", detail.SqlstateClass)
	assert.Empty(t, detail.ConditionName)
	assert.Equal(t, "execute_query", detail.Operation)
}

func TestNewPostgresErrorKeepsOriginalPgErrorInErrorChain(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:    "23505",
		Message: "duplicate key value contains customer@example.com",
	}
	connectErr := NewPostgresError(pgErr, PostgresOperationLabel("create_user"), postgreserrors.ProfileDefault)

	require.NotNil(t, connectErr)
	assert.Contains(t, connectErr.Message(), "customer@example.com")

	var got *pgconn.PgError
	require.ErrorAs(t, connectErr, &got)
	assert.Same(t, pgErr, got)
}

func TestNewPostgresErrorHandlesNilPgError(t *testing.T) {
	t.Parallel()

	classification := ClassifyPostgresError(
		nil,
		PostgresOperationLabel("execute_query"),
		postgreserrors.ProfileDefault,
	)
	assert.Empty(t, classification.SQLState)
	assert.Empty(t, classification.SQLStateClass)
	assert.Equal(t, connect.CodeInternal, classification.ConnectCode)
	assert.Equal(t, consolev1alpha1.ErrorReason_INTERNAL_ERROR, classification.ErrorReason)

	connectErr := NewPostgresError(
		nil,
		PostgresOperationLabel("execute_query"),
		postgreserrors.ProfileDefault,
	)
	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInternal, connectErr.Code())
	assert.Equal(t, "PostgreSQL error", connectErr.Message())
}

func requirePostgresErrorDetail(t *testing.T, connectErr *connect.Error) *consolev1alpha1.PostgreSqlErrorDetail {
	t.Helper()

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		require.NoError(t, err)

		if pgDetail, ok := value.(*consolev1alpha1.PostgreSqlErrorDetail); ok {
			return pgDetail
		}
	}

	t.Fatal("expected PostgreSqlErrorDetail detail")

	return nil
}
