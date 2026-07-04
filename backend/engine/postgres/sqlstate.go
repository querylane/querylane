package postgres

import (
	"strconv"
	"unicode"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/engine"
)

const (
	postgresSQLStateTransactionTimeout    = "25P04" // PostgreSQL 17+
	postgresSQLStateInvalidArgumentXQuery = "10608" // PostgreSQL 18+
	postgresSQLStateFileNameTooLong       = "58P03" // PostgreSQL 18+
)

type postgresSQLStateClass struct {
	kind          engine.PostgresSQLKind
	sentinel      error
	conditionName string
}

var exactPostgresSQLStates = map[string]postgresSQLStateClass{
	pgerrcode.FeatureNotSupported:         {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "feature_not_supported"},
	postgresSQLStateInvalidArgumentXQuery: {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "invalid_argument_for_xquery"},
	pgerrcode.InvalidTextRepresentation:   {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "invalid_text_representation"},
	pgerrcode.DivisionByZero:              {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "division_by_zero"},
	pgerrcode.UniqueViolation:             {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "unique_violation"},
	pgerrcode.ForeignKeyViolation:         {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "foreign_key_violation"},
	pgerrcode.CheckViolation:              {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "check_violation"},
	pgerrcode.NotNullViolation:            {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "not_null_violation"},

	pgerrcode.ReadOnlySQLTransaction:   {kind: engine.PostgresSQLKindFailedPrecondition, sentinel: engine.ErrQueryFailedPrecondition, conditionName: "read_only_sql_transaction"},
	postgresSQLStateTransactionTimeout: {kind: engine.PostgresSQLKindTimeout, sentinel: engine.ErrQueryTimeout, conditionName: "transaction_timeout"},
	pgerrcode.InvalidPassword:          {kind: engine.PostgresSQLKindUnauthenticated, sentinel: engine.ErrQueryUnauthenticated, conditionName: "invalid_password"},
	pgerrcode.InvalidCatalogName:       {kind: engine.PostgresSQLKindNotFound, sentinel: engine.ErrDatabaseNotFound, conditionName: "invalid_catalog_name"},
	pgerrcode.InvalidSchemaName:        {kind: engine.PostgresSQLKindNotFound, sentinel: engine.ErrSchemaNotFound, conditionName: "invalid_schema_name"},
	pgerrcode.SerializationFailure:     {kind: engine.PostgresSQLKindAborted, sentinel: engine.ErrQueryRetryable, conditionName: "serialization_failure"},
	pgerrcode.DeadlockDetected:         {kind: engine.PostgresSQLKindAborted, sentinel: engine.ErrQueryRetryable, conditionName: "deadlock_detected"},
	pgerrcode.InsufficientPrivilege:    {kind: engine.PostgresSQLKindPermissionDenied, sentinel: engine.ErrQueryPermissionDenied, conditionName: "insufficient_privilege"},
	pgerrcode.SyntaxError:              {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "syntax_error"},
	pgerrcode.UndefinedTable:           {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "undefined_table"},
	pgerrcode.UndefinedColumn:          {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "undefined_column"},
	pgerrcode.UndefinedFunction:        {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "undefined_function"},
	pgerrcode.UndefinedParameter:       {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "undefined_parameter"},
	pgerrcode.DatatypeMismatch:         {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "datatype_mismatch"},
	pgerrcode.IndeterminateDatatype:    {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "indeterminate_datatype"},
	pgerrcode.AmbiguousColumn:          {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "ambiguous_column"},
	pgerrcode.DuplicateAlias:           {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "duplicate_alias"},
	pgerrcode.TooManyConnections:       {kind: engine.PostgresSQLKindResourceExhausted, sentinel: engine.ErrQueryResourceExhausted, conditionName: "too_many_connections"},
	pgerrcode.LockNotAvailable:         {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryRetryable, conditionName: "lock_not_available"},
	// 57014 also covers pg_cancel_backend and some driver cancellations. In
	// Querylane live SQL, the dominant server-side source is our statement_timeout;
	// client-side context.Canceled is classified earlier in classifyQueryError.
	pgerrcode.QueryCanceled:         {kind: engine.PostgresSQLKindTimeout, sentinel: engine.ErrQueryTimeout, conditionName: "query_canceled"},
	pgerrcode.CannotConnectNow:      {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "cannot_connect_now"},
	postgresSQLStateFileNameTooLong: {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "file_name_too_long"},
	pgerrcode.InternalError:         {kind: engine.PostgresSQLKindInternal, conditionName: "internal_error"},
}

