package apierrors

import (
	"errors"
	"fmt"
	"strconv"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"google.golang.org/protobuf/proto"

	"github.com/querylane/querylane/backend/postgreserrors"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// PostgresOperationLabel is a stable backend operation label attached to
// PostgreSQL error metadata. Use constants or hard-coded service operation
// names such as "execute_query" or "list_tables"; never pass user input.
type PostgresOperationLabel string

// PostgresErrorClassification adapts the transport-neutral PostgreSQL taxonomy
// to Querylane's Connect status and ErrorInfo reason.
type PostgresErrorClassification struct {
	SQLState      string
	SQLStateClass string
	ConditionName string
	Operation     PostgresOperationLabel
	Profile       postgreserrors.Profile
	Kind          postgreserrors.Kind
	ConnectCode   connect.Code
	ErrorReason   consolev1alpha1.ErrorReason
	ClientFields  postgreserrors.ClientFields
}

// PostgresErrorResponse contains user-managed instance error fields for RPCs
// that embed a google.rpc.Status instead of returning a Connect error.
type PostgresErrorResponse struct {
	ConnectCode connect.Code
	Message     string
	Metadata    map[string]string
	Detail      *consolev1alpha1.PostgreSqlErrorDetail
}

// ClassifyPostgresError classifies a PostgreSQL server error with an explicit
// policy profile. Callers must not infer profiles from operation strings.
func ClassifyPostgresError(
	pgErr *pgconn.PgError,
	operation PostgresOperationLabel,
	profile postgreserrors.Profile,
) PostgresErrorClassification {
	classification := postgreserrors.Classify(pgErr, profile)

	return adaptPostgresClassification(classification, operation)
}

func adaptPostgresClassification(
	classification postgreserrors.Classification,
	operation PostgresOperationLabel,
) PostgresErrorClassification {
	code, reason := postgresConnectMapping(classification.Kind)

	return PostgresErrorClassification{
		SQLState:      classification.SQLState,
		SQLStateClass: classification.Class,
		ConditionName: classification.Condition,
		Operation:     operation,
		Profile:       classification.Profile,
		Kind:          classification.Kind,
		ConnectCode:   code,
		ErrorReason:   reason,
		ClientFields:  classification.ClientFields,
	}
}

// PostgresErrorResponseFromError adapts a classified or raw PostgreSQL cause
// for a user-managed instance. Raw server text stays out of metadata.
func PostgresErrorResponseFromError(
	err error,
	operation PostgresOperationLabel,
) (PostgresErrorResponse, bool) {
	classification, ok := postgresClassificationFromError(err, string(operation))
	if !ok {
		return PostgresErrorResponse{}, false
	}

	metadataPairs := postgresErrorInfoMetadata(classification)

	metadata := make(map[string]string, len(metadataPairs))
	for _, pair := range metadataPairs {
		metadata[pair.Key] = pair.Value
	}

	return PostgresErrorResponse{
		ConnectCode: classification.ConnectCode,
		Message:     postgresUserErrorMessage(classification),
		Metadata:    metadata,
		Detail:      postgresErrorDetail(classification, true),
	}, true
}

func postgresClassificationFromError(err error, operation string) (PostgresErrorClassification, bool) {
	var classified *postgreserrors.Error
	if errors.As(err, &classified) {
		if operation == "" {
			operation = classified.Operation()
		}

		return adaptPostgresClassification(
			classified.Classification(),
			PostgresOperationLabel(operation),
		), true
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return ClassifyPostgresError(
			pgErr,
			PostgresOperationLabel(operation),
			postgreserrors.ProfileDefault,
		), true
	}

	return PostgresErrorClassification{}, false
}

func newMetaDatabaseUnavailablePostgresError(err error) (*connect.Error, bool) {
	classification, ok := postgresClassificationFromError(err, "check_application_database")
	if !ok {
		return nil, false
	}

	classification.ConnectCode = connect.CodeUnavailable
	classification.ErrorReason = consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE

	return newPostgresErrorFromClassification(err, classification, nil), true
}

// NewPostgresError builds a Connect error for a user-managed PostgreSQL
// instance. Bounded message/detail/hint fields are client-visible but remain
// excluded from ErrorInfo metadata.
func NewPostgresError(
	pgErr *pgconn.PgError,
	operation PostgresOperationLabel,
	profile postgreserrors.Profile,
	otherDetails ...proto.Message,
) *connect.Error {
	classification := ClassifyPostgresError(pgErr, operation, profile)

	return newPostgresError(
		pgErr,
		classification,
		postgresUserErrorMessage(classification),
		true,
		nil,
		otherDetails...,
	)
}

// newPostgresErrorFromClassification builds a redacted meta-database error.
// Meta-database fields describe Querylane internals and must not cross the wire.
func newPostgresErrorFromClassification(
	cause error,
	classification PostgresErrorClassification,
	extraMetadata []KeyVal,
	otherDetails ...proto.Message,
) *connect.Error {
	return newPostgresError(
		cause,
		classification,
		postgresRedactedErrorMessage(classification),
		false,
		extraMetadata,
		otherDetails...,
	)
}

func newPostgresError(
	cause error,
	classification PostgresErrorClassification,
	message string,
	exposeClientFields bool,
	extraMetadata []KeyVal,
	otherDetails ...proto.Message,
) *connect.Error {
	metadata := postgresErrorInfoMetadata(classification)
	metadata = append(metadata, extraMetadata...)
	detail := postgresErrorDetail(classification, exposeClientFields)
	details := append([]proto.Message{detail}, otherDetails...)

	return NewConnectError(
		classification.ConnectCode,
		postgresWireError{message: message, cause: cause},
		NewErrorInfo(DomainConsole, classification.ErrorReason, metadata...),
		details...,
	)
}

func postgresErrorDetail(
	classification PostgresErrorClassification,
	exposeClientFields bool,
) *consolev1alpha1.PostgreSqlErrorDetail {
	var serverFields map[string]string
	if exposeClientFields {
		serverFields = postgresClientServerFields(classification.ClientFields)
	}

	return &consolev1alpha1.PostgreSqlErrorDetail{
		Sqlstate:      classification.SQLState,
		SqlstateClass: classification.SQLStateClass,
		ConditionName: classification.ConditionName,
		Operation:     string(classification.Operation),
		ServerFields:  serverFields,
	}
}

type postgresWireError struct {
	message string
	cause   error
}

func (e postgresWireError) Error() string {
	return e.message
}

func (e postgresWireError) Unwrap() error {
	return e.cause
}

func postgresUserErrorMessage(classification PostgresErrorClassification) string {
	prefix := "PostgreSQL"
	if classification.SQLState != "" {
		prefix += " " + classification.SQLState
	}

	if classification.ClientFields.Message != "" {
		return prefix + ": " + classification.ClientFields.Message
	}

	return prefix + " error"
}

func postgresRedactedErrorMessage(classification PostgresErrorClassification) string {
	message := "PostgreSQL error"
	if classification.SQLState != "" {
		message = "PostgreSQL " + classification.SQLState
	}

	if classification.Operation != "" {
		message += fmt.Sprintf(" during %s", classification.Operation)
	}

	return message
}

// postgresErrorInfoMetadata contains only normalized taxonomy and trusted
// operation labels. Untrusted PostgreSQL server fields belong in the typed
// PostgreSqlErrorDetail and must not enter metadata or telemetry.
func postgresErrorInfoMetadata(classification PostgresErrorClassification) []KeyVal {
	metadata := make([]KeyVal, 0, 4)
	metadata = appendIfValue(metadata, "sqlstate", classification.SQLState)
	metadata = appendIfValue(metadata, "sqlstate_class", classification.SQLStateClass)
	metadata = appendIfValue(metadata, "condition_name", classification.ConditionName)
	metadata = appendIfValue(metadata, "operation", string(classification.Operation))

	return metadata
}

func appendIfValue(metadata []KeyVal, key string, value string) []KeyVal {
	if value == "" {
		return metadata
	}

	return append(metadata, KeyVal{Key: key, Value: value})
}

func postgresClientServerFields(fields postgreserrors.ClientFields) map[string]string {
	clientFields := make(map[string]string)
	addPostgresField(clientFields, "severity", fields.Severity)
	addPostgresField(clientFields, "message", fields.Message)
	addPostgresField(clientFields, "detail", fields.Detail)
	addPostgresField(clientFields, "hint", fields.Hint)
	addPostgresField(clientFields, "schema_name", fields.SchemaName)
	addPostgresField(clientFields, "table_name", fields.TableName)
	addPostgresField(clientFields, "column_name", fields.ColumnName)
	addPostgresField(clientFields, "data_type_name", fields.DataTypeName)
	addPostgresField(clientFields, "constraint_name", fields.ConstraintName)

	if fields.Position > 0 {
		clientFields["position"] = strconv.Itoa(int(fields.Position))
	}

	if len(clientFields) == 0 {
		return nil
	}

	return clientFields
}

func addPostgresField(fields map[string]string, key string, value string) {
	if value != "" {
		fields[key] = value
	}
}

func postgresConnectMapping(kind postgreserrors.Kind) (connect.Code, consolev1alpha1.ErrorReason) {
	switch kind {
	case postgreserrors.KindInvalidArgument:
		return connect.CodeInvalidArgument, consolev1alpha1.ErrorReason_INVALID_ARGUMENT
	case postgreserrors.KindFailedPrecondition:
		return connect.CodeFailedPrecondition, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case postgreserrors.KindNotFound:
		return connect.CodeNotFound, consolev1alpha1.ErrorReason_RESOURCE_NOT_FOUND
	case postgreserrors.KindAlreadyExists:
		return connect.CodeAlreadyExists, consolev1alpha1.ErrorReason_RESOURCE_ALREADY_EXISTS
	case postgreserrors.KindPermissionDenied:
		return connect.CodePermissionDenied, consolev1alpha1.ErrorReason_PERMISSION_DENIED
	case postgreserrors.KindUnauthenticated:
		return connect.CodeUnauthenticated, consolev1alpha1.ErrorReason_UNAUTHENTICATED
	case postgreserrors.KindAborted:
		return connect.CodeAborted, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case postgreserrors.KindTimeout:
		return connect.CodeDeadlineExceeded, consolev1alpha1.ErrorReason_TIMEOUT
	case postgreserrors.KindUnavailable:
		return connect.CodeUnavailable, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case postgreserrors.KindResourceExhausted:
		return connect.CodeResourceExhausted, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case postgreserrors.KindUnimplemented:
		return connect.CodeUnimplemented, consolev1alpha1.ErrorReason_FAILED_PRECONDITION
	case postgreserrors.KindInternal:
		return connect.CodeInternal, consolev1alpha1.ErrorReason_INTERNAL_ERROR
	default:
		return connect.CodeInternal, consolev1alpha1.ErrorReason_INTERNAL_ERROR
	}
}
