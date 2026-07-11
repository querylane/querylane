package engine

import (
	"errors"

	"github.com/querylane/querylane/backend/aip"
)

// Structured errors returned by engine implementations.
var (
	// ErrInstanceNotFound indicates the requested instance does not exist.
	ErrInstanceNotFound = errors.New("instance not found")

	// ErrDatabaseNotFound indicates the requested database does not exist.
	ErrDatabaseNotFound = errors.New("database not found")

	// ErrSchemaNotFound indicates the requested schema does not exist.
	ErrSchemaNotFound = errors.New("schema not found")

	// ErrTableNotFound indicates the requested table does not exist.
	ErrTableNotFound = errors.New("table not found")

	// ErrViewNotFound indicates the requested view does not exist.
	ErrViewNotFound = errors.New("view not found")

	// ErrRoleNotFound indicates the requested role does not exist.
	ErrRoleNotFound = errors.New("role not found")

	// ErrWorkflowNotFound indicates the requested pg_durable workflow instance
	// does not exist or is not visible to the connection role under RLS.
	ErrWorkflowNotFound = errors.New("workflow not found")

	// ErrDurableNotInstalled indicates the pg_durable extension is not
	// installed in the connected database, so the df schema and its
	// introspection functions are absent.
	ErrDurableNotInstalled = errors.New("pg_durable extension is not installed in this database")

	// ErrQueryInvalid indicates the SQL statement or query options are invalid.
	ErrQueryInvalid = errors.New("invalid sql query")

	// ErrQueryTimeout indicates execution exceeded the configured timeout.
	ErrQueryTimeout = errors.New("sql query timed out")

	// ErrQueryCanceled indicates execution was canceled by the caller.
	ErrQueryCanceled = errors.New("sql query canceled")

	// ErrQueryPermissionDenied indicates PostgreSQL rejected the query for permissions/authz.
	ErrQueryPermissionDenied = errors.New("sql query permission denied")

	// ErrQueryFailedPrecondition indicates PostgreSQL rejected the query because server/session state is not compatible.
	ErrQueryFailedPrecondition = errors.New("sql query failed precondition")

	// ErrQueryRetryable indicates PostgreSQL rejected the query with retryable transaction/operator semantics.
	ErrQueryRetryable = errors.New("sql query retryable failure")

	// ErrQueryUnavailable indicates PostgreSQL or a backing PostgreSQL subsystem is temporarily unavailable.
	ErrQueryUnavailable = errors.New("sql query temporarily unavailable")

	// ErrQueryResourceExhausted indicates PostgreSQL could not run the query due to exhausted resources.
	ErrQueryResourceExhausted = errors.New("sql query resource exhausted")

	// ErrQueryUnauthenticated indicates PostgreSQL rejected authentication credentials.
	ErrQueryUnauthenticated = errors.New("sql query unauthenticated")

	// ErrInvalidOrderBy is a pagination error re-exported from aip for service-layer error mapping.
	ErrInvalidOrderBy = aip.ErrInvalidOrderBy

	// ErrInvalidPageToken is a pagination error re-exported from aip for service-layer error mapping.
	ErrInvalidPageToken = aip.ErrInvalidPageToken

	// ErrFilterMismatch is a pagination error re-exported from aip for service-layer error mapping.
	ErrFilterMismatch = aip.ErrFilterMismatch

	// ErrInvalidFilter is a pagination error re-exported from aip for service-layer error mapping.
	ErrInvalidFilter = aip.ErrInvalidFilter
)

// IsNotFound reports whether err matches any of the not-found sentinel errors.
func IsNotFound(err error) bool {
	return errors.Is(err, ErrInstanceNotFound) ||
		errors.Is(err, ErrDatabaseNotFound) ||
		errors.Is(err, ErrSchemaNotFound) ||
		errors.Is(err, ErrTableNotFound) ||
		errors.Is(err, ErrViewNotFound) ||
		errors.Is(err, ErrRoleNotFound) ||
		errors.Is(err, ErrWorkflowNotFound)
}

// InvalidQueryError carries a structured field path for a query-validation
// failure so the RPC layer can surface the exact request field (e.g.
// "order_by[0].column", "filter.predicate.values") instead of collapsing
// every violation to "statement". It always unwraps to ErrQueryInvalid, so
// existing errors.Is(err, engine.ErrQueryInvalid) checks keep working.
type InvalidQueryError struct {
	Path string
	Msg  string
}

// Error renders the error as "<base>: [<path>: ]<msg>" so the field path is
// visible in log lines without consumers needing to know the type.
func (e *InvalidQueryError) Error() string {
	if e.Path == "" {
		return ErrQueryInvalid.Error() + ": " + e.Msg
	}

	return ErrQueryInvalid.Error() + ": " + e.Path + ": " + e.Msg
}

// Unwrap exposes ErrQueryInvalid so errors.Is keeps working across the layer
// boundary.
func (e *InvalidQueryError) Unwrap() error { return ErrQueryInvalid }

// NewInvalidQueryError builds an InvalidQueryError. Path is the JSON-style
// request path (omit if not applicable); msg is a short reason.
func NewInvalidQueryError(path, msg string) error {
	return &InvalidQueryError{Path: path, Msg: msg}
}
