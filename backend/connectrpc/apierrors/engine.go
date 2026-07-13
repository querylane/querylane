package apierrors

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"connectrpc.com/connect"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/protobuf/proto"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

var schemaChildPathSegments = []string{"/tables/", "/views/"}

// MapEngineErr converts engine layer errors to rich Connect RPC errors.
// It mirrors the MapRepoErr pattern: one ResourceCtx per call, caller decides
// the resource context up-front.
//
// Returns nil when err is nil so it can be wired directly in service handlers.
func MapEngineErr(ctx context.Context, err error, rctx ResourceCtx) *connect.Error {
	if err == nil {
		return nil
	}

	var liveQueryLimitErr *livequery.LimitExceededError
	if errors.As(err, &liveQueryLimitErr) {
		return MapLiveQueryLimit(err)
	}

	// Hierarchy not-found sentinels win before generic SQLSTATE mapping so
	// clients get the actionable database/schema/table resource that is missing.
	if resourceType, name, ok := notFoundResource(err, rctx); ok {
		return newResourceNotFoundErrorWithDetails(
			resourceType,
			name,
			postgresSQLErrorInfoMetadata(err, rctx),
			postgresSQLErrorDetail(err, rctx.Op),
		)
	}

	var pgSQLErr *engine.PostgresSQLError
	if errors.As(err, &pgSQLErr) {
		return mapPostgresSQLError(err, pgSQLErr, rctx)
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if resourceType, name, ok := rawPostgresHierarchyNotFoundResource(pgErr, rctx); ok {
			classification := ClassifyPostgresError(pgErr, PostgresOperationLabel(rctx.Op))
			serverFields := postgresSafeServerFields(pgErr)

			return newResourceNotFoundErrorWithDetails(
				resourceType,
				name,
				postgresErrorInfoMetadata(classification, serverFields),
				postgresErrorDetail(classification, serverFields),
			)
		}

		return NewPostgresError(pgErr, PostgresOperationLabel(rctx.Op))
	}

	switch {
	case errors.Is(err, engine.ErrInvalidOrderBy):
		return NewInvalidArgumentError(
			NewFieldViolation("order_by", err.Error()),
		)

	case errors.Is(err, engine.ErrInvalidPageToken):
		return NewInvalidArgumentError(
			NewFieldViolation("page_token", err.Error()),
		)

	case errors.Is(err, engine.ErrFilterMismatch), errors.Is(err, engine.ErrInvalidFilter):
		return NewInvalidArgumentError(
			NewFieldViolation("filter", err.Error()),
		)

	case errors.Is(err, engine.ErrQueryInvalid):
		field := "statement"

		var iqe *engine.InvalidQueryError
		if errors.As(err, &iqe) && iqe.Path != "" {
			field = iqe.Path
		}

		return NewInvalidArgumentError(
			NewFieldViolation(field, err.Error()),
		)

	case errors.Is(err, engine.ErrQueryTimeout):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_TIMEOUT,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeDeadlineExceeded,
			err,
			errorInfo,
		)

	// Pool dials and connection tests are bounded by a context deadline; when
	// one expires the instance is unreachable (e.g. still waking up), which is
	// an availability condition rather than an internal fault.
	case errors.Is(err, context.DeadlineExceeded):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_TIMEOUT,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeUnavailable,
			err,
			errorInfo,
		)

	case errors.Is(err, engine.ErrQueryCanceled), errors.Is(err, context.Canceled):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_INTERNAL_ERROR,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeCanceled,
			err,
			errorInfo,
		)
	}

	// Unknown error — log and return CodeInternal.
	slog.ErrorContext(ctx,
		"engine operation failed",
		slog.Any("error", err),
		slog.String("resource_type", rctx.Type.String()),
		slog.String("resource_name", rctx.Name),
		slog.String("operation", rctx.Op),
	)

	errorInfo := NewErrorInfo(
		DomainConsole,
		consolev1alpha1.ErrorReason_INTERNAL_ERROR,
		KeyVal{Key: "operation", Value: rctx.Op},
	)

	return NewConnectError(
		connect.CodeInternal,
		fmt.Errorf("engine %s failed: %w", rctx.Op, err),
		errorInfo,
	)
}

func newResourceNotFoundErrorWithDetails(
	resourceType resource.Type,
	name string,
	metadata []KeyVal,
	otherDetails ...proto.Message,
) *connect.Error {
	errorInfoMetadata := make([]KeyVal, 0, 1+len(metadata))
	errorInfoMetadata = append(errorInfoMetadata, KeyVal{Key: "resourceName", Value: name})
	errorInfoMetadata = append(errorInfoMetadata, metadata...)

	errorInfo := NewErrorInfo(
		DomainConsole,
		consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
		errorInfoMetadata...,
	)
	resourceInfo := NewResourceInfo(resourceType, name)

	details := make([]proto.Message, 0, 1+len(otherDetails))
	details = append(details, resourceInfo)
	details = append(details, otherDetails...)

	return NewConnectError(
		connect.CodeNotFound,
		fmt.Errorf("%s not found: %s", resourceType.LowerKind(), name),
		errorInfo,
		details...,
	)
}

