package apierrors

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/engine"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestMapEngineErr(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	tests := []struct {
		name               string
		inputErr           error
		rctx               ResourceCtx
		expectedCode       connect.Code
		expectedReason     consolev1alpha1.ErrorReason
		expectedErrMessage string
	}{
		{
			name:               "ErrInstanceNotFound",
			inputErr:           engine.ErrInstanceNotFound,
			rctx:               ResourceCtx{Type: resource.TypeDatabase, Name: "instances/nonexistent", Op: "list_databases"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "instance not found: instances/nonexistent",
		},
		{
			name:               "ErrDatabaseNotFound",
			inputErr:           engine.ErrDatabaseNotFound,
			rctx:               ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i1/databases/test_db", Op: "validate_database"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "database not found: instances/i1/databases/test_db",
		},
		{
			name:               "ErrSchemaNotFound",
			inputErr:           engine.ErrSchemaNotFound,
			rctx:               ResourceCtx{Type: resource.TypeSchema, Name: "instances/i1/databases/test_db/schemas/public", Op: "validate_schema"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "schema not found: instances/i1/databases/test_db/schemas/public",
		},
		{
			name:               "ErrTableNotFound",
			inputErr:           engine.ErrTableNotFound,
			rctx:               ResourceCtx{Type: resource.TypeTable, Name: "instances/i1/databases/test_db/schemas/public/tables/users", Op: "validate_table"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "table not found: instances/i1/databases/test_db/schemas/public/tables/users",
		},
		{
			name:               "ErrInstanceNotFound_from_table_validation",
			inputErr:           engine.ErrInstanceNotFound,
			rctx:               ResourceCtx{Type: resource.TypeTable, Name: "instances/nonexistent/databases/mydb/schemas/public/tables/users", Op: "validate_parent"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "instance not found: instances/nonexistent",
		},
		{
			name:               "ErrDatabaseNotFound_from_table_validation",
			inputErr:           engine.ErrDatabaseNotFound,
			rctx:               ResourceCtx{Type: resource.TypeTable, Name: "instances/i1/databases/nonexistent/schemas/public/tables/users", Op: "validate_parent"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "database not found: instances/i1/databases/nonexistent",
		},
		{
			name:               "ErrSchemaNotFound_from_table_validation",
			inputErr:           engine.ErrSchemaNotFound,
			rctx:               ResourceCtx{Type: resource.TypeTable, Name: "instances/i1/databases/mydb/schemas/nonexistent/tables/users", Op: "validate_parent"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "schema not found: instances/i1/databases/mydb/schemas/nonexistent",
		},
		{
			name:               "ErrSchemaNotFound_from_view_validation",
			inputErr:           engine.ErrSchemaNotFound,
			rctx:               ResourceCtx{Type: resource.TypeView, Name: "instances/i1/databases/mydb/schemas/nonexistent/views/v1", Op: "list_views"},
			expectedCode:       connect.CodeNotFound,
			expectedReason:     consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			expectedErrMessage: "schema not found: instances/i1/databases/mydb/schemas/nonexistent",
		},
		{
			name:               "Unknown error returns CodeInternal",
			inputErr:           errors.New("some unknown engine error"),
			rctx:               ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i1/databases/test_db", Op: "get_database"},
			expectedCode:       connect.CodeInternal,
			expectedReason:     consolev1alpha1.ErrorReason_INTERNAL_ERROR,
			expectedErrMessage: "engine get_database failed: some unknown engine error",
		},
		{
			name:               "ErrQueryTimeout",
			inputErr:           engine.ErrQueryTimeout,
			rctx:               ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i1/databases/test_db", Op: "execute_query"},
			expectedCode:       connect.CodeDeadlineExceeded,
			expectedReason:     consolev1alpha1.ErrorReason_TIMEOUT,
			expectedErrMessage: engine.ErrQueryTimeout.Error(),
		},
		{
			name:               "ErrQueryCanceled",
			inputErr:           engine.ErrQueryCanceled,
			rctx:               ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i1/databases/test_db", Op: "execute_query"},
			expectedCode:       connect.CodeCanceled,
			expectedReason:     consolev1alpha1.ErrorReason_INTERNAL_ERROR,
			expectedErrMessage: engine.ErrQueryCanceled.Error(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapEngineErr(ctx, tt.inputErr, tt.rctx)
			if connectErr == nil {
				t.Fatal("expected non-nil error")
			}

			if connectErr.Code() != tt.expectedCode {
				t.Errorf("expected code %v, got %v", tt.expectedCode, connectErr.Code())
			}

			if connectErr.Message() != tt.expectedErrMessage {
				t.Errorf("expected message %q, got %q", tt.expectedErrMessage, connectErr.Message())
			}

			details := connectErr.Details()
			if len(details) == 0 {
				t.Fatal("expected at least one error detail")
			}

			found := false
			foundResourceInfo := false

			for _, detail := range details {
				value, err := detail.Value()
				if err != nil {
					continue
				}

				switch typed := value.(type) {
				case *errdetails.ErrorInfo:
					found = true

					if typed.Reason != tt.expectedReason.String() {
						t.Errorf("expected reason %q, got %q", tt.expectedReason, typed.Reason)
					}

					if typed.Domain != string(DomainConsole) {
						t.Errorf("expected domain %q, got %q", DomainConsole, typed.Domain)
					}

					if tt.expectedCode == connect.CodeNotFound {
						if got := typed.Metadata["resourceName"]; got != truncateExpectedName(tt.inputErr, tt.rctx.Name) {
							t.Errorf("expected resourceName metadata %q, got %q", truncateExpectedName(tt.inputErr, tt.rctx.Name), got)
						}
					}

				case *errdetails.ResourceInfo:
					foundResourceInfo = true

					if tt.expectedCode != connect.CodeNotFound {
						t.Errorf("unexpected ResourceInfo detail for code %v", tt.expectedCode)
						continue
					}

					wantName := truncateExpectedName(tt.inputErr, tt.rctx.Name)
					if typed.ResourceName != wantName {
						t.Errorf("expected resource name %q, got %q", wantName, typed.ResourceName)
					}

					if typed.ResourceType != resourceTypeForErr(tt.inputErr, tt.rctx.Type).String() {
						t.Errorf("expected resource type %q, got %q", resourceTypeForErr(tt.inputErr, tt.rctx.Type).String(), typed.ResourceType)
					}
				}
			}

			if !found {
				t.Error("ErrorInfo detail not found")
			}

			if tt.expectedCode == connect.CodeNotFound && !foundResourceInfo {
				t.Error("ResourceInfo detail not found")
			}
		})
	}
}

func TestMapEngineErrNotFoundSentinelDoesNotAttachPostgresDetail(t *testing.T) {
	t.Parallel()

	connectErr := MapEngineErr(context.Background(), engine.ErrTableNotFound, ResourceCtx{
		Type: resource.TypeTable,
		Name: "instances/i1/databases/app/schemas/public/tables/missing",
		Op:   "validate_table",
	})
	if connectErr == nil {
		t.Fatal("expected connect error")
	}

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		if err != nil {
			continue
		}

		if _, ok := value.(*consolev1alpha1.PostgreSqlErrorDetail); ok {
			t.Fatal("unexpected PostgreSqlErrorDetail for plain not-found sentinel")
		}
	}
}

func resourceTypeForErr(err error, defaultType resource.Type) resource.Type {
	switch {
	case errors.Is(err, engine.ErrViewNotFound):
		return resource.TypeView
	case errors.Is(err, engine.ErrTableNotFound):
		return resource.TypeTable
	case errors.Is(err, engine.ErrSchemaNotFound):
		return resource.TypeSchema
	case errors.Is(err, engine.ErrDatabaseNotFound):
		return resource.TypeDatabase
	case errors.Is(err, engine.ErrInstanceNotFound):
		return resource.TypeInstance
	default:
		return defaultType
	}
}

func truncateExpectedName(err error, name string) string {
	switch {
	case errors.Is(err, engine.ErrSchemaNotFound):
		return truncateBefore(name, schemaChildPathSegments...)
	case errors.Is(err, engine.ErrDatabaseNotFound):
		return truncateBefore(name, "/schemas/")
	case errors.Is(err, engine.ErrInstanceNotFound):
		return truncateBefore(name, "/databases/")
	default:
		return name
	}
}

func TestMapEngineErrPostgresHierarchyNotFoundPreservesResourceInfo(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		err      error
		rctx     ResourceCtx
		wantType resource.Type
		wantName string
		wantSQL  string
		wantOp   string
	}{
		{
			name: "raw invalid catalog maps to database resource",
			err:  &pgconn.PgError{Code: "3D000"},
			rctx: ResourceCtx{
				Type: resource.TypeTable,
				Name: "instances/i1/databases/missing/schemas/public/tables/users",
				Op:   "read_rows",
			},
			wantType: resource.TypeDatabase,
			wantName: "instances/i1/databases/missing",
			wantSQL:  "3D000",
			wantOp:   "read_rows",
		},
		{
			name: "raw invalid schema maps to schema resource",
			err:  &pgconn.PgError{Code: "3F000"},
			rctx: ResourceCtx{
				Type: resource.TypeTable,
				Name: "instances/i1/databases/app/schemas/missing/tables/users",
				Op:   "list_tables",
			},
			wantType: resource.TypeSchema,
			wantName: "instances/i1/databases/app/schemas/missing",
			wantSQL:  "3F000",
			wantOp:   "list_tables",
		},
		{
			name: "engine-wrapped invalid catalog maps to database resource",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindNotFound,
				SQLState:      "3D000",
				SQLStateClass: "3D",
				ConditionName: "invalid_catalog_name",
				Operation:     "open database",
				Sentinel:      engine.ErrDatabaseNotFound,
				Cause:         &pgconn.PgError{Code: "3D000"},
			},
			rctx: ResourceCtx{
				Type: resource.TypeTable,
				Name: "instances/i1/databases/missing/schemas/public/tables/users",
				Op:   "read_rows",
			},
			wantType: resource.TypeDatabase,
			wantName: "instances/i1/databases/missing",
			wantSQL:  "3D000",
			wantOp:   "read_rows",
		},
		{
			name: "engine-wrapped invalid schema maps to schema resource",
			err: &engine.PostgresSQLError{
				Kind:          engine.PostgresSQLKindNotFound,
				SQLState:      "3F000",
				SQLStateClass: "3F",
				ConditionName: "invalid_schema_name",
				Operation:     "open schema",
				Sentinel:      engine.ErrSchemaNotFound,
				Cause:         &pgconn.PgError{Code: "3F000"},
			},
			rctx: ResourceCtx{
				Type: resource.TypeTable,
				Name: "instances/i1/databases/app/schemas/missing/tables/users",
				Op:   "list_tables",
			},
			wantType: resource.TypeSchema,
			wantName: "instances/i1/databases/app/schemas/missing",
			wantSQL:  "3F000",
			wantOp:   "list_tables",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapEngineErr(context.Background(), tt.err, tt.rctx)
			if connectErr == nil {
				t.Fatal("expected connect error")
			}

			if connectErr.Code() != connect.CodeNotFound {
				t.Fatalf("expected code %v, got %v", connect.CodeNotFound, connectErr.Code())
			}

			resourceInfo := requireEngineResourceInfo(t, connectErr)
			if resourceInfo.GetResourceType() != tt.wantType.String() {
				t.Errorf("expected resource type %q, got %q", tt.wantType.String(), resourceInfo.GetResourceType())
			}

			if resourceInfo.GetResourceName() != tt.wantName {
				t.Errorf("expected resource name %q, got %q", tt.wantName, resourceInfo.GetResourceName())
			}

			postgresDetail := requirePostgresErrorDetail(t, connectErr)
			if postgresDetail.GetSqlstate() != tt.wantSQL {
				t.Errorf("expected sqlstate %q, got %q", tt.wantSQL, postgresDetail.GetSqlstate())
			}

			if postgresDetail.GetOperation() != tt.wantOp {
				t.Errorf("expected operation %q, got %q", tt.wantOp, postgresDetail.GetOperation())
			}
		})
	}
}

func requireEngineResourceInfo(t *testing.T, connectErr *connect.Error) *errdetails.ResourceInfo {
	t.Helper()

	for _, detail := range connectErr.Details() {
		value, err := detail.Value()
		if err != nil {
			continue
		}

		if resourceInfo, ok := value.(*errdetails.ResourceInfo); ok {
			return resourceInfo
		}
	}

	t.Fatal("ResourceInfo detail not found")

	return nil
}

func TestMapEngineErr_PaginationErrors(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{Type: resource.TypeDatabase, Name: "instances/i1", Op: "list_databases"}

	tests := []struct {
		name          string
		inputErr      error
		expectedCode  connect.Code
		expectedField string
	}{
		{
			name:          "ErrInvalidOrderBy",
			inputErr:      engine.ErrInvalidOrderBy,
			expectedCode:  connect.CodeInvalidArgument,
			expectedField: "order_by",
		},
		{
			name:          "ErrInvalidPageToken",
			inputErr:      engine.ErrInvalidPageToken,
			expectedCode:  connect.CodeInvalidArgument,
			expectedField: "page_token",
		},
		{
			name:          "ErrFilterMismatch",
			inputErr:      engine.ErrFilterMismatch,
			expectedCode:  connect.CodeInvalidArgument,
			expectedField: "filter",
		},
		{
			name:          "ErrInvalidFilter",
			inputErr:      fmt.Errorf("%w: unsupported catalog filter: owner = 'postgres'", engine.ErrInvalidFilter),
			expectedCode:  connect.CodeInvalidArgument,
			expectedField: "filter",
		},
		{
			name:          "ErrQueryInvalid",
			inputErr:      engine.ErrQueryInvalid,
			expectedCode:  connect.CodeInvalidArgument,
			expectedField: "statement",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			connectErr := MapEngineErr(ctx, tt.inputErr, rctx)
			if connectErr == nil {
				t.Fatal("expected non-nil error")
			}

			if connectErr.Code() != tt.expectedCode {
				t.Errorf("expected code %v, got %v", tt.expectedCode, connectErr.Code())
			}

			// Verify BadRequest detail contains the expected field violation
			details := connectErr.Details()
			foundField := false

			for _, detail := range details {
				if value, err := detail.Value(); err == nil {
					if br, ok := value.(*errdetails.BadRequest); ok {
						for _, fv := range br.FieldViolations {
							if fv.Field == tt.expectedField {
								foundField = true
								break
							}
						}
					}
				}
			}

			if !foundField {
				t.Errorf("expected field violation for %q not found", tt.expectedField)
			}
		})
	}
}