// fallbackPostgresSQLStateClasses is the minimum safe class set for live SQL
// errors. Add classes when production evidence shows how clients should handle
// them; unknown classes stay internal rather than inventing retry or UX policy.
var fallbackPostgresSQLStateClasses = map[string]postgresSQLStateClass{
	"08": {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "connection_exception"},
	"0A": {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "feature_not_supported"},
	"21": {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "cardinality_violation"},
	"22": {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "data_exception"},
	"23": {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "integrity_constraint_violation"},
	"25": {kind: engine.PostgresSQLKindFailedPrecondition, sentinel: engine.ErrQueryFailedPrecondition, conditionName: "invalid_transaction_state"},
	"28": {kind: engine.PostgresSQLKindUnauthenticated, sentinel: engine.ErrQueryUnauthenticated, conditionName: "invalid_authorization_specification"},
	"40": {kind: engine.PostgresSQLKindAborted, sentinel: engine.ErrQueryRetryable, conditionName: "transaction_rollback"},
	"42": {kind: engine.PostgresSQLKindInvalidArgument, sentinel: engine.ErrQueryInvalid, conditionName: "syntax_error_or_access_rule_violation"},
	"53": {kind: engine.PostgresSQLKindResourceExhausted, sentinel: engine.ErrQueryResourceExhausted, conditionName: "insufficient_resources"},
	"54": {kind: engine.PostgresSQLKindResourceExhausted, sentinel: engine.ErrQueryResourceExhausted, conditionName: "program_limit_exceeded"},
	"55": {kind: engine.PostgresSQLKindFailedPrecondition, sentinel: engine.ErrQueryFailedPrecondition, conditionName: "object_not_in_prerequisite_state"},
	"57": {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "operator_intervention"},
	"58": {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "system_error"},
	"HV": {kind: engine.PostgresSQLKindUnavailable, sentinel: engine.ErrQueryUnavailable, conditionName: "foreign_data_wrapper_error"},
	"P0": {kind: engine.PostgresSQLKindFailedPrecondition, sentinel: engine.ErrQueryFailedPrecondition, conditionName: "plpgsql_error"},
	"XX": {kind: engine.PostgresSQLKindInternal, conditionName: "internal_error"},
}

func classifyPostgresError(op string, pgErr *pgconn.PgError) *engine.PostgresSQLError {
	if pgErr == nil || len(pgErr.Code) != 5 {
		return nil
	}

	classification, ok := exactPostgresSQLStates[pgErr.Code]
	if !ok {
		var fallbackOK bool

		classification, fallbackOK = fallbackPostgresSQLStateClasses[pgErr.Code[:2]]
		if !fallbackOK {
			return nil
		}

		if conditionName := postgresConditionName(pgErr.Code); conditionName != "" {
			classification.conditionName = conditionName
		}
	}

	return &engine.PostgresSQLError{
		Kind:          classification.kind,
		SQLState:      pgErr.Code,
		SQLStateClass: pgErr.Code[:2],
		ConditionName: classification.conditionName,
		Operation:     op,
		SafeFields:    safePostgresErrorFields(pgErr),
		Sentinel:      classification.sentinel,
		Cause:         pgErr,
	}
}

func safePostgresErrorFields(pgErr *pgconn.PgError) map[string]string {
	fields := make(map[string]string)
	addString := func(key, value string) {
		if value != "" {
			fields[key] = value
		}
	}
	addInt32 := func(key string, value int32) {
		if value > 0 {
			fields[key] = strconv.Itoa(int(value))
		}
	}

	severity := pgErr.SeverityUnlocalized
	if severity == "" {
		severity = pgErr.Severity
	}

	addString("severity", severity)
	addString("schema_name", pgErr.SchemaName)
	addString("table_name", pgErr.TableName)
	addString("column_name", pgErr.ColumnName)
	addString("data_type_name", pgErr.DataTypeName)
	addString("constraint_name", pgErr.ConstraintName)
	addInt32("position", pgErr.Position)

	if len(fields) == 0 {
		return nil
	}

	return fields
}

func postgresConditionName(code string) string {
	name := pgerrcode.Name(code)
	if name == "" {
		return ""
	}

	return camelToSnake(name)
}

func camelToSnake(s string) string {
	runes := []rune(s)
	out := make([]rune, 0, len(runes)+4)

	var prev rune

	for i, r := range runes {
		if unicode.IsUpper(r) {
			hasNextLower := i+1 < len(runes) && unicode.IsLower(runes[i+1])
			previousWordBoundary := unicode.IsLower(prev) || unicode.IsDigit(prev)

			acronymBoundary := unicode.IsUpper(prev) && hasNextLower
			if i > 0 && (previousWordBoundary || acronymBoundary) {
				out = append(out, '_')
			}

			out = append(out, unicode.ToLower(r))
		} else {
			out = append(out, r)
		}

		prev = r
	}

	return string(out)
}