func rawPostgresHierarchyNotFoundResource(pgErr *pgconn.PgError, rctx ResourceCtx) (resource.Type, string, bool) {
	if pgErr == nil {
		return "", "", false
	}

	switch strings.ToUpper(strings.TrimSpace(pgErr.Code)) {
	case pgerrcode.InvalidCatalogName:
		name := truncateBefore(rctx.Name, "/schemas/")
		if !strings.Contains(name, "/databases/") {
			return "", "", false
		}

		return resource.TypeDatabase, name, true

	case pgerrcode.InvalidSchemaName:
		name := truncateBefore(rctx.Name, schemaChildPathSegments...)
		if !strings.Contains(name, "/schemas/") {
			return "", "", false
		}

		return resource.TypeSchema, name, true

	default:
		return "", "", false
	}
}

func postgresSQLErrorInfoMetadata(err error, rctx ResourceCtx) []KeyVal {
	var pgSQLErr *engine.PostgresSQLError
	if errors.As(err, &pgSQLErr) {
		return postgresSQLMetadata(pgSQLErr, rctx)
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		classification := ClassifyPostgresError(pgErr, PostgresOperationLabel(rctx.Op))
		return postgresErrorInfoMetadata(classification, postgresSafeServerFields(pgErr))
	}

	return nil
}

func postgresSQLErrorDetail(err error, operation string) *consolev1alpha1.PostgreSqlErrorDetail {
	var pgSQLErr *engine.PostgresSQLError
	if errors.As(err, &pgSQLErr) {
		return NewPostgresSQLErrorDetail(pgSQLErr, operation)
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		classification := ClassifyPostgresError(pgErr, PostgresOperationLabel(operation))
		return postgresErrorDetail(classification, postgresSafeServerFields(pgErr))
	}

	return nil
}

func mapPostgresSQLError(err error, pgSQLErr *engine.PostgresSQLError, rctx ResourceCtx) *connect.Error {
	code, reason := postgresSQLConnectMapping(pgSQLErr.Kind)
	errorInfo := NewErrorInfo(
		DomainConsole,
		reason,
		postgresSQLMetadata(pgSQLErr, rctx)...,
	)
	detail := NewPostgresSQLErrorDetail(pgSQLErr, rctx.Op)

	if pgSQLErr.Kind == engine.PostgresSQLKindInvalidArgument {
		badRequest := NewBadRequest(
			NewFieldViolation(postgresSQLRequestField(rctx.Op), err.Error()),
		)

		return NewConnectError(code, err, errorInfo, detail, badRequest)
	}

	return NewConnectError(code, err, errorInfo, detail)
}

// PostgresSQLKindConnectCode maps the engine-level PostgreSQL classification
// to the Connect code used at RPC boundaries.
func PostgresSQLKindConnectCode(kind engine.PostgresSQLKind) connect.Code {
	code, _ := postgresSQLConnectMapping(kind)

	return code
}

func postgresSQLConnectMapping(kind engine.PostgresSQLKind) (connect.Code, consolev1alpha1.ErrorReason) {
	// ErrorReason is intentionally coarser than Connect code for retry,
	// unavailable, and resource exhaustion cases. Clients that need fine-grained
	// SQL handling should use Connect code plus sqlstate, sqlstate_class, and
	// condition_name metadata.
	switch kind {
	case engine.PostgresSQLKindInvalidArgument:
		return connect.CodeInvalidArgument, consolev1alpha1.ErrorReason_INVALID_ARGUMENT
	case engine.PostgresSQLKindFailedPrecondition:
		return connect.CodeFailedPrecondition, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case engine.PostgresSQLKindNotFound:
		// Today SQLSTATE-backed hierarchy not-found errors are mapped earlier
		// from ErrDatabaseNotFound/ErrSchemaNotFound sentinels so ResourceInfo
		// is preserved. Add ResourceInfo before introducing non-sentinel
		// PostgresSQLKindNotFound errors.
		return connect.CodeNotFound, consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND
	case engine.PostgresSQLKindPermissionDenied:
		return connect.CodePermissionDenied, consolev1alpha1.ErrorReason_PERMISSION_DENIED
	case engine.PostgresSQLKindUnauthenticated:
		return connect.CodeUnauthenticated, consolev1alpha1.ErrorReason_UNAUTHENTICATED
	case engine.PostgresSQLKindAborted:
		return connect.CodeAborted, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case engine.PostgresSQLKindTimeout:
		return connect.CodeDeadlineExceeded, consolev1alpha1.ErrorReason_TIMEOUT
	case engine.PostgresSQLKindUnavailable:
		return connect.CodeUnavailable, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case engine.PostgresSQLKindResourceExhausted:
		return connect.CodeResourceExhausted, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case engine.PostgresSQLKindInternal:
		return connect.CodeInternal, consolev1alpha1.ErrorReason_INTERNAL_ERROR
	default:
		return connect.CodeInternal, consolev1alpha1.ErrorReason_INTERNAL_ERROR
	}
}

