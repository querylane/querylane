package apierrors

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

func TestMapRepoErr(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{
		Type: resource.TypeInstance,
		Name: "test-instance",
		Op:   "get_instance",
	}

	tests := []struct {
		name         string
		inputErr     error
		expectedCode connect.Code
		expectedMsg  string
	}{
		{
			name:         "ErrNotFound maps to CodeNotFound",
			inputErr:     storage.ErrNotFound,
			expectedCode: connect.CodeNotFound,
			expectedMsg:  "instance not found: test-instance",
		},
		{
			name:         "ErrAlreadyExists maps to CodeAlreadyExists",
			inputErr:     storage.ErrAlreadyExists,
			expectedCode: connect.CodeAlreadyExists,
			expectedMsg:  "instance already exists: test-instance",
		},
		{
			name:         "ErrInvalidInput maps to CodeInvalidArgument",
			inputErr:     storage.ErrInvalidInput,
			expectedCode: connect.CodeInvalidArgument,
			expectedMsg:  "invalid input for get_instance",
		},
		{
			name:         "ErrInvalidReference maps to CodeFailedPrecondition",
			inputErr:     storage.ErrInvalidReference,
			expectedCode: connect.CodeFailedPrecondition,
			expectedMsg:  "invalid reference in get_instance",
		},
		{
			name:         "ErrConcurrentModification maps to CodeAborted",
			inputErr:     storage.ErrConcurrentModification,
			expectedCode: connect.CodeAborted,
			expectedMsg:  "concurrent modification of test-instance",
		},
		{
			name:         "ErrInvalidOrderBy maps to CodeInvalidArgument",
			inputErr:     storage.ErrInvalidOrderBy,
			expectedCode: connect.CodeInvalidArgument,
			expectedMsg:  "invalid order_by parameter",
		},
		{
			name:         "ErrInvalidPageToken maps to CodeInvalidArgument",
			inputErr:     storage.ErrInvalidPageToken,
			expectedCode: connect.CodeInvalidArgument,
			expectedMsg:  "invalid page_token parameter",
		},
		{
			name:         "ErrFilterMismatch maps to CodeInvalidArgument",
			inputErr:     storage.ErrFilterMismatch,
			expectedCode: connect.CodeInvalidArgument,
			expectedMsg:  "filter parameter mismatch",
		},
		{
			name:         "ErrInvalidFilter maps to CodeInvalidArgument",
			inputErr:     fmt.Errorf("%w: unsupported catalog filter", storage.ErrInvalidFilter),
			expectedCode: connect.CodeInvalidArgument,
			expectedMsg:  "invalid filter parameter",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapRepoErr(ctx, tt.inputErr, rctx)

			if connectErr.Code() != tt.expectedCode {
				t.Errorf("expected code %v, got %v", tt.expectedCode, connectErr.Code())
			}

			if !contains(connectErr.Message(), tt.expectedMsg) {
				t.Errorf("expected message to contain %q, got %q", tt.expectedMsg, connectErr.Message())
			}

			// Verify that ErrorInfo detail is present
			details := connectErr.Details()
			if len(details) == 0 {
				t.Error("expected at least one error detail")
			}
		})
	}
}

func TestMapRepoErr_UnknownError(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{
		Type: resource.TypeInstance,
		Name: "test-instance",
		Op:   "create_instance",
	}

	unknownErr := &customError{msg: "some database error"}
	connectErr := MapRepoErr(ctx, unknownErr, rctx)

	if connectErr.Code() != connect.CodeInternal {
		t.Errorf("expected code %v for unknown error, got %v", connect.CodeInternal, connectErr.Code())
	}

	expectedMsg := "repository create_instance failed"
	if !contains(connectErr.Message(), expectedMsg) {
		t.Errorf("expected message to contain %q, got %q", expectedMsg, connectErr.Message())
	}
}

func TestMapRepoErr_ErrorInfo(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{
		Type: resource.TypeDatabase,
		Name: "test-db",
		Op:   "list_databases",
	}

	connectErr := MapRepoErr(ctx, storage.ErrNotFound, rctx)
	details := connectErr.Details()

	// Check that we have at least ErrorInfo and ResourceInfo details
	if len(details) < 2 {
		t.Errorf("expected at least 2 error details, got %d", len(details))
	}

	var (
		foundErrorInfo    bool
		foundResourceInfo bool
	)

	for _, detail := range details {
		value, err := detail.Value()
		if err != nil {
			t.Fatalf("decode detail: %v", err)
		}

		switch typed := value.(type) {
		case *errdetails.ErrorInfo:
			foundErrorInfo = true

			if typed.Reason != consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND.String() {
				t.Errorf("expected reason %q, got %q", consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND, typed.Reason)
			}

			if typed.Metadata["resourceName"] != rctx.Name {
				t.Errorf("expected resourceName metadata %q, got %q", rctx.Name, typed.Metadata["resourceName"])
			}

		case *errdetails.ResourceInfo:
			foundResourceInfo = true

			if typed.ResourceType != "console.querylane.dev/Database" {
				t.Errorf("expected resource type %q, got %q", "console.querylane.dev/Database", typed.ResourceType)
			}

			if typed.ResourceName != rctx.Name {
				t.Errorf("expected resource name %q, got %q", rctx.Name, typed.ResourceName)
			}
		}
	}

	if !foundErrorInfo {
		t.Error("expected ErrorInfo detail")
	}

	if !foundResourceInfo {
		t.Error("expected ResourceInfo detail")
	}
}

