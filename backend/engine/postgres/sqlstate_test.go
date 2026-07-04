package postgres

import (
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestClassifyQueryErrorPostgreSQLExactCodes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		code          string
		wantCondition string
		wantKind      engine.PostgresSQLKind
		wantErrIs     error
	}{
		{
			name:          "invalid text input",
			code:          pgerrcode.InvalidTextRepresentation,
			wantCondition: "invalid_text_representation",
			wantKind:      engine.PostgresSQLKindInvalidArgument,
			wantErrIs:     engine.ErrQueryInvalid,
		},
		{
			name:          "division by zero",
			code:          pgerrcode.DivisionByZero,
			wantCondition: "division_by_zero",
			wantKind:      engine.PostgresSQLKindInvalidArgument,
			wantErrIs:     engine.ErrQueryInvalid,
		},
		{
			name:          "feature not supported",
			code:          pgerrcode.FeatureNotSupported,
			wantCondition: "feature_not_supported",
			wantKind:      engine.PostgresSQLKindInvalidArgument,
			wantErrIs:     engine.ErrQueryInvalid,
		},
		{
			name:          "insufficient privilege",
			code:          pgerrcode.InsufficientPrivilege,
			wantCondition: "insufficient_privilege",
			wantKind:      engine.PostgresSQLKindPermissionDenied,
			wantErrIs:     engine.ErrQueryPermissionDenied,
		},
		{
			name:          "serialization failure",
			code:          pgerrcode.SerializationFailure,
			wantCondition: "serialization_failure",
			wantKind:      engine.PostgresSQLKindAborted,
			wantErrIs:     engine.ErrQueryRetryable,
		},
		{
			name:          "deadlock",
			code:          pgerrcode.DeadlockDetected,
			wantCondition: "deadlock_detected",
			wantKind:      engine.PostgresSQLKindAborted,
			wantErrIs:     engine.ErrQueryRetryable,
		},
		{
			name:          "lock not available",
			code:          pgerrcode.LockNotAvailable,
			wantCondition: "lock_not_available",
			wantKind:      engine.PostgresSQLKindUnavailable,
			wantErrIs:     engine.ErrQueryRetryable,
		},
		{
			name:          "query canceled",
			code:          pgerrcode.QueryCanceled,
			wantCondition: "query_canceled",
			wantKind:      engine.PostgresSQLKindTimeout,
			wantErrIs:     engine.ErrQueryTimeout,
		},
		{
			name:          "transaction timeout from PostgreSQL 17",
			code:          "25P04",
			wantCondition: "transaction_timeout",
			wantKind:      engine.PostgresSQLKindTimeout,
			wantErrIs:     engine.ErrQueryTimeout,
		},
		{
			name:          "read-only transaction",
			code:          pgerrcode.ReadOnlySQLTransaction,
			wantCondition: "read_only_sql_transaction",
			wantKind:      engine.PostgresSQLKindFailedPrecondition,
			wantErrIs:     engine.ErrQueryFailedPrecondition,
		},
		{
			name:          "invalid catalog maps to database not found",
			code:          pgerrcode.InvalidCatalogName,
			wantCondition: "invalid_catalog_name",
			wantKind:      engine.PostgresSQLKindNotFound,
			wantErrIs:     engine.ErrDatabaseNotFound,
		},
		{
			name:          "invalid schema maps to schema not found",
			code:          pgerrcode.InvalidSchemaName,
			wantCondition: "invalid_schema_name",
			wantKind:      engine.PostgresSQLKindNotFound,
			wantErrIs:     engine.ErrSchemaNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := classifyQueryError("execute query", &pgconn.PgError{
				Severity:       "ERROR",
				Code:           tt.code,
				Message:        "driver message may contain query data",
				SchemaName:     "public",
				TableName:      "orders",
				ColumnName:     "id",
				DataTypeName:   "int4",
				ConstraintName: "orders_pkey",
				Position:       7,
			})

			require.ErrorIs(t, err, tt.wantErrIs)

			var pgErr *engine.PostgresSQLError
			require.ErrorAs(t, err, &pgErr)
			assert.Equal(t, tt.code, pgErr.SQLState)
			assert.Equal(t, tt.code[:2], pgErr.SQLStateClass)
			assert.Equal(t, tt.wantCondition, pgErr.ConditionName)
			assert.Equal(t, "execute query", pgErr.Operation)
			assert.Equal(t, tt.wantKind, pgErr.Kind)
			assert.Equal(t, "ERROR", pgErr.SafeFields["severity"])
			assert.Equal(t, "public", pgErr.SafeFields["schema_name"])
			assert.Equal(t, "orders", pgErr.SafeFields["table_name"])
			assert.Equal(t, "id", pgErr.SafeFields["column_name"])
			assert.Equal(t, "int4", pgErr.SafeFields["data_type_name"])
			assert.Equal(t, "orders_pkey", pgErr.SafeFields["constraint_name"])
			assert.Equal(t, "7", pgErr.SafeFields["position"])
			assert.NotContains(t, pgErr.SafeFields, "message")
		})
	}
}