func postgresSQLMetadata(pgSQLErr *engine.PostgresSQLError, rctx ResourceCtx) []KeyVal {
	metadata := PostgresSQLErrorMetadata(pgSQLErr, rctx.Op)

	keys := make([]string, 0, len(metadata))
	for key := range metadata {
		keys = append(keys, key)
	}

	slices.Sort(keys)

	out := make([]KeyVal, 0, len(keys))
	for _, key := range keys {
		out = append(out, KeyVal{Key: key, Value: metadata[key]})
	}

	return out
}

// PostgresSQLErrorMetadata builds safe snake_case ErrorInfo metadata for an
// engine PostgreSQL error. The operation argument is the wire/RPC operation
// label; if empty, pgSQLErr.Operation is used.
func PostgresSQLErrorMetadata(pgSQLErr *engine.PostgresSQLError, operation string) map[string]string {
	if pgSQLErr == nil {
		return nil
	}

	if operation == "" {
		operation = pgSQLErr.Operation
	}

	metadata := map[string]string{
		// Wire metadata uses the RPC-level operation. pgSQLErr.Operation remains
		// in the error string for internal logs, such as "scan row".
		"operation": operation,
	}

	if pgSQLErr.SQLState != "" {
		metadata["sqlstate"] = pgSQLErr.SQLState
	}

	if pgSQLErr.SQLStateClass != "" {
		metadata["sqlstate_class"] = pgSQLErr.SQLStateClass
	}

	if pgSQLErr.ConditionName != "" {
		metadata["condition_name"] = pgSQLErr.ConditionName
	}

	for key, value := range pgSQLErr.SafeFields {
		if value != "" {
			metadata[key] = value
		}
	}

	return metadata
}

// NewPostgresSQLErrorDetail builds the typed PostgreSQL error detail for an
// engine-classified PostgreSQL error. The operation argument is the wire/RPC
// operation label; if empty, pgSQLErr.Operation is used.
func NewPostgresSQLErrorDetail(pgSQLErr *engine.PostgresSQLError, operation string) *consolev1alpha1.PostgreSqlErrorDetail {
	if pgSQLErr == nil {
		return nil
	}

	if operation == "" {
		operation = pgSQLErr.Operation
	}

	return &consolev1alpha1.PostgreSqlErrorDetail{
		Sqlstate:      pgSQLErr.SQLState,
		SqlstateClass: pgSQLErr.SQLStateClass,
		ConditionName: pgSQLErr.ConditionName,
		Operation:     operation,
		ServerFields:  pgSQLErr.SafeFields,
	}
}

func postgresSQLRequestField(op string) string {
	switch op {
	case "execute_query", "explain_query":
		return "statement"
	case "read_rows":
		return "filter"
	case "read_cell_value":
		return "full_value_token"
	default:
		return "statement"
	}
}

// notFoundResource derives the correct resource type and name from a not-found
// sentinel error. When the sentinel refers to a parent resource (e.g.
// ErrInstanceNotFound returned from ValidateTable), the resource name is
// truncated to the relevant parent segment so the error accurately identifies
// which resource is missing.
func notFoundResource(err error, rctx ResourceCtx) (resourceType resource.Type, name string, ok bool) { //nolint:nonamedreturns // named returns document the three-way return
	name = rctx.Name

	switch {
	case errors.Is(err, engine.ErrRoleNotFound):
		return resource.TypeRole, name, true
	case errors.Is(err, engine.ErrViewNotFound):
		return resource.TypeView, name, true
	case errors.Is(err, engine.ErrTableNotFound):
		return resource.TypeTable, name, true
	case errors.Is(err, engine.ErrSchemaNotFound):
		return resource.TypeSchema, truncateBefore(name, schemaChildPathSegments...), true
	case errors.Is(err, engine.ErrDatabaseNotFound):
		return resource.TypeDatabase, truncateBefore(name, "/schemas/"), true
	case errors.Is(err, engine.ErrInstanceNotFound):
		return resource.TypeInstance, truncateBefore(name, "/databases/"), true
	default:
		return "", "", false
	}
}

// truncateBefore returns name truncated just before the first occurrence of any
// of the given path segments. If none are found, name is returned as-is.
func truncateBefore(name string, segments ...string) string {
	best := len(name)

	for _, seg := range segments {
		if idx := strings.Index(name, seg); idx != -1 && idx < best {
			best = idx
		}
	}

	return name[:best]
}
