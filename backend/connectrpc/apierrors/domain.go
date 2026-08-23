package apierrors

// Domain is a type definition for specifying the error domain which is required
// in error details.
type Domain string

const (
	// DomainConsole defines the string for the proto error domain that is used in the console.
	DomainConsole Domain = "console.querylane.dev"
)

// Metadata keys carried on ErrorInfo details. These form part of the stable
// public error contract, so clients match on these exact strings.
const (
	// MetadataKeyOperation names the entry carrying the logical operation that failed.
	MetadataKeyOperation = "operation"
	// MetadataKeyResourceName names the entry carrying the resource involved in the failure.
	MetadataKeyResourceName = "resourceName"
)
