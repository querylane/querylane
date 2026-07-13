package postgreserrors_test

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/postgreserrors"
)

func TestClassifyDefaultExactPolicy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code      string
		condition string
		kind      postgreserrors.Kind
	}{
		{code: "22012", condition: "division_by_zero", kind: postgreserrors.KindInvalidArgument},
		{code: "22P02", condition: "invalid_text_representation", kind: postgreserrors.KindInvalidArgument},
		{code: "23502", condition: "not_null_violation", kind: postgreserrors.KindFailedPrecondition},
		{code: "23503", condition: "foreign_key_violation", kind: postgreserrors.KindFailedPrecondition},
		{code: "23505", condition: "unique_violation", kind: postgreserrors.KindAlreadyExists},
		{code: "23514", condition: "check_violation", kind: postgreserrors.KindFailedPrecondition},
		{code: "25P04", condition: "transaction_timeout", kind: postgreserrors.KindTimeout},
		{code: "28P01", condition: "invalid_password", kind: postgreserrors.KindUnauthenticated},
		{code: "3D000", condition: "invalid_catalog_name", kind: postgreserrors.KindNotFound},
		{code: "3F000", condition: "invalid_schema_name", kind: postgreserrors.KindNotFound},
		{code: "40001", condition: "serialization_failure", kind: postgreserrors.KindAborted},
		{code: "40P01", condition: "deadlock_detected", kind: postgreserrors.KindAborted},
		{code: "42501", condition: "insufficient_privilege", kind: postgreserrors.KindPermissionDenied},
		{code: "42601", condition: "syntax_error", kind: postgreserrors.KindInvalidArgument},
		{code: "42703", condition: "undefined_column", kind: postgreserrors.KindNotFound},
		{code: "42P01", condition: "undefined_table", kind: postgreserrors.KindNotFound},
		{code: "53300", condition: "too_many_connections", kind: postgreserrors.KindResourceExhausted},
		{code: "57014", condition: "query_canceled", kind: postgreserrors.KindTimeout},
		{code: "57P03", condition: "cannot_connect_now", kind: postgreserrors.KindUnavailable},
		{code: "58P03", condition: "file_name_too_long", kind: postgreserrors.KindInternal},
		{code: "XX000", condition: "internal_error", kind: postgreserrors.KindInternal},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			t.Parallel()

			classification := postgreserrors.Classify(
				&pgconn.PgError{Code: tt.code},
				postgreserrors.ProfileDefault,
			)

			assert.Equal(t, tt.kind, classification.Kind)
			assert.Equal(t, tt.code, classification.SQLState)
			assert.Equal(t, tt.code[:2], classification.Class)
			assert.Equal(t, tt.condition, classification.Condition)
		})
	}
}

func TestClassifyClassFallbackPolicies(t *testing.T) {
	t.Parallel()

	tests := []struct {
		class       string
		condition   string
		defaultKind postgreserrors.Kind
		consoleKind postgreserrors.Kind
	}{
		{class: "08", condition: "connection_exception", defaultKind: postgreserrors.KindUnavailable, consoleKind: postgreserrors.KindUnavailable},
		{class: "0A", condition: "feature_not_supported", defaultKind: postgreserrors.KindUnimplemented, consoleKind: postgreserrors.KindInvalidArgument},
		{class: "21", condition: "cardinality_violation", defaultKind: postgreserrors.KindInvalidArgument, consoleKind: postgreserrors.KindInvalidArgument},
		{class: "22", condition: "data_exception", defaultKind: postgreserrors.KindInvalidArgument, consoleKind: postgreserrors.KindInvalidArgument},
		{class: "23", condition: "integrity_constraint_violation", defaultKind: postgreserrors.KindFailedPrecondition, consoleKind: postgreserrors.KindInvalidArgument},
		{class: "25", condition: "invalid_transaction_state", defaultKind: postgreserrors.KindFailedPrecondition, consoleKind: postgreserrors.KindFailedPrecondition},
		{class: "28", condition: "invalid_authorization_specification", defaultKind: postgreserrors.KindUnauthenticated, consoleKind: postgreserrors.KindUnauthenticated},
		{class: "40", condition: "transaction_rollback", defaultKind: postgreserrors.KindAborted, consoleKind: postgreserrors.KindAborted},
		{class: "42", condition: "syntax_error_or_access_rule_violation", defaultKind: postgreserrors.KindInvalidArgument, consoleKind: postgreserrors.KindInvalidArgument},
		{class: "53", condition: "insufficient_resources", defaultKind: postgreserrors.KindResourceExhausted, consoleKind: postgreserrors.KindResourceExhausted},
		{class: "54", condition: "program_limit_exceeded", defaultKind: postgreserrors.KindResourceExhausted, consoleKind: postgreserrors.KindResourceExhausted},
		{class: "55", condition: "object_not_in_prerequisite_state", defaultKind: postgreserrors.KindFailedPrecondition, consoleKind: postgreserrors.KindFailedPrecondition},
		{class: "57", condition: "operator_intervention", defaultKind: postgreserrors.KindUnavailable, consoleKind: postgreserrors.KindUnavailable},
		{class: "58", condition: "system_error", defaultKind: postgreserrors.KindInternal, consoleKind: postgreserrors.KindUnavailable},
		{class: "HV", condition: "fdw_error", defaultKind: postgreserrors.KindUnavailable, consoleKind: postgreserrors.KindUnavailable},
		{class: "P0", condition: "plpgsql_error", defaultKind: postgreserrors.KindFailedPrecondition, consoleKind: postgreserrors.KindFailedPrecondition},
		{class: "XX", condition: "internal_error", defaultKind: postgreserrors.KindInternal, consoleKind: postgreserrors.KindInternal},
	}

	for _, tt := range tests {
		t.Run(tt.class, func(t *testing.T) {
			t.Parallel()

			for _, profile := range []struct {
				name  string
				value postgreserrors.Profile
				kind  postgreserrors.Kind
			}{
				{name: "default", value: postgreserrors.ProfileDefault, kind: tt.defaultKind},
				{name: "sql console", value: postgreserrors.ProfileSQLConsole, kind: tt.consoleKind},
			} {
				t.Run(profile.name, func(t *testing.T) {
					t.Parallel()

					code := tt.class + "ZZZ"
					classification := postgreserrors.Classify(&pgconn.PgError{Code: code}, profile.value)

					assert.Equal(t, profile.kind, classification.Kind)
					assert.Equal(t, code, classification.SQLState)
					assert.Equal(t, tt.class, classification.Class)
					assert.Equal(t, tt.condition, classification.Condition)
				})
			}
		})
	}
}

