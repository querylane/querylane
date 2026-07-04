package resource

import (
	"fmt"
	"strings"
)

var instanceTemplate = strings.Split(InstancePattern, "/")

// InstanceName represents a parsed instance resource name.
// Format: instances/{instance}.
type InstanceName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
}

// NewInstanceName creates an InstanceName from components.
func NewInstanceName(instanceID string) InstanceName {
	return InstanceName{InstanceID: instanceID}
}

// ParseInstanceName parses an instance resource name.
func ParseInstanceName(name string) (InstanceName, error) {
	vars, err := parse(name, instanceTemplate)
	if err != nil {
		return InstanceName{}, fmt.Errorf("invalid instance name: %w", err)
	}

	return InstanceName{
		InstanceID: vars["instanceID"],
	}, nil
}

// MustParseInstanceName is like ParseInstanceName but panics on error.
// Use only in tests or where the input is guaranteed to be valid.
func MustParseInstanceName(name string) InstanceName {
	result, err := ParseInstanceName(name)
	if err != nil {
		panic(err) //nolint:forbidigo // MustParse* functions panic by design on invalid input
	}

	return result
}

// String returns the canonical string representation of the instance name.
func (n InstanceName) String() string {
	return "instances/" + n.InstanceID
}

// ResourceType returns the canonical resource type.
func (n InstanceName) ResourceType() Type {
	return TypeInstance
}

// IsZero reports whether n is the zero value.
func (n InstanceName) IsZero() bool {
	return n.InstanceID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n InstanceName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *InstanceName) UnmarshalText(data []byte) error {
	parsed, err := ParseInstanceName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}
