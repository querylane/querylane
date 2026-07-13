// Package postgreserrors classifies errors returned by PostgreSQL servers.
package postgreserrors

import (
	"errors"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
)

// Profile selects context-specific SQLSTATE semantics.
type Profile string

const (
	// ProfileDefault applies resource-oriented API semantics.
	ProfileDefault Profile = "default"
	// ProfileSQLConsole applies statement-oriented SQL console semantics.
	ProfileSQLConsole Profile = "sql_console"
)

// Kind describes the transport-neutral outcome of a PostgreSQL error.
type Kind string

const (
	KindInvalidArgument    Kind = "invalid_argument"
	KindFailedPrecondition Kind = "failed_precondition"
	KindNotFound           Kind = "not_found"
	KindAlreadyExists      Kind = "already_exists"
	KindPermissionDenied   Kind = "permission_denied"
	KindUnauthenticated    Kind = "unauthenticated"
	KindAborted            Kind = "aborted"
	KindTimeout            Kind = "timeout"
	KindUnavailable        Kind = "unavailable"
	KindResourceExhausted  Kind = "resource_exhausted"
	KindUnimplemented      Kind = "unimplemented"
	KindInternal           Kind = "internal"
)

// Classification contains normalized SQLSTATE taxonomy.
type Classification struct {
	Profile      Profile
	SQLState     string
	Class        string
	Condition    string
	Kind         Kind
	ClientFields ClientFields
}

// ClientFields contains the bounded PostgreSQL fields approved for user-facing
// instance errors. These values are untrusted text and are not telemetry-safe.
type ClientFields struct {
	Severity       string
	Message        string
	Detail         string
	Hint           string
	Position       int32
	SchemaName     string
	TableName      string
	ColumnName     string
	DataTypeName   string
	ConstraintName string
}

// Classify classifies a PostgreSQL server error using profile.
func Classify(pgErr *pgconn.PgError, profile Profile) Classification {
	code := ""
	if pgErr != nil {
		code = strings.ToUpper(strings.TrimSpace(pgErr.Code))
	}

	classification := Classification{
		Profile:      profile,
		Kind:         KindInternal,
		ClientFields: extractClientFields(pgErr),
	}
	if !validSQLState(code) {
		return classification
	}

	classification.SQLState = code
	classification.Class = code[:2]
	classification.Condition = conditionName(code)

	exactPolicy := defaultExactPolicies[code]
	classPolicy := defaultClassPolicies[classification.Class]

	if profile == ProfileSQLConsole {
		if policy, ok := sqlConsoleExactPolicies[code]; ok {
			exactPolicy = policy
		}

		if policy, ok := sqlConsoleClassPolicies[classification.Class]; ok {
			classPolicy = policy
		}
	}

	if exactPolicy.kind != "" {
		classification.Kind = exactPolicy.kind
		return classification
	}

	if classPolicy.kind != "" {
		classification.Kind = classPolicy.kind
		if classification.Condition == "" {
			classification.Condition = classPolicy.condition
		}
	}

	return classification
}

const (
	maxClientTextBytes       = 8 * 1024
	maxClientIdentifierBytes = 256
)

func extractClientFields(pgErr *pgconn.PgError) ClientFields {
	if pgErr == nil {
		return ClientFields{}
	}

	severity := pgErr.SeverityUnlocalized
	if severity == "" {
		severity = pgErr.Severity
	}

	return ClientFields{
		Severity:       boundedIdentifier(severity),
		Message:        boundedText(pgErr.Message),
		Detail:         boundedText(pgErr.Detail),
		Hint:           boundedText(pgErr.Hint),
		Position:       max(pgErr.Position, 0),
		SchemaName:     boundedIdentifier(pgErr.SchemaName),
		TableName:      boundedIdentifier(pgErr.TableName),
		ColumnName:     boundedIdentifier(pgErr.ColumnName),
		DataTypeName:   boundedIdentifier(pgErr.DataTypeName),
		ConstraintName: boundedIdentifier(pgErr.ConstraintName),
	}
}