func TestMapRepoErr_ConcurrentModificationReason(t *testing.T) {
	t.Parallel()

	connectErr := MapRepoErr(context.Background(), storage.ErrConcurrentModification, ResourceCtx{
		Type: resource.TypeInstance,
		Name: "instances/prod",
		Op:   "update_instance",
	})

	assert.Equal(t, connect.CodeAborted, connectErr.Code())
	assert.Equal(t, consolev1alpha1.ErrorReason_FAILED_PRECONDITION.String(), requireErrorInfo(t, connectErr).Reason)
}

func requireResourceInfo(t *testing.T, connectErr *connect.Error) *errdetails.ResourceInfo {
	t.Helper()

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		require.NoError(t, err)

		if resourceInfo, ok := value.(*errdetails.ResourceInfo); ok {
			return resourceInfo
		}
	}

	t.Fatal("ResourceInfo detail not found")

	return nil
}

// Helper functions for testing

type customError struct {
	msg string
}

func (e *customError) Error() string {
	return e.msg
}

func contains(s, substr string) bool {
	// Simple substring check - in real code you might want more sophisticated matching
	return len(s) >= len(substr) && findSubstring(s, substr)
}

func findSubstring(s, substr string) bool {
	if len(substr) == 0 {
		return true
	}

	if len(substr) > len(s) {
		return false
	}

	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}

	return false
}

