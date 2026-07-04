package apierrors

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/engine"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestMapEngineErrPostgresSQLErrorDetails(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		err            error
		wantCode       connect.Code
		wantReason     consolev1alpha1.ErrorReason
		wantBadRequest bool
	}{
		{
			name: "invalid SQL keeps bad request and SQLSTATE metadata",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindInvalidArgument,
				SQLState:      "22P02",
				SQLStateClass: "22",
				ConditionName: "invalid_text_representation",
				Operation:     "execute query",
				SafeFields:    map[string]string{"column_name": "id"},
				Sentinel:      engine.ErrQueryInvalid,
				Cause:         errors.New("driver error"),
			},
			wantCode:       connect.CodeInvalidArgument,
			wantReason:     consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			wantBadRequest: true,
		},
		{
			name: "permission maps to permission denied with SQLSTATE metadata",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindPermissionDenied,
				SQLState:      "42501",
				SQLStateClass: "42",
				ConditionName: "insufficient_privilege",
				Operation:     "read rows",
				SafeFields:    map[string]string{"schema_name": "public", "table_name": "secret"},
				Sentinel:      engine.ErrQueryPermissionDenied,
				Cause:         errors.New("driver error"),
			},
			wantCode:       connect.CodePermissionDenied,
			wantReason:     consolev1alpha1.ErrorReason_PERMISSION_DENIED,
			wantBadRequest: false,
		},
		{
			name: "invalid password maps to unauthenticated with SQLSTATE metadata",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindUnauthenticated,
				SQLState:      "28P01",
				SQLStateClass: "28",
				ConditionName: "invalid_password",
				Operation:     "open connection",
				Sentinel:      engine.ErrQueryUnauthenticated,
				Cause:         errors.New("driver error"),
			},
			wantCode:       connect.CodeUnauthenticated,
			wantReason:     consolev1alpha1.ErrorReason_UNAUTHENTICATED,
			wantBadRequest: false,
		},
		{
			name: "retryable rollback maps to aborted",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindAborted,
				SQLState:      "40001",
				SQLStateClass: "40",
				ConditionName: "serialization_failure",
				Operation:     "read rows",
				Sentinel:      engine.ErrQueryRetryable,
				Cause:         errors.New("driver error"),
			},
			wantCode:       connect.CodeAborted,
			wantReason:     consolev1alpha1.ErrorReason_FAILED_PRECONDITION,
			wantBadRequest: false,
		},
		{
			name: "timeout maps to deadline exceeded",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindTimeout,
				SQLState:      "25P04",
				SQLStateClass: "25",
				ConditionName: "transaction_timeout",
				Operation:     "statement timeout",
				Sentinel:      engine.ErrQueryTimeout,
				Cause:         errors.New("driver error"),
			},
			wantCode:       connect.CodeDeadlineExceeded,
			wantReason:     consolev1alpha1.ErrorReason_TIMEOUT,
			wantBadRequest: false,
		},
	}

	ctx := context.Background()
	rctx := ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i/databases/d", Op: "execute_query"}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapEngineErr(ctx, tt.err, rctx)
			require.NotNil(t, connectErr)
			assert.Equal(t, tt.wantCode, connectErr.Code())

			errorInfo := requireErrorInfo(t, connectErr)
			assert.Equal(t, tt.wantReason.String(), errorInfo.Reason)
			assert.Equal(t, string(DomainConsole), errorInfo.Domain)
			assert.Equal(t, "execute_query", errorInfo.Metadata["operation"])

			postgresDetail := requirePostgresErrorDetail(t, connectErr)
			assert.Equal(t, "execute_query", postgresDetail.GetOperation())

			var pgErr *engine.PostgresSQLError
			require.ErrorAs(t, tt.err, &pgErr)
			assert.Equal(t, pgErr.SQLState, errorInfo.Metadata["sqlstate"])
			assert.Equal(t, pgErr.SQLStateClass, errorInfo.Metadata["sqlstate_class"])
			assert.Equal(t, pgErr.ConditionName, errorInfo.Metadata["condition_name"])
			assert.Equal(t, pgErr.SQLState, postgresDetail.GetSqlstate())
			assert.Equal(t, pgErr.SQLStateClass, postgresDetail.GetSqlstateClass())
			assert.Equal(t, pgErr.ConditionName, postgresDetail.GetConditionName())

			for key, value := range pgErr.SafeFields {
				assert.Equal(t, value, errorInfo.Metadata[key])
				assert.Equal(t, value, postgresDetail.GetServerFields()[key])
			}

			assert.NotContains(t, errorInfo.Metadata, "message")

			assert.Equal(t, tt.wantBadRequest, hasBadRequest(connectErr))
		})
	}
}

