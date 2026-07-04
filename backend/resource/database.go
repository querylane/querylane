package resource

import (
	"fmt"
	"strings"
)

var databaseTemplate = strings.Split(DatabasePattern, "/")

// DatabaseName represents a parsed database resource name.
// Format: instances/{instance}/databases/{database}.
type DatabaseName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	DatabaseID string
}

// NewDatabaseName creates a DatabaseName from components.
func NewDatabaseName(instanceID, databaseID string) DatabaseName {
	return DatabaseName{InstanceID: instanceID, DatabaseID: databaseID}
}

// ParseDatabaseName parses a database resource name.
func ParseDatabaseName(name string) (DatabaseName, error) {
	vars, err := parse(name, databaseTemplate)
	if err != nil {
		return DatabaseName{}, fmt.Errorf("invalid database name: %w", err)
	}

	return DatabaseName{
		InstanceID: vars["instanceID"],
		DatabaseID: decodeIDSegment(vars["databaseID"]),
	}, nil
}

// MustParseDatabaseName is like ParseDatabaseName but panics on error.
// Use only in tests or where the input is guaranteed to be valid.
func MustParseDatabaseName(name string) DatabaseName {
	result, err := ParseDatabaseName(name)
	if err != nil {
		panic(err) //nolint:forbidigo // MustParse* functions panic by design on invalid input
	}

	return result
}

// String returns the canonical string representation of the database name.
func (n DatabaseName) String() string {
	return fmt.Sprintf("instances/%s/databases/%s", n.InstanceID, encodeIDSegment(n.DatabaseID))
}

// ResourceType returns the canonical resource type.
func (n DatabaseName) ResourceType() Type {
	return TypeDatabase
}

// Parent returns the parent instance name.
func (n DatabaseName) Parent() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// IsZero reports whether n is the zero value.
func (n DatabaseName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n DatabaseName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *DatabaseName) UnmarshalText(data []byte) error {
	parsed, err := ParseDatabaseName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}

// Direct ancestor accessors to avoid verbose Parent() chaining

// Instance returns the instance resource name.
func (n DatabaseName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// Convenience string helpers - most commonly needed in service implementations

// InstanceName returns the full instance resource name as a string.
func (n DatabaseName) InstanceName() string {
	return n.Instance().String()
}
