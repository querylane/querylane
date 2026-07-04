package apierrors

// Domain is a type definition for specifying the error domain which is required
// in error details.
type Domain string

const (
	// DomainConsole defines the string for the proto error domain that is used in the console.
	DomainConsole Domain = "console.querylane.dev"
)