func TestClassifySQLConsoleExactPolicy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		code      string
		condition string
		kind      postgreserrors.Kind
	}{
		{code: "0A000", condition: "feature_not_supported", kind: postgreserrors.KindInvalidArgument},
		{code: "10608", condition: "invalid_argument_for_xquery", kind: postgreserrors.KindInvalidArgument},
		{code: "22012", condition: "division_by_zero", kind: postgreserrors.KindInvalidArgument},
		{code: "22P02", condition: "invalid_text_representation", kind: postgreserrors.KindInvalidArgument},
		{code: "23502", condition: "not_null_violation", kind: postgreserrors.KindInvalidArgument},
		{code: "23503", condition: "foreign_key_violation", kind: postgreserrors.KindInvalidArgument},
		{code: "23505", condition: "unique_violation", kind: postgreserrors.KindInvalidArgument},
		{code: "23514", condition: "check_violation", kind: postgreserrors.KindInvalidArgument},
		{code: "25006", condition: "read_only_sql_transaction", kind: postgreserrors.KindFailedPrecondition},
		{code: "25P04", condition: "transaction_timeout", kind: postgreserrors.KindTimeout},
		{code: "28P01", condition: "invalid_password", kind: postgreserrors.KindUnauthenticated},
		{code: "3D000", condition: "invalid_catalog_name", kind: postgreserrors.KindNotFound},
		{code: "3F000", condition: "invalid_schema_name", kind: postgreserrors.KindNotFound},
		{code: "40001", condition: "serialization_failure", kind: postgreserrors.KindAborted},
		{code: "40P01", condition: "deadlock_detected", kind: postgreserrors.KindAborted},
		{code: "42501", condition: "insufficient_privilege", kind: postgreserrors.KindPermissionDenied},
		{code: "42601", condition: "syntax_error", kind: postgreserrors.KindInvalidArgument},
		{code: "42702", condition: "ambiguous_column", kind: postgreserrors.KindInvalidArgument},
		{code: "42703", condition: "undefined_column", kind: postgreserrors.KindInvalidArgument},
		{code: "42712", condition: "duplicate_alias", kind: postgreserrors.KindInvalidArgument},
		{code: "42804", condition: "datatype_mismatch", kind: postgreserrors.KindInvalidArgument},
		{code: "42883", condition: "undefined_function", kind: postgreserrors.KindInvalidArgument},
		{code: "42P01", condition: "undefined_table", kind: postgreserrors.KindInvalidArgument},
		{code: "42P02", condition: "undefined_parameter", kind: postgreserrors.KindInvalidArgument},
		{code: "42P18", condition: "indeterminate_datatype", kind: postgreserrors.KindInvalidArgument},
		{code: "53300", condition: "too_many_connections", kind: postgreserrors.KindResourceExhausted},
		{code: "55P03", condition: "lock_not_available", kind: postgreserrors.KindUnavailable},
		{code: "57014", condition: "query_canceled", kind: postgreserrors.KindTimeout},
		{code: "57P03", condition: "cannot_connect_now", kind: postgreserrors.KindUnavailable},
		{code: "58P03", condition: "file_name_too_long", kind: postgreserrors.KindUnavailable},
		{code: "XX000", condition: "internal_error", kind: postgreserrors.KindInternal},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			t.Parallel()

			classification := postgreserrors.Classify(
				&pgconn.PgError{Code: tt.code},
				postgreserrors.ProfileSQLConsole,
			)

			assert.Equal(t, tt.kind, classification.Kind)
			assert.Equal(t, tt.code, classification.SQLState)
			assert.Equal(t, tt.code[:2], classification.Class)
			assert.Equal(t, tt.condition, classification.Condition)
		})
	}
}