func TestMapEngineErr_NilError(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rctx := ResourceCtx{Type: resource.TypeTable, Name: "test_table", Op: "get_table"}

	connectErr := MapEngineErr(ctx, nil, rctx)
	if connectErr != nil {
		t.Errorf("expected nil error for nil input, got %v", connectErr)
	}
}

func TestMapEngineErr_PostgresErrorUsesSQLStateClassifier(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	pgErr := &pgconn.PgError{
		Code:           "23505",
		Message:        "duplicate key value contains customer@example.com",
		ConstraintName: "users_email_key",
		Position:       42,
	}

	connectErr := MapEngineErr(ctx, fmt.Errorf("insert user: %w", pgErr), ResourceCtx{
		Type: resource.TypeDatabase,
		Name: "instances/prod/databases/app",
		Op:   "execute_query",
	})
	if connectErr == nil {
		t.Fatal("expected non-nil error")
	}

	if connectErr.Code() != connect.CodeAlreadyExists {
		t.Errorf("expected code %v, got %v", connect.CodeAlreadyExists, connectErr.Code())
	}

	if connectErr.Message() != "PostgreSQL unique_violation during execute_query" {
		t.Errorf("expected safe message, got %q", connectErr.Message())
	}

	var unwrapped *pgconn.PgError
	if !errors.As(connectErr, &unwrapped) {
		t.Fatal("expected PgError to remain in error chain")
	}

	if unwrapped != pgErr {
		t.Fatal("expected original PgError in error chain")
	}

	info := requireErrorInfo(t, connectErr)
	if info.Reason != consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS.String() {
		t.Errorf("expected reason %q, got %q", consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS, info.Reason)
	}

	if info.Metadata["sqlstate"] != "23505" {
		t.Errorf("expected sqlstate metadata, got %q", info.Metadata["sqlstate"])
	}

	if info.Metadata["constraint_name"] != "users_email_key" {
		t.Errorf("expected constraint_name metadata, got %q", info.Metadata["constraint_name"])
	}

	if info.Metadata["position"] != "42" {
		t.Errorf("expected position metadata, got %q", info.Metadata["position"])
	}

	if _, ok := info.Metadata["constraintName"]; ok {
		t.Errorf("unexpected legacy constraintName metadata: %q", info.Metadata["constraintName"])
	}
}

