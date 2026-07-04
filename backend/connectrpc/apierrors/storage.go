package apierrors

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/protobuf/proto"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

// ResourceCtx captures the context needed to build rich Connect errors
// from storage layer errors. It prevents parameter confusion at call-sites.
type ResourceCtx struct {
	Type resource.Type // Canonical resource type (e.g. console.querylane.dev/Instance)
	Name string        // Resource identifier (e.g., instance name, database ID)
	Op   string        // Operation description (e.g., "get_instance", "create_instance")
}

func mapMetaDatabasePostgresClassification(classification PostgresErrorClassification) PostgresErrorClassification {
	// Preserve the Connect code chosen by the SQLSTATE policy; overlay only the
	// ErrorReason axis so clients can distinguish meta DB availability telemetry
	// from user-database query failures.
	switch classification.SQLStateClass {
	case "08", "53", "57":
		classification.ErrorReason = consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE
	case "58", "XX":
		classification.ConnectCode = connect.CodeInternal
		classification.ErrorReason = consolev1alpha1.ErrorReason_INTERNAL_ERROR
	}

	return classification
}

func mapRepoPostgresDetails(classification PostgresErrorClassification, rctx ResourceCtx) []proto.Message {
	if rctx.Type == "" || rctx.Name == "" {
		return nil
	}

	if classification.ErrorReason == consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS ||
		classification.ErrorReason == consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND {
		return []proto.Message{NewResourceInfo(rctx.Type, rctx.Name)}
	}

	return nil
}

// MapRepoErr converts storage layer errors to rich Connect RPC errors.
// This centralizes the repetitive error mapping logic that appears throughout
// service layers when calling repository methods.
//
// The function handles common storage errors and provides:
// - Rich error details for Connect RPC clients
// - Consistent structured logging for internal errors
// - Proper Connect error codes mapping
//
// Parameters:
//   - ctx: Context for logging
//   - err: The storage layer error to convert
//   - rctx: Resource context providing type, name, and operation details
//
// Returns a *connect.Error with appropriate error details and codes.
func MapRepoErr(ctx context.Context, err error, rctx ResourceCtx) *connect.Error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		classification := ClassifyPostgresError(pgErr, PostgresOperationLabel(rctx.Op))
		classification = mapMetaDatabasePostgresClassification(classification)

		return newPostgresErrorFromClassification(
			pgErr,
			classification,
			"",
			nil,
			mapRepoPostgresDetails(classification, rctx)...,
		)
	}

	switch {
	case errors.Is(err, storage.ErrNotFound):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND,
			KeyVal{Key: "resourceName", Value: rctx.Name},
		)
		resourceInfo := NewResourceInfo(rctx.Type, rctx.Name)

		return NewConnectError(
			connect.CodeNotFound,
			fmt.Errorf("%s not found: %s", rctx.Type.LowerKind(), rctx.Name),
			errorInfo,
			resourceInfo,
		)

	case errors.Is(err, storage.ErrAlreadyExists):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS,
			KeyVal{Key: "resourceName", Value: rctx.Name},
		)
		resourceInfo := NewResourceInfo(rctx.Type, rctx.Name)

		return NewConnectError(
			connect.CodeAlreadyExists,
			fmt.Errorf("%s already exists: %s", rctx.Type.LowerKind(), rctx.Name),
			errorInfo,
			resourceInfo,
		)

	case errors.Is(err, storage.ErrInvalidInput):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("invalid input for %s: %w", rctx.Op, err),
			errorInfo,
		)

	case errors.Is(err, storage.ErrInvalidReference):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeFailedPrecondition,
			fmt.Errorf("invalid reference in %s: %w", rctx.Op, err),
			errorInfo,
		)

	case errors.Is(err, storage.ErrConcurrentModification):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_FAILED_PRECONDITION,
			KeyVal{Key: "resourceName", Value: rctx.Name},
		)

		return NewConnectError(
			connect.CodeAborted,
			fmt.Errorf("concurrent modification of %s: %w", rctx.Name, err),
			errorInfo,
		)

	case errors.Is(err, storage.ErrConfigManaged):
		errorInfo := NewErrorInfo(
			DomainConsole,
			consolev1alpha1.ErrorReason_FAILED_PRECONDITION,
			KeyVal{Key: "operation", Value: rctx.Op},
		)

		return NewConnectError(
			connect.CodeFailedPrecondition,
			storage.ErrConfigManaged,
			errorInfo,
		)

	case errors.Is(err, storage.ErrInvalidOrderBy):
		return NewInvalidArgumentError(
			NewFieldViolation("order_by", err.Error()),
		)

	case errors.Is(err, storage.ErrInvalidPageToken):
		return NewInvalidArgumentError(
			NewFieldViolation("page_token", err.Error()),
		)

	case errors.Is(err, storage.ErrFilterMismatch), errors.Is(err, storage.ErrInvalidFilter):
		return NewInvalidArgumentError(
			NewFieldViolation("filter", err.Error()),
		)

	default:
		// Log unexpected repository errors with structured context
		slog.ErrorContext(ctx,
			"repository operation failed",
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
			fmt.Errorf("repository %s failed: %w", rctx.Op, err),
			errorInfo,
		)
	}
}
