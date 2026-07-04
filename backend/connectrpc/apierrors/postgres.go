package apierrors

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/protobuf/proto"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// PostgresOperationLabel is a stable backend operation label attached to
// PostgreSQL error metadata. Use constants or hard-coded service operation
// names such as "execute_query" or "list_tables"; never pass user input.
type PostgresOperationLabel string

// PostgresErrorClassification is Querylane's central policy for converting a
// PostgreSQL SQLSTATE into a Connect status, ErrorInfo reason, and condition
// metadata. It records whether the SQLSTATE matched a documented exact code or
// fell back to a known SQLSTATE class.
type PostgresErrorClassification struct {
	SQLState      string
	SQLStateClass string
	ConditionName string
	Operation     PostgresOperationLabel
	ConnectCode   connect.Code
	ErrorReason   consolev1alpha1.ErrorReason
	Exact         bool
	ClassFallback bool
}

type postgresSQLStatePolicy struct {
	conditionName string
	connectCode   connect.Code
	errorReason   consolev1alpha1.ErrorReason
}

// ClassifyPostgresError classifies a pgconn.PgError by exact PostgreSQL 16-19
// SQLSTATE when documented, then by SQLSTATE class for future or unknown codes.
func ClassifyPostgresError(pgErr *pgconn.PgError, operation PostgresOperationLabel) PostgresErrorClassification {
	sqlstate := ""
	if pgErr != nil {
		sqlstate = strings.ToUpper(strings.TrimSpace(pgErr.Code))
	}

	sqlstateClass := postgresSQLStateClass(sqlstate)
	classification := PostgresErrorClassification{
		SQLState:      sqlstate,
		SQLStateClass: sqlstateClass,
		Operation:     operation,
		ConnectCode:   connect.CodeInternal,
		ErrorReason:   consolev1alpha1.ErrorReason_INTERNAL_ERROR,
	}

	if conditionName, ok := postgresConditionNames[sqlstate]; ok {
		classification.ConditionName = conditionName
		classification.Exact = true
	}

	if policy, ok := postgresExactPolicies[sqlstate]; ok {
		classification.ConnectCode = policy.connectCode
		classification.ErrorReason = policy.errorReason

		return classification
	}

	if policy, ok := postgresClassPolicies[sqlstateClass]; ok {
		classification.ConnectCode = policy.connectCode
		classification.ErrorReason = policy.errorReason

		if classification.ConditionName == "" {
			classification.ConditionName = policy.conditionName
			classification.ClassFallback = true
		}

		return classification
	}

	return classification
}

// NewPostgresError builds a safe Connect error from a PostgreSQL server error.
// Raw PgError message/detail/hint/internal fields are deliberately omitted from
// the client-facing message, ErrorInfo metadata, and typed detail. The returned
// error still unwraps to the original PgError for observability via errors.As.
func NewPostgresError(pgErr *pgconn.PgError, operation PostgresOperationLabel) *connect.Error {
	return newPostgresError(pgErr, operation, "")
}

// NewPostgresErrorWithMessage builds a safe Connect error from a PostgreSQL
// server error with caller-provided user-facing copy. The SQLSTATE
// classification, ErrorInfo metadata, typed PostgreSQL detail, and original
// PgError wrapping are identical to NewPostgresError. The message must be safe:
// do not pass raw PgError message/detail/hint text.
func NewPostgresErrorWithMessage(pgErr *pgconn.PgError, operation PostgresOperationLabel, message string, otherDetails ...proto.Message) *connect.Error {
	return newPostgresError(pgErr, operation, message, otherDetails...)
}

func newPostgresError(pgErr *pgconn.PgError, operation PostgresOperationLabel, message string, otherDetails ...proto.Message) *connect.Error {
	classification := ClassifyPostgresError(pgErr, operation)
	return newPostgresErrorFromClassification(pgErr, classification, message, nil, otherDetails...)
}

