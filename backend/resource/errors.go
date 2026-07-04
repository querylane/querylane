package resource

import (
	"errors"
	"fmt"
)

// ErrInvalidName is the base error for all resource name parsing failures.
var ErrInvalidName = errors.New("invalid resource name")

// ParseError provides detailed information about resource name parsing failures.
type ParseError struct {
	Name     string // The full resource name that failed to parse
	Segment  int    // The segment index (1-based) where parsing failed
	Expected string // What was expected at this segment
	Got      string // What was actually found at this segment
}

// Error includes the segment index and offending value so RPC clients can
// pinpoint which part of a resource name was malformed.
func (e *ParseError) Error() string {
	return fmt.Sprintf("%v: segment %d expected %q, got %q in %q",
		ErrInvalidName, e.Segment, e.Expected, e.Got, e.Name)
}

// Unwrap exposes ErrInvalidName so callers can use errors.Is without a type
// assertion on this struct.
func (e *ParseError) Unwrap() error {
	return ErrInvalidName
}