func TestClassifyNormalizesValidSQLState(t *testing.T) {
	t.Parallel()

	classification := postgreserrors.Classify(
		&pgconn.PgError{Code: " 23p01\n"},
		postgreserrors.ProfileDefault,
	)

	assert.Equal(t, postgreserrors.ProfileDefault, classification.Profile)
	assert.Equal(t, postgreserrors.KindFailedPrecondition, classification.Kind)
	assert.Equal(t, "23P01", classification.SQLState)
	assert.Equal(t, "23", classification.Class)
	assert.Equal(t, "exclusion_violation", classification.Condition)
}

func TestClassifyPreservesCanonicalCompatibilityConditionNames(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"01004": "string_data_right_truncation",
		"2203F": "sql_json_scalar_required",
		"2F002": "modifying_sql_data_not_permitted",
		"39001": "invalid_sqlstate_returned",
		"P0000": "plpgsql_error",
	}

	for code, condition := range tests {
		t.Run(code, func(t *testing.T) {
			t.Parallel()

			classification := postgreserrors.Classify(
				&pgconn.PgError{Code: code},
				postgreserrors.ProfileDefault,
			)

			assert.Equal(t, condition, classification.Condition)
		})
	}
}

func TestClassifyRejectsMalformedSQLState(t *testing.T) {
	t.Parallel()

	for _, code := range []string{"", "1234", "123456", "12-34", "12_34", "é1234"} {
		t.Run(code, func(t *testing.T) {
			t.Parallel()

			classification := postgreserrors.Classify(
				&pgconn.PgError{Code: code},
				postgreserrors.ProfileSQLConsole,
			)

			assert.Equal(t, postgreserrors.ProfileSQLConsole, classification.Profile)
			assert.Equal(t, postgreserrors.KindInternal, classification.Kind)
			assert.Empty(t, classification.SQLState)
			assert.Empty(t, classification.Class)
			assert.Empty(t, classification.Condition)
		})
	}
}

func TestClassifyPreservesUnknownValidSQLState(t *testing.T) {
	t.Parallel()

	classification := postgreserrors.Classify(
		&pgconn.PgError{Code: "zz999"},
		postgreserrors.ProfileDefault,
	)

	assert.Equal(t, postgreserrors.KindInternal, classification.Kind)
	assert.Equal(t, "ZZ999", classification.SQLState)
	assert.Equal(t, "ZZ", classification.Class)
	assert.Empty(t, classification.Condition)
}

func TestClassifyNilPostgresError(t *testing.T) {
	t.Parallel()

	classification := postgreserrors.Classify(nil, postgreserrors.ProfileDefault)

	assert.Equal(t, postgreserrors.ProfileDefault, classification.Profile)
	assert.Equal(t, postgreserrors.KindInternal, classification.Kind)
	assert.Empty(t, classification.SQLState)
	assert.Empty(t, classification.Class)
	assert.Empty(t, classification.Condition)
}

func TestClassifyExtractsBoundedClientFields(t *testing.T) {
	t.Parallel()

	classification := postgreserrors.Classify(&pgconn.PgError{
		Severity:            "localized error",
		SeverityUnlocalized: "ERROR",
		Code:                pgerrcode.UniqueViolation,
		Message:             "duplicate key value",
		Detail:              "Key (email)=(user@example.com) already exists.",
		Hint:                "Choose another email address.",
		Position:            42,
		InternalPosition:    99,
		InternalQuery:       "SELECT secret FROM internal_table",
		Where:               "PL/pgSQL function private_fn line 1",
		SchemaName:          "public",
		TableName:           "users",
		ColumnName:          "email",
		DataTypeName:        "text",
		ConstraintName:      "users_email_key",
		File:                "nbtinsert.c",
		Line:                666,
		Routine:             "_bt_check_unique",
	}, postgreserrors.ProfileDefault)

	assert.Equal(t, postgreserrors.ClientFields{
		Severity:       "ERROR",
		Message:        "duplicate key value",
		Detail:         "Key (email)=(user@example.com) already exists.",
		Hint:           "Choose another email address.",
		Position:       42,
		SchemaName:     "public",
		TableName:      "users",
		ColumnName:     "email",
		DataTypeName:   "text",
		ConstraintName: "users_email_key",
	}, classification.ClientFields)
}