func boundedText(value string) string {
	if !utf8.ValidString(value) {
		return ""
	}

	if len(value) <= maxClientTextBytes {
		return value
	}

	end := maxClientTextBytes
	for !utf8.ValidString(value[:end]) {
		end--
	}

	return value[:end]
}

func boundedIdentifier(value string) string {
	if len(value) > maxClientIdentifierBytes || !utf8.ValidString(value) {
		return ""
	}

	return value
}

// Error carries a classified PostgreSQL cause without exposing raw server text
// through Error(). Client adapters must opt into ClientFields explicitly.
type Error struct {
	classification Classification
	operation      string
	cause          *pgconn.PgError
}

// Wrap classifies pgErr and preserves it for errors.As.
func Wrap(pgErr *pgconn.PgError, profile Profile, operation string) *Error {
	if pgErr == nil {
		return nil
	}

	return &Error{
		classification: Classify(pgErr, profile),
		operation:      operation,
		cause:          pgErr,
	}
}

func (e *Error) Error() string {
	if e == nil {
		return "postgres error: <nil>"
	}

	message := "postgres error"
	if e.classification.SQLState != "" {
		message = "postgres SQLSTATE " + e.classification.SQLState
		if e.classification.Condition != "" {
			message += " " + e.classification.Condition
		}
	}

	if e.operation != "" {
		return e.operation + ": " + message
	}

	return message
}

// Unwrap preserves the original PostgreSQL server error for errors.As.
func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}

	return e.cause
}

// Classification returns the normalized PostgreSQL taxonomy.
func (e *Error) Classification() Classification {
	if e == nil {
		return Classification{Kind: KindInternal}
	}

	return e.classification
}

// Operation returns the internal engine operation label.
func (e *Error) Operation() string {
	if e == nil {
		return ""
	}

	return e.operation
}

// IsKind reports whether err contains a classified PostgreSQL error with kind.
func IsKind(err error, kind Kind) bool {
	var classified *Error
	return errors.As(err, &classified) && classified.Classification().Kind == kind
}

// IsCondition reports whether err contains any named PostgreSQL condition.
func IsCondition(err error, conditions ...string) bool {
	var classified *Error
	if !errors.As(err, &classified) {
		return false
	}

	condition := classified.Classification().Condition
	if condition == "" {
		return false
	}

	return slices.Contains(conditions, condition)
}

func validSQLState(code string) bool {
	if len(code) != 5 {
		return false
	}

	for i := range len(code) {
		if code[i] < '0' || code[i] > '9' {
			if code[i] < 'A' || code[i] > 'Z' {
				return false
			}
		}
	}

	return true
}

type policy struct {
	kind      Kind
	condition string
}

var defaultExactPolicies = map[string]policy{
	pgerrcode.UniqueViolation:       {kind: KindAlreadyExists},
	"25P04":                         {kind: KindTimeout},
	pgerrcode.InvalidCatalogName:    {kind: KindNotFound},
	pgerrcode.InvalidSchemaName:     {kind: KindNotFound},
	pgerrcode.InsufficientPrivilege: {kind: KindPermissionDenied},
	pgerrcode.UndefinedColumn:       {kind: KindNotFound},
	pgerrcode.UndefinedTable:        {kind: KindNotFound},
	pgerrcode.QueryCanceled:         {kind: KindTimeout},
}