func TestMapEngineErrWorkflow(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	workflowName := "instances/prod/databases/app/workflows/wf-01hq3"

	t.Run("workflow not found maps to NotFound with workflow resource", func(t *testing.T) {
		t.Parallel()

		connectErr := MapEngineErr(ctx, fmt.Errorf("%w: wf-01hq3", engine.ErrWorkflowNotFound), ResourceCtx{
			Type: resource.TypeWorkflow,
			Name: workflowName,
			Op:   "get_workflow",
		})
		if connectErr == nil {
			t.Fatal("expected non-nil error")
		}

		if connectErr.Code() != connect.CodeNotFound {
			t.Errorf("expected code %v, got %v", connect.CodeNotFound, connectErr.Code())
		}

		if connectErr.Message() != "workflow not found: "+workflowName {
			t.Errorf("unexpected message %q", connectErr.Message())
		}

		info := requireErrorInfo(t, connectErr)
		if info.Reason != consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND.String() {
			t.Errorf("expected reason %q, got %q", consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND, info.Reason)
		}
	})

	t.Run("pg_durable not installed maps to FailedPrecondition", func(t *testing.T) {
		t.Parallel()

		// The engine sentinel wraps the raw PgError; the FailedPrecondition
		// mapping must win over the generic SQLSTATE classification.
		pgErr := &pgconn.PgError{Code: "3F000", Message: `schema "df" does not exist`}

		connectErr := MapEngineErr(ctx, fmt.Errorf("%w: %w", engine.ErrDurableNotInstalled, pgErr), ResourceCtx{
			Type: resource.TypeWorkflow,
			Name: "instances/prod/databases/app",
			Op:   "list_workflows",
		})
		if connectErr == nil {
			t.Fatal("expected non-nil error")
		}

		if connectErr.Code() != connect.CodeFailedPrecondition {
			t.Errorf("expected code %v, got %v", connect.CodeFailedPrecondition, connectErr.Code())
		}

		info := requireErrorInfo(t, connectErr)
		if info.Reason != consolev1alpha1.ErrorReason_FAILED_PRECONDITION.String() {
			t.Errorf("expected reason %q, got %q", consolev1alpha1.ErrorReason_FAILED_PRECONDITION, info.Reason)
		}
	})

	t.Run("pg_durable access denied maps to PermissionDenied", func(t *testing.T) {
		t.Parallel()

		// Installed-but-not-granted: the sentinel wraps SQLSTATE 42501 and must
		// map to PermissionDenied, not the generic internal path, so the UI can
		// point the operator at df.grant_usage.
		pgErr := &pgconn.PgError{Code: "42501", Message: `permission denied for schema df`}

		connectErr := MapEngineErr(ctx, fmt.Errorf("%w: %w", engine.ErrDurableAccessDenied, pgErr), ResourceCtx{
			Type: resource.TypeWorkflow,
			Name: "instances/prod/databases/app",
			Op:   "list_workflows",
		})
		if connectErr == nil {
			t.Fatal("expected non-nil error")
		}

		if connectErr.Code() != connect.CodePermissionDenied {
			t.Errorf("expected code %v, got %v", connect.CodePermissionDenied, connectErr.Code())
		}

		info := requireErrorInfo(t, connectErr)
		if info.Reason != consolev1alpha1.ErrorReason_PERMISSION_DENIED.String() {
			t.Errorf("expected reason %q, got %q", consolev1alpha1.ErrorReason_PERMISSION_DENIED, info.Reason)
		}
	})
}