func TestClassifyBoundsUntrustedClientFields(t *testing.T) {
	t.Parallel()

	validText := strings.Repeat("x", 8*1024)
	truncatedPrefix := strings.Repeat("x", 8*1024-1)
	truncatedText := truncatedPrefix + "ésuffix"
	validIdentifier := strings.Repeat("i", 256)
	invalidUTF8 := string([]byte{'o', 'k', 0xff})

	classification := postgreserrors.Classify(&pgconn.PgError{
		Code:           pgerrcode.SyntaxError,
		Message:        validText,
		Detail:         truncatedText,
		Hint:           invalidUTF8,
		SchemaName:     validIdentifier,
		TableName:      validIdentifier + "x",
		ColumnName:     invalidUTF8,
		DataTypeName:   "text",
		ConstraintName: "constraint",
	}, postgreserrors.ProfileDefault)

	assert.Equal(t, validText, classification.ClientFields.Message)
	assert.Equal(t, truncatedPrefix, classification.ClientFields.Detail)
	assert.True(t, utf8.ValidString(classification.ClientFields.Detail))
	assert.Empty(t, classification.ClientFields.Hint)
	assert.Equal(t, validIdentifier, classification.ClientFields.SchemaName)
	assert.Empty(t, classification.ClientFields.TableName)
	assert.Empty(t, classification.ClientFields.ColumnName)
	assert.Equal(t, "text", classification.ClientFields.DataTypeName)
	assert.Equal(t, "constraint", classification.ClientFields.ConstraintName)
}

func TestErrorWrapsPostgresCauseWithoutRawText(t *testing.T) {
	t.Parallel()

	pgErr := &pgconn.PgError{
		Code:    pgerrcode.UniqueViolation,
		Message: "duplicate secret@example.com",
	}
	wrapped := postgreserrors.Wrap(pgErr, postgreserrors.ProfileSQLConsole, "execute query")

	assert.NotContains(t, wrapped.Error(), "secret@example.com")
	assert.Contains(t, wrapped.Error(), pgerrcode.UniqueViolation)
	assert.Contains(t, wrapped.Error(), "execute query")
	assert.Equal(t, postgreserrors.ProfileSQLConsole, wrapped.Classification().Profile)
	assert.Equal(t, postgreserrors.KindInvalidArgument, wrapped.Classification().Kind)
	assert.Equal(t, "execute query", wrapped.Operation())

	var gotPgErr *pgconn.PgError
	require.ErrorAs(t, wrapped, &gotPgErr)
	assert.Same(t, pgErr, gotPgErr)
}

func TestWrapNilPostgresError(t *testing.T) {
	t.Parallel()

	assert.Nil(t, postgreserrors.Wrap(nil, postgreserrors.ProfileDefault, "read rows"))
}

func TestErrorUsesNeutralTextForMalformedSQLState(t *testing.T) {
	t.Parallel()

	wrapped := postgreserrors.Wrap(
		&pgconn.PgError{Code: "bad", Message: "api_key=secret"},
		postgreserrors.ProfileDefault,
		"read rows",
	)

	assert.Equal(t, "read rows: postgres error", wrapped.Error())
}

func TestErrorPredicatesInspectWrappedClassification(t *testing.T) {
	t.Parallel()

	err := fmt.Errorf("collect metrics: %w", postgreserrors.Wrap(
		&pgconn.PgError{Code: pgerrcode.UndefinedTable},
		postgreserrors.ProfileSQLConsole,
		"query cache counters",
	))

	assert.True(t, postgreserrors.IsKind(err, postgreserrors.KindInvalidArgument))
	assert.False(t, postgreserrors.IsKind(err, postgreserrors.KindNotFound))
	assert.True(t, postgreserrors.IsCondition(err, "undefined_table", "undefined_function"))
	assert.False(t, postgreserrors.IsCondition(err, "undefined_column"))
	assert.False(t, postgreserrors.IsKind(errors.New("driver error"), postgreserrors.KindInternal))
	assert.False(t, postgreserrors.IsCondition(
		postgreserrors.Wrap(&pgconn.PgError{Code: "bad"}, postgreserrors.ProfileDefault, "query"),
		"",
	))
}