var defaultClassPolicies = map[string]policy{
	"08": {kind: KindUnavailable, condition: "connection_exception"},
	"0A": {kind: KindUnimplemented, condition: "feature_not_supported"},
	"21": {kind: KindInvalidArgument, condition: "cardinality_violation"},
	"22": {kind: KindInvalidArgument, condition: "data_exception"},
	"23": {kind: KindFailedPrecondition, condition: "integrity_constraint_violation"},
	"25": {kind: KindFailedPrecondition, condition: "invalid_transaction_state"},
	"28": {kind: KindUnauthenticated, condition: "invalid_authorization_specification"},
	"40": {kind: KindAborted, condition: "transaction_rollback"},
	"42": {kind: KindInvalidArgument, condition: "syntax_error_or_access_rule_violation"},
	"53": {kind: KindResourceExhausted, condition: "insufficient_resources"},
	"54": {kind: KindResourceExhausted, condition: "program_limit_exceeded"},
	"55": {kind: KindFailedPrecondition, condition: "object_not_in_prerequisite_state"},
	"57": {kind: KindUnavailable, condition: "operator_intervention"},
	"58": {kind: KindInternal, condition: "system_error"},
	"HV": {kind: KindUnavailable, condition: "fdw_error"},
	"P0": {kind: KindFailedPrecondition, condition: "plpgsql_error"},
	"XX": {kind: KindInternal, condition: "internal_error"},
}

var sqlConsoleExactPolicies = map[string]policy{
	"10608":                    {kind: KindInvalidArgument},
	pgerrcode.UniqueViolation:  {kind: KindInvalidArgument},
	pgerrcode.UndefinedColumn:  {kind: KindInvalidArgument},
	pgerrcode.UndefinedTable:   {kind: KindInvalidArgument},
	pgerrcode.LockNotAvailable: {kind: KindUnavailable},
}

var sqlConsoleClassPolicies = map[string]policy{
	"0A": {kind: KindInvalidArgument, condition: "feature_not_supported"},
	"23": {kind: KindInvalidArgument, condition: "integrity_constraint_violation"},
	"58": {kind: KindUnavailable, condition: "system_error"},
}

func conditionName(code string) string {
	if override, ok := conditionNameOverrides[code]; ok {
		return override
	}

	return camelToSnake(pgerrcode.Name(code))
}

var conditionNameOverrides = map[string]string{
	"01004": "string_data_right_truncation",
	"08001": "sqlclient_unable_to_establish_sqlconnection",
	"08004": "sqlserver_rejected_establishment_of_sqlconnection",
	"10608": "invalid_argument_for_xquery",
	"22001": "string_data_right_truncation",
	"22004": "null_value_not_allowed",
	"22031": "invalid_argument_for_sql_json_datetime_function",
	"22033": "invalid_sql_json_subscript",
	"22034": "more_than_one_sql_json_item",
	"22035": "no_sql_json_item",
	"22036": "non_numeric_sql_json_item",
	"22037": "non_unique_keys_in_a_json_object",
	"22038": "singleton_sql_json_item_required",
	"22039": "sql_json_array_not_found",
	"2203A": "sql_json_member_not_found",
	"2203B": "sql_json_number_not_found",
	"2203C": "sql_json_object_not_found",
	"2203F": "sql_json_scalar_required",
	"2203G": "sql_json_item_cannot_be_cast_to_target_type",
	"25P04": "transaction_timeout",
	"2F002": "modifying_sql_data_not_permitted",
	"2F003": "prohibited_sql_statement_attempted",
	"2F004": "reading_sql_data_not_permitted",
	"38002": "modifying_sql_data_not_permitted",
	"38003": "prohibited_sql_statement_attempted",
	"38004": "reading_sql_data_not_permitted",
	"39001": "invalid_sqlstate_returned",
	"39004": "null_value_not_allowed",
	"58P03": "file_name_too_long",
	"P0000": "plpgsql_error",
}

func camelToSnake(value string) string {
	runes := []rune(value)
	out := make([]rune, 0, len(runes)+4)

	var previous rune

	for i, current := range runes {
		if unicode.IsUpper(current) {
			nextIsLower := i+1 < len(runes) && unicode.IsLower(runes[i+1])
			previousWordBoundary := unicode.IsLower(previous) || unicode.IsDigit(previous)

			acronymBoundary := unicode.IsUpper(previous) && nextIsLower
			if i > 0 && (previousWordBoundary || acronymBoundary) {
				out = append(out, '_')
			}

			out = append(out, unicode.ToLower(current))
		} else {
			out = append(out, current)
		}

		previous = current
	}

	return string(out)
}