func newPostgresErrorFromClassification(
	pgErr *pgconn.PgError,
	classification PostgresErrorClassification,
	message string,
	extraMetadata []KeyVal,
	otherDetails ...proto.Message,
) *connect.Error {
	if message == "" {
		message = postgresSafeErrorMessage(classification)
	}

	serverFields := postgresSafeServerFields(pgErr)
	metadata := postgresErrorInfoMetadata(classification, serverFields)
	metadata = append(metadata, extraMetadata...)
	detail := postgresErrorDetail(classification, serverFields)

	details := append([]proto.Message{detail}, otherDetails...)

	return NewConnectError(
		classification.ConnectCode,
		postgresSafeWireError{message: message, cause: pgErr},
		NewErrorInfo(DomainConsole, classification.ErrorReason, metadata...),
		details...,
	)
}

func postgresErrorDetail(
	classification PostgresErrorClassification,
	serverFields map[string]string,
) *consolev1alpha1.PostgreSqlErrorDetail {
	return &consolev1alpha1.PostgreSqlErrorDetail{
		Sqlstate:      classification.SQLState,
		SqlstateClass: classification.SQLStateClass,
		ConditionName: classification.ConditionName,
		Operation:     string(classification.Operation),
		ServerFields:  serverFields,
	}
}

type postgresSafeWireError struct {
	message string
	cause   error
}

func (e postgresSafeWireError) Error() string {
	return e.message
}

func (e postgresSafeWireError) Unwrap() error {
	return e.cause
}

func postgresSQLStateClass(sqlstate string) string {
	if len(sqlstate) < 2 {
		return ""
	}

	return sqlstate[:2]
}

func postgresSafeErrorMessage(classification PostgresErrorClassification) string {
	condition := "postgresql_error"
	if classification.ConditionName != "" {
		condition = classification.ConditionName
	}

	if classification.Operation == "" {
		return "PostgreSQL " + condition
	}

	return fmt.Sprintf("PostgreSQL %s during %s", condition, classification.Operation)
}

// postgresErrorInfoMetadata builds PostgreSQL ErrorInfo metadata. These keys
// are intentionally snake_case across raw PgError and engine-classified paths.
func postgresErrorInfoMetadata(classification PostgresErrorClassification, serverFields map[string]string) []KeyVal {
	const baseMetadataFields = 4

	metadata := make([]KeyVal, 0, baseMetadataFields+len(serverFields))
	metadata = appendIfValue(metadata, "sqlstate", classification.SQLState)
	metadata = appendIfValue(metadata, "sqlstate_class", classification.SQLStateClass)
	metadata = appendIfValue(metadata, "condition_name", classification.ConditionName)
	metadata = appendIfValue(metadata, "operation", string(classification.Operation))

	serverFieldKeys := make([]string, 0, len(serverFields))
	for key := range serverFields {
		serverFieldKeys = append(serverFieldKeys, key)
	}

	slices.Sort(serverFieldKeys)

	for _, key := range serverFieldKeys {
		metadata = appendIfValue(metadata, key, serverFields[key])
	}

	return metadata
}

func appendIfValue(metadata []KeyVal, key string, value string) []KeyVal {
	if value == "" {
		return metadata
	}

	return append(metadata, KeyVal{Key: key, Value: value})
}

func postgresSafeServerFields(pgErr *pgconn.PgError) map[string]string {
	fields := map[string]string{}
	if pgErr == nil {
		return fields
	}

	addSafeServerField(fields, "severity", postgresSeverity(pgErr))
	addSafeServerField(fields, "schema_name", pgErr.SchemaName)
	addSafeServerField(fields, "table_name", pgErr.TableName)
	addSafeServerField(fields, "column_name", pgErr.ColumnName)
	addSafeServerField(fields, "data_type_name", pgErr.DataTypeName)
	addSafeServerField(fields, "constraint_name", pgErr.ConstraintName)

	if pgErr.Position > 0 {
		addSafeServerField(fields, "position", strconv.Itoa(int(pgErr.Position)))
	}

	return fields
}

