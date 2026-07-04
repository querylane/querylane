package apierrors

import (
	"errors"
	"fmt"
	"reflect"

	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/proto"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

// NewConnectError is a helper to construct a new connect.Error with rich details.
// It ensures that a standard ErrorInfo detail is always included.
func NewConnectError(
	code connect.Code,
	innerErr error,
	errInfo *errdetails.ErrorInfo,
	otherDetails ...proto.Message,
) *connect.Error {
	connectErr := connect.NewError(code, innerErr)

	allDetails := make([]proto.Message, 0, 1+len(otherDetails))
	allDetails = append(allDetails, errInfo)
	allDetails = append(allDetails, otherDetails...)

	for _, detailMsg := range allDetails {
		// Defensively skip nil messages, including typed nil protobuf pointers
		// stored in a non-nil proto.Message interface.
		if detailMsg == nil {
			continue
		}

		detailValue := reflect.ValueOf(detailMsg)
		if detailValue.Kind() == reflect.Ptr && detailValue.IsNil() {
			continue
		}

		if detail, err := connect.NewErrorDetail(detailMsg); err == nil {
			connectErr.AddDetail(detail)
		}
	}

	return connectErr
}

// KeyVal is a key/value pair that is used to provide additional metadata labels.
type KeyVal struct {
	Key   string
	Value string
}

// NewErrorInfo is a helper function to create a new ErrorInfo detail.
func NewErrorInfo(domain Domain, reason consolev1alpha1.ErrorReason, metadata ...KeyVal) *errdetails.ErrorInfo {
	var md map[string]string
	if len(metadata) > 0 {
		md = make(map[string]string, len(metadata))

		for _, keyVal := range metadata {
			md[keyVal.Key] = keyVal.Value
		}
	}

	return &errdetails.ErrorInfo{
		Reason:   reason.String(),
		Domain:   string(domain),
		Metadata: md,
	}
}

// NewBadRequest is a constructor for creating bad request.
func NewBadRequest(fieldValidations ...*errdetails.BadRequest_FieldViolation) *errdetails.BadRequest {
	return &errdetails.BadRequest{FieldViolations: fieldValidations}
}

// NewFieldViolation constructs a FieldViolation detail.
// It's used to describe a validation error on a specific request field.
func NewFieldViolation(field, description string) *errdetails.BadRequest_FieldViolation {
	return &errdetails.BadRequest_FieldViolation{
		Field:       field,
		Description: description,
	}
}

// NewHelp constructs a new errdetails.Help with one or more provided errdetails.Help_Link.
func NewHelp(links ...*errdetails.Help_Link) *errdetails.Help {
	return &errdetails.Help{Links: links}
}

// NewHelpLink constructs a new link that can be put into the errdetails.Help.
func NewHelpLink(description, url string) *errdetails.Help_Link {
	return &errdetails.Help_Link{
		Description: description,
		Url:         url,
	}
}

// NewResourceInfo constructs a ResourceInfo detail.
// It's used to specify the resource that an error applies to.
func NewResourceInfo(resourceType resource.Type, resourceName string) *errdetails.ResourceInfo {
	return &errdetails.ResourceInfo{
		ResourceType: resourceType.String(),
		ResourceName: resourceName,
	}
}

// NewDatabaseRequired returns a FailedPrecondition error when the app database
// is not yet configured. Many endpoints cannot perform their operation if a
// database is not available.
func NewDatabaseRequired() *connect.Error {
	return NewConnectError(
		connect.CodeFailedPrecondition,
		errors.New("the application database is not configured — please complete setup first"),
		NewErrorInfo(DomainConsole, consolev1alpha1.ErrorReason_APP_DATABASE_NOT_CONFIGURED),
	)
}

// NewDatabaseUnavailable returns an Unavailable error when the app database
// cannot be reached during normal operation.
func NewDatabaseUnavailable(innerErr error) *connect.Error {
	if innerErr == nil {
		innerErr = errors.New("the application database is temporarily unavailable")
	}

	return NewConnectError(
		connect.CodeUnavailable,
		innerErr,
		NewErrorInfo(DomainConsole, consolev1alpha1.ErrorReason_APP_DATABASE_UNAVAILABLE),
	)
}

// NewInvalidArgumentError creates an AIP-193 compliant INVALID_ARGUMENT error for field validation failures.
// Works for both single field and bulk validation scenarios using variadic field violations.
//
// Includes:
//   - BadRequest detail with field violations (AIP-193 standard)
//   - ErrorInfo with stable domain + reason only (consistent error shape across all errors)
//
// Security Note: Does NOT include invalid values to prevent PII leakage.
// Log values explicitly in your service layer if needed for debugging.
//
// Single field example:
//
//	if req.Msg.GetPageSize() < 0 {
//	    return nil, apierrors.NewInvalidArgumentError(
//	        apierrors.NewFieldViolation("page_size", "must be non-negative"),
//	    )
//	}
//
// Multiple fields example:
//
//	var violations []*errdetails.BadRequest_FieldViolation
//	if req.Msg.GetName() == "" {
//	    violations = append(violations,
//	        apierrors.NewFieldViolation("name", "is required"))
//	}
//	if req.Msg.GetAge() < 18 {
//	    violations = append(violations,
//	        apierrors.NewFieldViolation("age", "must be 18 or older"))
//	}
//	if len(violations) > 0 {
//	    return nil, apierrors.NewInvalidArgumentError(violations...)
//	}
func NewInvalidArgumentError(violations ...*errdetails.BadRequest_FieldViolation) *connect.Error {
	if len(violations) == 0 {
		// Defensive: if called with no violations, return a generic error
		return NewConnectError(
			connect.CodeInvalidArgument,
			errors.New("invalid request"),
			NewErrorInfo(DomainConsole, consolev1alpha1.ErrorReason_INVALID_ARGUMENT),
		)
	}

	// Build BadRequest with all field violations (AIP-193)
	// This is where ALL field-specific information goes
	badRequest := NewBadRequest(violations...)

	// Build ErrorInfo with ONLY stable identity (domain + reason)
	// No metadata with field names - that would be redundant with BadRequest
	// This keeps ErrorInfo consistent across all error types for client middleware
	errorInfo := NewErrorInfo(
		DomainConsole,
		consolev1alpha1.ErrorReason_INVALID_ARGUMENT,
		// Intentionally no metadata - BadRequest carries all field details
	)

	// Construct a human-readable error message for logs and simple clients
	var msg string
	if len(violations) == 1 {
		msg = fmt.Sprintf("invalid field %q: %s", violations[0].Field, violations[0].Description)
	} else {
		msg = fmt.Sprintf("invalid request: %d field validation errors", len(violations))
	}

	return NewConnectError(
		connect.CodeInvalidArgument,
		errors.New(msg),
		errorInfo,
		badRequest,
	)
}

// ParseResourceWithError validates and parses a resource name from a request field.
// This is a generic helper that standardizes resource parsing error handling across
// all Connect RPC service methods, eliminating repetitive validation boilerplate.
//
// Parameters:
//   - raw: The resource name string from the request (e.g., "instances/prod/databases/mydb/schemas/public/tables/users")
//   - field: The request field path relative to the request message (e.g., "name", "parent", "instance.name")
//     Per AIP-193, use the full path for nested fields (e.g., "instance.name" in UpdateInstanceRequest)
//   - parseFn: The domain parsing function (e.g., resource.ParseTableName)
//
// Returns the parsed resource or an AIP-193 compliant Connect error with BadRequest details.
func ParseResourceWithError[T any](
	raw string,
	field string,
	parseFn func(string) (T, error),
) (T, *connect.Error) {
	parsed, err := parseFn(raw)
	if err != nil {
		var zero T // Return zero value for generic type T

		// Use the standardized helper to ensure consistent error structure
		return zero, NewInvalidArgumentError(
			NewFieldViolation(field, fmt.Sprintf("Invalid resource name format: %v", err)),
		)
	}

	return parsed, nil
}
