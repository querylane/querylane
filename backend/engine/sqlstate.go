package engine

import "fmt"

// PostgresSQLKind describes how a PostgreSQL SQLSTATE should be exposed at
// the API boundary. It intentionally stays transport-agnostic so engine code
// does not import ConnectRPC.
type PostgresSQLKind string

const (
	PostgresSQLKindInvalidArgument    PostgresSQLKind = "invalid_argument"
	PostgresSQLKindFailedPrecondition PostgresSQLKind = "failed_precondition"
	PostgresSQLKindNotFound           PostgresSQLKind = "not_found"
	PostgresSQLKindPermissionDenied   PostgresSQLKind = "permission_denied"
	PostgresSQLKindUnauthenticated    PostgresSQLKind = "unauthenticated"
	PostgresSQLKindAborted            PostgresSQLKind = "aborted"
	PostgresSQLKindTimeout            PostgresSQLKind = "timeout"
	PostgresSQLKindUnavailable        PostgresSQLKind = "unavailable"
	PostgresSQLKindResourceExhausted  PostgresSQLKind = "resource_exhausted"
	PostgresSQLKindInternal           PostgresSQLKind = "internal"
)

// PostgresSQLError carries a safe, SQLSTATE-aware classification for errors
// returned by user-managed PostgreSQL instances. SafeFields may include server
// identifiers such as schema/table/column names, but must not include raw
// message/detail/hint text because those can contain user data or secrets.
type PostgresSQLError struct {
	Kind          PostgresSQLKind
	SQLState      string
	SQLStateClass string
	ConditionName string
	Operation     string
	SafeFields    map[string]string
	Sentinel      error
	Cause         error
}

func (e *PostgresSQLError) Error() string {
	if e == nil {
		return "postgres sqlstate error: <nil>"
	}

	condition := e.ConditionName
	if condition == "" {
		condition = "unknown_condition"
	}

	if e.Operation == "" {
		return fmt.Sprintf("postgres sqlstate %s %s", e.SQLState, condition)
	}

	return fmt.Sprintf("%s: postgres sqlstate %s %s", e.Operation, e.SQLState, condition)
}

func (e *PostgresSQLError) Unwrap() []error {
	if e == nil {
		return nil
	}

	out := make([]error, 0, 2)
	if e.Sentinel != nil {
		out = append(out, e.Sentinel)
	}

	if e.Cause != nil {
		out = append(out, e.Cause)
	}

	return out
}