func postgresSeverity(pgErr *pgconn.PgError) string {
	if pgErr.SeverityUnlocalized != "" {
		return pgErr.SeverityUnlocalized
	}

	return pgErr.Severity
}

func addSafeServerField(fields map[string]string, key string, value string) {
	if value != "" {
		fields[key] = value
	}
}

var postgresExactPolicies = map[string]postgresSQLStatePolicy{
	"22012": {connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"22P02": {connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"23502": {connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"23503": {connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"23505": {connectCode: connect.CodeAlreadyExists, errorReason: consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS},
	"23514": {connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"25P04": {connectCode: connect.CodeDeadlineExceeded, errorReason: consolev1alpha1.ErrorReason_TIMEOUT},
	"28P01": {connectCode: connect.CodeUnauthenticated, errorReason: consolev1alpha1.ErrorReason_UNAUTHENTICATED},
	"3D000": {connectCode: connect.CodeNotFound, errorReason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
	"3F000": {connectCode: connect.CodeNotFound, errorReason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
	"40001": {connectCode: connect.CodeAborted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"40P01": {connectCode: connect.CodeAborted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"42501": {connectCode: connect.CodePermissionDenied, errorReason: consolev1alpha1.ErrorReason_PERMISSION_DENIED},
	"42601": {connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"42703": {connectCode: connect.CodeNotFound, errorReason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
	"42P01": {connectCode: connect.CodeNotFound, errorReason: consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND},
	"53300": {connectCode: connect.CodeResourceExhausted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"57014": {connectCode: connect.CodeDeadlineExceeded, errorReason: consolev1alpha1.ErrorReason_TIMEOUT},
	"57P03": {connectCode: connect.CodeUnavailable, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"58P03": {connectCode: connect.CodeInternal, errorReason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
	"XX000": {connectCode: connect.CodeInternal, errorReason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
}

var postgresClassPolicies = map[string]postgresSQLStatePolicy{
	"08": {conditionName: "connection_exception", connectCode: connect.CodeUnavailable, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"0A": {conditionName: "feature_not_supported", connectCode: connect.CodeUnimplemented, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"21": {conditionName: "cardinality_violation", connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"22": {conditionName: "data_exception", connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"23": {conditionName: "integrity_constraint_violation", connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"25": {conditionName: "invalid_transaction_state", connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"28": {conditionName: "invalid_authorization_specification", connectCode: connect.CodeUnauthenticated, errorReason: consolev1alpha1.ErrorReason_UNAUTHENTICATED},
	"40": {conditionName: "transaction_rollback", connectCode: connect.CodeAborted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"42": {conditionName: "syntax_error_or_access_rule_violation", connectCode: connect.CodeInvalidArgument, errorReason: consolev1alpha1.ErrorReason_INVALID_ARGUMENT},
	"53": {conditionName: "insufficient_resources", connectCode: connect.CodeResourceExhausted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"54": {conditionName: "program_limit_exceeded", connectCode: connect.CodeResourceExhausted, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"55": {conditionName: "object_not_in_prerequisite_state", connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"57": {conditionName: "operator_intervention", connectCode: connect.CodeUnavailable, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"58": {conditionName: "system_error", connectCode: connect.CodeInternal, errorReason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
	"HV": {conditionName: "fdw_error", connectCode: connect.CodeUnavailable, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"P0": {conditionName: "plpgsql_error", connectCode: connect.CodeFailedPrecondition, errorReason: consolev1alpha1.ErrorReason_FAILED_PRECONDITION},
	"XX": {conditionName: "internal_error", connectCode: connect.CodeInternal, errorReason: consolev1alpha1.ErrorReason_INTERNAL_ERROR},
}

// postgresConditionNames is the union of documented PostgreSQL 16, 17, 18, and
// 19 SQLSTATE condition names from the official errcodes appendices:
// https://www.postgresql.org/docs/16/errcodes-appendix.html
// https://www.postgresql.org/docs/17/errcodes-appendix.html
// https://www.postgresql.org/docs/18/errcodes-appendix.html
// https://www.postgresql.org/docs/19/errcodes-appendix.html
var postgresConditionNames = map[string]string{
	"00000": "successful_completion",
	"01000": "warning",
	"01003": "null_value_eliminated_in_set_function",
	"01004": "string_data_right_truncation",
	"01006": "privilege_not_revoked",
	"01007": "privilege_not_granted",
	"01008": "implicit_zero_bit_padding",
	"0100C": "dynamic_result_sets_returned",
	"01P01": "deprecated_feature",
	"02000": "no_data",
	"02001": "no_additional_dynamic_result_sets_returned",
	"03000": "sql_statement_not_yet_complete",
	"08000": "connection_exception",
	"08001": "sqlclient_unable_to_establish_sqlconnection",
	"08003": "connection_does_not_exist",
	"08004": "sqlserver_rejected_establishment_of_sqlconnection",
	"08006": "connection_failure",
	"08007": "transaction_resolution_unknown",
	"08P01": "protocol_violation",
	"09000": "triggered_action_exception",
	"0A000": "feature_not_supported",
	"0B000": "invalid_transaction_initiation",
	"0F000": "locator_exception",
	"0F001": "invalid_locator_specification",
	"0L000": "invalid_grantor",
	"0LP01": "invalid_grant_operation",
	"0P000": "invalid_role_specification",
	"0Z000": "diagnostics_exception",
	"0Z002": "stacked_diagnostics_accessed_without_active_handler",
	"10608": "invalid_argument_for_xquery",
	"20000": "case_not_found",
	"21000": "cardinality_violation",
	"22000": "data_exception",
	"22001": "string_data_right_truncation",
	"22002": "null_value_no_indicator_parameter",
	"22003": "numeric_value_out_of_range",
	"22004": "null_value_not_allowed",
	"22005": "error_in_assignment",
	"22007": "invalid_datetime_format",
	"22008": "datetime_field_overflow",
	"22009": "invalid_time_zone_displacement_value",
	"2200B": "escape_character_conflict",
	"2200C": "invalid_use_of_escape_character",
	"2200D": "invalid_escape_octet",
	"2200F": "zero_length_character_string",
	"2200G": "most_specific_type_mismatch",
	"2200H": "sequence_generator_limit_exceeded",
	"2200L": "not_an_xml_document",
	"2200M": "invalid_xml_document",
	"2200N": "invalid_xml_content",
	"2200S": "invalid_xml_comment",
	"2200T": "invalid_xml_processing_instruction",
	"22010": "invalid_indicator_parameter_value",
	"22011": "substring_error",
	"22012": "division_by_zero",
	"22013": "invalid_preceding_or_following_size",
	"22014": "invalid_argument_for_ntile_function",
	"22015": "interval_field_overflow",
	"22016": "invalid_argument_for_nth_value_function",
	"22018": "invalid_character_value_for_cast",
	"22019": "invalid_escape_character",
	"2201B": "invalid_regular_expression",
	"2201E": "invalid_argument_for_logarithm",
	"2201F": "invalid_argument_for_power_function",
	"2201G": "invalid_argument_for_width_bucket_function",
	"2201W": "invalid_row_count_in_limit_clause",
	"2201X": "invalid_row_count_in_result_offset_clause",
	"22021": "character_not_in_repertoire",
	"22022": "indicator_overflow",
	"22023": "invalid_parameter_value",
	"22024": "unterminated_c_string",
	"22025": "invalid_escape_sequence",
	"22026": "string_data_length_mismatch",
	"22027": "trim_error",
	"2202E": "array_subscript_error",
	"2202G": "invalid_tablesample_repeat",
	"2202H": "invalid_tablesample_argument",
	"22030": "duplicate_json_object_key_value",
	"22031": "invalid_argument_for_sql_json_datetime_function",
	"22032": "invalid_json_text",
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
	"2203D": "too_many_json_array_elements",
	"2203E": "too_many_json_object_members",
	"2203F": "sql_json_scalar_required",
	"2203G": "sql_json_item_cannot_be_cast_to_target_type",
	"22P01": "floating_point_exception",
	"22P02": "invalid_text_representation",
	"22P03": "invalid_binary_representation",
	"22P04": "bad_copy_file_format",
	"22P05": "untranslatable_character",
	"22P06": "nonstandard_use_of_escape_character",
	"23000": "integrity_constraint_violation",
	"23001": "restrict_violation",
	"23502": "not_null_violation",
	"23503": "foreign_key_violation",
	"23505": "unique_violation",
	"23514": "check_violation",
	"23P01": "exclusion_violation",
	"24000": "invalid_cursor_state",
	"25000": "invalid_transaction_state",
	"25001": "active_sql_transaction",
	"25002": "branch_transaction_already_active",
	"25003": "inappropriate_access_mode_for_branch_transaction",
	"25004": "inappropriate_isolation_level_for_branch_transaction",
	"25005": "no_active_sql_transaction_for_branch_transaction",
	"25006": "read_only_sql_transaction",
	"25007": "schema_and_data_statement_mixing_not_supported",
	"25008": "held_cursor_requires_same_isolation_level",
	"25P01": "no_active_sql_transaction",
	"25P02": "in_failed_sql_transaction",
	"25P03": "idle_in_transaction_session_timeout",
	"25P04": "transaction_timeout",
	"26000": "invalid_sql_statement_name",
	"27000": "triggered_data_change_violation",
	"28000": "invalid_authorization_specification",
	"28P01": "invalid_password",
	"2B000": "dependent_privilege_descriptors_still_exist",
	"2BP01": "dependent_objects_still_exist",
	"2D000": "invalid_transaction_termination",
	"2F000": "sql_routine_exception",
	"2F002": "modifying_sql_data_not_permitted",
	"2F003": "prohibited_sql_statement_attempted",
	"2F004": "reading_sql_data_not_permitted",
	"2F005": "function_executed_no_return_statement",
	"34000": "invalid_cursor_name",
	"38000": "external_routine_exception",
	"38001": "containing_sql_not_permitted",
	"38002": "modifying_sql_data_not_permitted",
	"38003": "prohibited_sql_statement_attempted",
	"38004": "reading_sql_data_not_permitted",
	"39000": "external_routine_invocation_exception",
	"39001": "invalid_sqlstate_returned",
	"39004": "null_value_not_allowed",
	"39P01": "trigger_protocol_violated",
	"39P02": "srf_protocol_violated",
	"39P03": "event_trigger_protocol_violated",
	"3B000": "savepoint_exception",
	"3B001": "invalid_savepoint_specification",
	"3D000": "invalid_catalog_name",
	"3F000": "invalid_schema_name",
	"40000": "transaction_rollback",
	"40001": "serialization_failure",
	"40002": "transaction_integrity_constraint_violation",
	"40003": "statement_completion_unknown",
	"40P01": "deadlock_detected",
	"42000": "syntax_error_or_access_rule_violation",
	"42501": "insufficient_privilege",
	"42601": "syntax_error",
	"42602": "invalid_name",
	"42611": "invalid_column_definition",
	"42622": "name_too_long",
	"42701": "duplicate_column",
	"42702": "ambiguous_column",
	"42703": "undefined_column",
	"42704": "undefined_object",
	"42710": "duplicate_object",
	"42712": "duplicate_alias",
	"42723": "duplicate_function",
	"42725": "ambiguous_function",
	"42803": "grouping_error",
	"42804": "datatype_mismatch",
	"42809": "wrong_object_type",
	"42830": "invalid_foreign_key",
	"42846": "cannot_coerce",
	"42883": "undefined_function",
	"428C9": "generated_always",
	"42939": "reserved_name",
	"42P01": "undefined_table",
	"42P02": "undefined_parameter",
	"42P03": "duplicate_cursor",
	"42P04": "duplicate_database",
	"42P05": "duplicate_prepared_statement",
	"42P06": "duplicate_schema",
	"42P07": "duplicate_table",
	"42P08": "ambiguous_parameter",
	"42P09": "ambiguous_alias",
	"42P10": "invalid_column_reference",
	"42P11": "invalid_cursor_definition",
	"42P12": "invalid_database_definition",
	"42P13": "invalid_function_definition",
	"42P14": "invalid_prepared_statement_definition",
	"42P15": "invalid_schema_definition",
	"42P16": "invalid_table_definition",
	"42P17": "invalid_object_definition",
	"42P18": "indeterminate_datatype",
	"42P19": "invalid_recursion",
	"42P20": "windowing_error",
	"42P21": "collation_mismatch",
	"42P22": "indeterminate_collation",
	"44000": "with_check_option_violation",
	"53000": "insufficient_resources",
	"53100": "disk_full",
	"53200": "out_of_memory",
	"53300": "too_many_connections",
	"53400": "configuration_limit_exceeded",
	"54000": "program_limit_exceeded",
	"54001": "statement_too_complex",
	"54011": "too_many_columns",
	"54023": "too_many_arguments",
	"55000": "object_not_in_prerequisite_state",
	"55006": "object_in_use",
	"55P02": "cant_change_runtime_param",
	"55P03": "lock_not_available",
	"55P04": "unsafe_new_enum_value_usage",
	"57000": "operator_intervention",
	"57014": "query_canceled",
	"57P01": "admin_shutdown",
	"57P02": "crash_shutdown",
	"57P03": "cannot_connect_now",
	"57P04": "database_dropped",
	"57P05": "idle_session_timeout",
	"58000": "system_error",
	"58030": "io_error",
	"58P01": "undefined_file",
	"58P02": "duplicate_file",
	"58P03": "file_name_too_long",
	"72000": "snapshot_too_old",
	"F0000": "config_file_error",
	"F0001": "lock_file_exists",
	"HV000": "fdw_error",
	"HV001": "fdw_out_of_memory",
	"HV002": "fdw_dynamic_parameter_value_needed",
	"HV004": "fdw_invalid_data_type",
	"HV005": "fdw_column_name_not_found",
	"HV006": "fdw_invalid_data_type_descriptors",
	"HV007": "fdw_invalid_column_name",
	"HV008": "fdw_invalid_column_number",
	"HV009": "fdw_invalid_use_of_null_pointer",
	"HV00A": "fdw_invalid_string_format",
	"HV00B": "fdw_invalid_handle",
	"HV00C": "fdw_invalid_option_index",
	"HV00D": "fdw_invalid_option_name",
	"HV00J": "fdw_option_name_not_found",
	"HV00K": "fdw_reply_handle",
	"HV00L": "fdw_unable_to_create_execution",
	"HV00M": "fdw_unable_to_create_reply",
	"HV00N": "fdw_unable_to_establish_connection",
	"HV00P": "fdw_no_schemas",
	"HV00Q": "fdw_schema_not_found",
	"HV00R": "fdw_table_not_found",
	"HV010": "fdw_function_sequence_error",
	"HV014": "fdw_too_many_handles",
	"HV021": "fdw_inconsistent_descriptor_information",
	"HV024": "fdw_invalid_attribute_value",
	"HV090": "fdw_invalid_string_length_or_buffer_length",
	"HV091": "fdw_invalid_descriptor_field_identifier",
	"P0000": "plpgsql_error",
	"P0001": "raise_exception",
	"P0002": "no_data_found",
	"P0003": "too_many_rows",
	"P0004": "assert_failure",
	"XX000": "internal_error",
	"XX001": "data_corrupted",
	"XX002": "index_corrupted",
}