func TestMapRepoErr_PostgresSQLStateDetails(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{Type: resource.TypeInstance, Name: "instances/prod", Op: "create_instance"}
	tests := []struct {
		name             string
		inputErr         error
		wantCode         connect.Code
		wantReason       consolev1alpha1.ErrorReason
		wantSQLState     string
		wantCondition    string
		wantResourceInfo bool
	}{
		{
			name:             "duplicate instance",
			inputErr:         storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.UniqueViolation}, storage.ErrAlreadyExists),
			wantCode:         connect.CodeAlreadyExists,
			wantReason:       consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS,
			wantSQLState:     pgerrcode.UniqueViolation,
			wantCondition:    "unique_violation",
			wantResourceInfo: true,
		},
		{
			name:          "invalid reference foreign key",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.ForeignKeyViolation}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeFailedPrecondition,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  pgerrcode.ForeignKeyViolation,
			wantCondition: "foreign_key_violation",
		},
		{
			name:          "invalid reference restrict",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.RestrictViolation}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeFailedPrecondition,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  pgerrcode.RestrictViolation,
			wantCondition: "restrict_violation",
		},
		{
			name:             "database not found",
			inputErr:         &pgconn.PgError{Code: pgerrcode.InvalidCatalogName},
			wantCode:         connect.CodeNotFound,
			wantReason:       consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			wantSQLState:     pgerrcode.InvalidCatalogName,
			wantCondition:    "invalid_catalog_name",
			wantResourceInfo: true,
		},
		{
			name:          "check violation",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.CheckViolation}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeInvalidArgument,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  pgerrcode.CheckViolation,
			wantCondition: "check_violation",
		},
		{
			name:          "not null violation",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.NotNullViolation}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeInvalidArgument,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  pgerrcode.NotNullViolation,
			wantCondition: "not_null_violation",
		},
		{
			name:          "exclusion violation",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.ExclusionViolation}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeInvalidArgument,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  pgerrcode.ExclusionViolation,
			wantCondition: "exclusion_violation",
		},
		{
			name:          "unknown integrity violation keeps storage domain override",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: "23ZZZ"}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeInvalidArgument,
			wantReason:    consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantSQLState:  "23ZZZ",
			wantCondition: "integrity_constraint_violation",
		},
		{
			name:          "serialization failure",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.SerializationFailure}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeAborted,
			wantReason:    consolev1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantSQLState:  pgerrcode.SerializationFailure,
			wantCondition: "serialization_failure",
		},
		{
			name:          "deadlock detected",
			inputErr:      storage.ParsePostgresError(&pgconn.PgError{Code: pgerrcode.DeadlockDetected}, storage.ErrAlreadyExists),
			wantCode:      connect.CodeAborted,
			wantReason:    consolev1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantSQLState:  pgerrcode.DeadlockDetected,
			wantCondition: "deadlock_detected",
		},
		{
			name:          "resource exhausted",
			inputErr:      &pgconn.PgError{Code: pgerrcode.TooManyConnections},
			wantCode:      connect.CodeResourceExhausted,
			wantReason:    consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE,
			wantSQLState:  pgerrcode.TooManyConnections,
			wantCondition: "too_many_connections",
		},
		{
			name:          "connection failure",
			inputErr:      &pgconn.PgError{Code: pgerrcode.ConnectionFailure},
			wantCode:      connect.CodeUnavailable,
			wantReason:    consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE,
			wantSQLState:  pgerrcode.ConnectionFailure,
			wantCondition: "connection_failure",
		},
		{
			name:          "temporarily unavailable",
			inputErr:      &pgconn.PgError{Code: pgerrcode.CannotConnectNow},
			wantCode:      connect.CodeUnavailable,
			wantReason:    consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE,
			wantSQLState:  pgerrcode.CannotConnectNow,
			wantCondition: "cannot_connect_now",
		},
		{
			name:          "system error stays internal",
			inputErr:      &pgconn.PgError{Code: "58P03"},
			wantCode:      connect.CodeInternal,
			wantReason:    consolev1alpha1.ErrorReason_INTERNAL_ERROR,
			wantSQLState:  "58P03",
			wantCondition: "file_name_too_long",
		},
		{
			name:          "internal error stays internal",
			inputErr:      &pgconn.PgError{Code: pgerrcode.InternalError},
			wantCode:      connect.CodeInternal,
			wantReason:    consolev1alpha1.ErrorReason_INTERNAL_ERROR,
			wantSQLState:  pgerrcode.InternalError,
			wantCondition: "internal_error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapRepoErr(ctx, tt.inputErr, rctx)

			assert.Equal(t, tt.wantCode, connectErr.Code())

			info := requireErrorInfo(t, connectErr)
			assert.Equal(t, tt.wantReason.String(), info.Reason)
			assert.Equal(t, tt.wantSQLState, info.Metadata["sqlstate"])
			assert.Equal(t, tt.wantSQLState[:2], info.Metadata["sqlstate_class"])
			assert.Equal(t, tt.wantCondition, info.Metadata["condition_name"])
			assert.Equal(t, rctx.Op, info.Metadata["operation"])

			detail := requirePostgresErrorDetail(t, connectErr)
			assert.Equal(t, tt.wantSQLState, detail.Sqlstate)
			assert.Equal(t, tt.wantSQLState[:2], detail.SqlstateClass)
			assert.Equal(t, tt.wantCondition, detail.ConditionName)
			assert.Equal(t, rctx.Op, detail.Operation)

			if tt.wantResourceInfo {
				resourceInfo := requireResourceInfo(t, connectErr)
				assert.Equal(t, resource.TypeInstance.String(), resourceInfo.ResourceType)
				assert.Equal(t, rctx.Name, resourceInfo.ResourceName)
			}
		})
	}
}

func TestMapRepoErrRedactsMetaDatabasePostgresFields(t *testing.T) {
	t.Parallel()

	connectErr := MapRepoErr(
		context.Background(),
		&pgconn.PgError{
			Code:           pgerrcode.UniqueViolation,
			Message:        "duplicate api_key=secret",
			Detail:         "internal row contains customer data",
			Hint:           "inspect private_table",
			SchemaName:     "querylane_internal",
			TableName:      "credentials",
			ConstraintName: "credentials_key",
		},
		ResourceCtx{Type: resource.TypeInstance, Name: "instances/prod", Op: "create_instance"},
	)

	assert.Equal(t, connect.CodeAlreadyExists, connectErr.Code())
	assert.Equal(t, "PostgreSQL 23505 during create_instance", connectErr.Message())
	assert.NotContains(t, connectErr.Message(), "secret")

	info := requireErrorInfo(t, connectErr)
	assert.Equal(t, "23505", info.Metadata["sqlstate"])
	assert.NotContains(t, info.Metadata, "message")
	assert.NotContains(t, info.Metadata, "table_name")
	assert.NotContains(t, info.Metadata, "constraint_name")

	detail := requirePostgresErrorDetail(t, connectErr)
	assert.Equal(t, consolev1alpha1.PostgreSqlErrorKind_POSTGRESQL_ERROR_KIND_ALREADY_EXISTS, detail.Kind)
	assert.Equal(
		t,
		consolev1alpha1.PostgreSqlErrorRetryGuidance_POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
		detail.RetryGuidance,
	)
	assert.Empty(t, detail.ServerFields)
}