func TestMapEngineErrPostgresSQLErrorPreservesNotFoundResourceInfo(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{
		Type: resource.TypeSchema,
		Name: "instances/prod/databases/missing/schemas/public",
		Op:   "list_schemas",
	}
	pgErr := &engine.PostgresSQLError{
		Kind:          engine.PostgresSQLKindInvalidArgument,
		SQLState:      "3D000",
		SQLStateClass: "3D",
		ConditionName: "invalid_catalog_name",
		Operation:     "open database",
		Sentinel:      engine.ErrQueryInvalid,
		Cause:         errors.New("driver error"),
	}

	connectErr := MapEngineErr(ctx, fmt.Errorf("%w: %w", engine.ErrDatabaseNotFound, pgErr), rctx)
	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeNotFound, connectErr.Code())
	assert.Equal(t, "database not found: instances/prod/databases/missing", connectErr.Message())

	errorInfo := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND.String(), errorInfo.Reason)
	assert.Equal(t, "instances/prod/databases/missing", errorInfo.Metadata["resourceName"])
	assert.Equal(t, "3D000", errorInfo.Metadata["sqlstate"])
	assert.Equal(t, "3D", errorInfo.Metadata["sqlstate_class"])
	assert.Equal(t, "invalid_catalog_name", errorInfo.Metadata["condition_name"])

	resourceInfo := requireResourceInfo(t, connectErr)
	assert.Equal(t, resource.TypeDatabase.String(), resourceInfo.GetResourceType())
	assert.Equal(t, "instances/prod/databases/missing", resourceInfo.GetResourceName())
}

func TestMapEngineErrPgErrorPreservesNotFoundResourceInfo(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{
		Type: resource.TypeSchema,
		Name: "instances/prod/databases/missing/schemas/public",
		Op:   "list_schemas",
	}
	pgErr := &pgconn.PgError{
		Code:                "3D000",
		SeverityUnlocalized: "ERROR",
	}

	connectErr := MapEngineErr(ctx, fmt.Errorf("%w: %w", engine.ErrDatabaseNotFound, pgErr), rctx)
	require.NotNil(t, connectErr)
	assert.Equal(t, connect.CodeNotFound, connectErr.Code())
	assert.Equal(t, "database not found: instances/prod/databases/missing", connectErr.Message())

	errorInfo := requireErrorInfo(t, connectErr)
	assert.Equal(t, consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND.String(), errorInfo.Reason)
	assert.Equal(t, "instances/prod/databases/missing", errorInfo.Metadata["resourceName"])
	assert.Equal(t, "3D000", errorInfo.Metadata["sqlstate"])
	assert.Equal(t, "3D", errorInfo.Metadata["sqlstate_class"])
	assert.Equal(t, "invalid_catalog_name", errorInfo.Metadata["condition_name"])

	resourceInfo := requireResourceInfo(t, connectErr)
	assert.Equal(t, resource.TypeDatabase.String(), resourceInfo.GetResourceType())
	assert.Equal(t, "instances/prod/databases/missing", resourceInfo.GetResourceName())
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
