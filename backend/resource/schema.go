package resource

import (
	"fmt"
	"strings"
)

var schemaTemplate = strings.Split(SchemaPattern, "/")

// SchemaName represents a parsed schema resource name.
// Format: instances/{instance}/databases/{database}/schemas/{schema}.
type SchemaName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	DatabaseID string
	SchemaID   string
}

// NewSchemaName creates a SchemaName from components.
func NewSchemaName(instanceID, databaseID, schemaID string) SchemaName {
	return SchemaName{InstanceID: instanceID, DatabaseID: databaseID, SchemaID: schemaID}
}

// ParseSchemaName parses a schema resource name.
func ParseSchemaName(name string) (SchemaName, error) {
	vars, err := parse(name, schemaTemplate)
	if err != nil {
		return SchemaName{}, fmt.Errorf("invalid schema name: %w", err)
	}

	return SchemaName{
		InstanceID: vars["instanceID"],
		DatabaseID: decodeIDSegment(vars["databaseID"]),
		SchemaID:   decodeIDSegment(vars["schemaID"]),
	}, nil
}

// MustParseSchemaName is like ParseSchemaName but panics on error.
// Use only in tests or where the input is guaranteed to be valid.
func MustParseSchemaName(name string) SchemaName {
	result, err := ParseSchemaName(name)
	if err != nil {
		panic(err) //nolint:forbidigo // MustParse* functions panic by design on invalid input
	}

	return result
}

// String returns the canonical string representation of the schema name.
func (n SchemaName) String() string {
	return fmt.Sprintf("instances/%s/databases/%s/schemas/%s", n.InstanceID, encodeIDSegment(n.DatabaseID), encodeIDSegment(n.SchemaID))
}

// ResourceType returns the canonical resource type.
func (n SchemaName) ResourceType() Type {
	return TypeSchema
}

// Parent returns the parent database name.
func (n SchemaName) Parent() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// IsZero reports whether n is the zero value.
func (n SchemaName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == "" && n.SchemaID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n SchemaName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *SchemaName) UnmarshalText(data []byte) error {
	parsed, err := ParseSchemaName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}

// Direct ancestor accessors to avoid verbose Parent() chaining

// Database returns the database resource name.
func (n SchemaName) Database() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// Instance returns the instance resource name.
func (n SchemaName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// Convenience string helpers - most commonly needed in service implementations

// InstanceName returns the full instance resource name as a string.
func (n SchemaName) InstanceName() string {
	return n.Instance().String()
}

// DatabaseName returns the full database resource name as a string.
func (n SchemaName) DatabaseName() string {
	return n.Database().String()
}