func TestClassifyQueryErrorPostgreSQLClassFallbacks(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		code          string
		wantCondition string
		wantKind      engine.PostgresSQLKind
		wantErrIs     error
	}{
		{
			name:          "unknown cardinality violation remains invalid argument",
			code:          "21ZZZ",
			wantCondition: "cardinality_violation",
			wantKind:      engine.PostgresSQLKindInvalidArgument,
			wantErrIs:     engine.ErrQueryInvalid,
		},
		{
			name:          "unknown data exception remains invalid argument",
			code:          "22ZZZ",
			wantCondition: "data_exception",
			wantKind:      engine.PostgresSQLKindInvalidArgument,
			wantErrIs:     engine.ErrQueryInvalid,
		},
		{
			name:          "unknown authorization issue remains unauthenticated",
			code:          "28ZZZ",
			wantCondition: "invalid_authorization_specification",
			wantKind:      engine.PostgresSQLKindUnauthenticated,
			wantErrIs:     engine.ErrQueryUnauthenticated,
		},
		{
			name:          "unknown transaction rollback remains retryable",
			code:          "40ZZZ",
			wantCondition: "transaction_rollback",
			wantKind:      engine.PostgresSQLKindAborted,
			wantErrIs:     engine.ErrQueryRetryable,
		},
		{
			name:          "unknown program limit remains resource exhausted",
			code:          "54ZZZ",
			wantCondition: "program_limit_exceeded",
			wantKind:      engine.PostgresSQLKindResourceExhausted,
			wantErrIs:     engine.ErrQueryResourceExhausted,
		},
		{
			name:          "unknown fdw error remains unavailable",
			code:          "HVZZZ",
			wantCondition: "foreign_data_wrapper_error",
			wantKind:      engine.PostgresSQLKindUnavailable,
			wantErrIs:     engine.ErrQueryUnavailable,
		},
		{
			name:          "unknown PL/pgSQL error remains failed precondition",
			code:          "P0ZZZ",
			wantCondition: "plpgsql_error",
			wantKind:      engine.PostgresSQLKindFailedPrecondition,
			wantErrIs:     engine.ErrQueryFailedPrecondition,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := classifyQueryError("read rows", &pgconn.PgError{Code: tt.code})
			require.ErrorIs(t, err, tt.wantErrIs)

			var pgErr *engine.PostgresSQLError
			require.ErrorAs(t, err, &pgErr)
			assert.Equal(t, tt.code, pgErr.SQLState)
			assert.Equal(t, tt.code[:2], pgErr.SQLStateClass)
			assert.Equal(t, tt.wantCondition, pgErr.ConditionName)
			assert.Equal(t, tt.wantKind, pgErr.Kind)
		})
	}
}

func TestClassifyQueryErrorUnknownSQLStateClassStaysInternal(t *testing.T) {
	t.Parallel()

	driverErr := &pgconn.PgError{Code: "ZZ999"}
	err := classifyQueryError("execute query", driverErr)

	require.NotErrorIs(t, err, engine.ErrQueryInvalid)
	require.NotErrorIs(t, err, engine.ErrQueryTimeout)

	var pgErr *engine.PostgresSQLError
	require.NotErrorAs(t, err, &pgErr)
	assert.ErrorIs(t, err, driverErr)
}

func TestPostgresConditionNameHandlesInitialisms(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "sql prefix", in: "SQLStatementNotYetComplete", want: "sql_statement_not_yet_complete"},
		{name: "io prefix", in: "IOError", want: "io_error"},
		{name: "json prefix", in: "JSONScalarRequired", want: "json_scalar_required"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, camelToSnake(tt.in))
		})
	}
}
