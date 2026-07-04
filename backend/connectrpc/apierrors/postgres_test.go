package apierrors

import (
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestClassifyPostgresErrorRecognizesHighImpactExactCodes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code          string
		conditionName string
		connectCode   connect.Code
		reason        consolev1alpha1.ErrorReason
	}{
		{code: "22P02", conditionName: "invalid_text_representation", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "22012", conditionName: "division_by_zero", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "23505", conditionName: "unique_violation", connectCode: connect.CodeAlreadyExists, reason: consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS},
		{code: "23503", conditionName: "foreign_key_violation", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "23514", conditionName: "check_violation", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "23502", conditionName: "not_null_violation", connectCode: connect.CodeFailedPrecondition, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "25P04", conditionName: "transaction_timeout", connectCode: connect.CodeDeadlineExceeded, reason: consolev1alpha1.ErrorReason_TIMEOUT},
		{code: "28P01", conditionName: "invalid_password", connectCode: connect.CodeUnauthenticated, reason: consolev1alpha1.ErrorReason_UNAUTHENTICATED},
		{code: "3D000", conditionName: "invalid_catalog_name", connectCode: connect.CodeNotFound, reason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
		{code: "3F000", conditionName: "invalid_schema_name", connectCode: connect.CodeNotFound, reason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
		{code: "40001", conditionName: "serialization_failure", connectCode: connect.CodeAborted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "40P01", conditionName: "deadlock_detected", connectCode: connect.CodeAborted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "42501", conditionName: "insufficient_privilege", connectCode: connect.CodePermissionDenied, reason: consolev1alpha1.ErrorReason_PERMISSION_DENIED},
		{code: "42601", conditionName: "syntax_error", connectCode: connect.CodeInvalidArgument, reason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
		{code: "42P01", conditionName: "undefined_table", connectCode: connect.CodeNotFound, reason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
		{code: "42703", conditionName: "undefined_column", connectCode: connect.CodeNotFound, reason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
		{code: "53300", conditionName: "too_many_connections", connectCode: connect.CodeResourceExhausted, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "57014", conditionName: "query_canceled", connectCode: connect.CodeDeadlineExceeded, reason: consolev1alpha1.ErrorReason_TIMEOUT},
		{code: "57P03", conditionName: "cannot_connect_now", connectCode: connect.CodeUnavailable, reason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
		{code: "58P03", conditionName: "file_name_too_long", connectCode: connect.CodeInternal, reason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
		{code: "XX000", conditionName: "internal_error", connectCode: connect.CodeInternal, reason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			t.Parallel()

			classification := ClassifyPostgresError(&pgconn.PgError{Code: tt.code}, PostgresOperationLabel("execute_query"))

			assert.Equal(t, tt.code, classification.SQLState)
			assert.Equal(t, tt.code[:2], classification.SQLStateClass)
			assert.Equal(t, tt.conditionName, classification.ConditionName)
			assert.Equal(t, tt.connectCode, classification.ConnectCode)
			assert.Equal(t, tt.reason, classification.ErrorReason)
			assert.True(t, classification.Exact, "accepted high-impact SQLSTATEs must be exact matches")
			assert.False(t, classification.ClassFallback)
		})
	}
}

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

			classification := ClassifyPostgresError(&pgconn.PgError{Code: tt.code}, PostgresOperationLabel("execute_query"))

			assert.Equal(t, tt.code, classification.SQLState)
			assert.Equal(t, tt.code[:2], classification.SQLStateClass)
			assert.Equal(t, tt.conditionName, classification.ConditionName)
			assert.Equal(t, tt.connectCode, classification.ConnectCode)
			assert.Equal(t, tt.reason, classification.ErrorReason)
			assert.False(t, classification.Exact)
			assert.True(t, classification.ClassFallback)
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

			classification := ClassifyPostgresError(&pgconn.PgError{Code: tt.code}, PostgresOperationLabel("execute_query"))

			assert.Equal(t, tt.conditionName, classification.ConditionName)
			assert.True(t, classification.Exact)
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
	}, PostgresOperationLabel("create_user"))

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeAlreadyExists, connectErr.Code())
	assert.NotContains(t, connectErr.Message(), "customer@example.com")
	assert.NotContains(t, connectErr.Message(), "password=super-secret")
	assert.NotContains(t, connectErr.Message(), "admin.example.com")

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS.String(), info.Reason)
	assert.Equal(t, string(DomainConsole), info.Domain)
	assert.Equal(t, "23505", info.Metadata["sqlstate"])
	assert.Equal(t, "23", info.Metadata["sqlstate_class"])
	assert.Equal(t, "unique_violation", info.Metadata["condition_name"])
	assert.Equal(t, "create_user", info.Metadata["operation"])
	assert.Equal(t, "public", info.Metadata["schema_name"])
	assert.Equal(t, "users", info.Metadata["table_name"])
	assert.Equal(t, "email", info.Metadata["column_name"])
	assert.Equal(t, "text", info.Metadata["data_type_name"])
	assert.Equal(t, "users_email_key", info.Metadata["constraint_name"])
	assert.Equal(t, "42", info.Metadata["position"])
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
	}, PostgresOperationLabel("execute_query"))

	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInternal, connectErr.Code())
	assert.NotContains(t, connectErr.Message(), "api_key=secret")

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
	connectErr := NewPostgresError(pgErr, PostgresOperationLabel("create_user"))

	require.NotNil(t, connectErr)
	assert.NotContains(t, connectErr.Message(), "customer@example.com")

	var got *pgconn.PgError
	require.ErrorAs(t, connectErr, &got)
	assert.Same(t, pgErr, got)
}

func TestNewPostgresErrorHandlesNilPgError(t *testing.T) {
	t.Parallel()

	classification := ClassifyPostgresError(nil, PostgresOperationLabel("execute_query"))
	assert.Empty(t, classification.SQLState)
	assert.Empty(t, classification.SQLStateClass)
	assert.Equal(t, connect.CodeInternal, classification.ConnectCode)
	assert.Equal(t, consolev1alpha1.ErrorReason_INTERNAL_ERROR, classification.ErrorReason)

	connectErr := NewPostgresError(nil, PostgresOperationLabel("execute_query"))
	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeInternal, connectErr.Code())
	assert.Equal(t, "PostgreSQL postgresql_error during execute_query", connectErr.Message())
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
