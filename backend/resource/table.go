package resource

import (
	"fmt"
	"strings"
)

var tableTemplate = strings.Split(TablePattern, "/")

// TableName represents a parsed table resource name.
// Format: instances/{instance}/databases/{database}/schemas/{schema}/tables/{table}.
type TableName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	DatabaseID string
	SchemaID   string
	TableID    string
}

// NewTableName creates a Table from components.
func NewTableName(instanceID, databaseID, schemaID, tableID string) TableName {
	return TableName{InstanceID: instanceID, DatabaseID: databaseID, SchemaID: schemaID, TableID: tableID}
}

// ParseTableName parses a table resource name.
func ParseTableName(name string) (TableName, error) {
	vars, err := parse(name, tableTemplate)
	if err != nil {
		return TableName{}, fmt.Errorf("invalid table name: %w", err)
	}

	return TableName{
		InstanceID: vars["instanceID"],
		DatabaseID: decodeIDSegment(vars["databaseID"]),
		SchemaID:   decodeIDSegment(vars["schemaID"]),
		TableID:    decodeIDSegment(vars["tableID"]),
	}, nil
}

// MustParseTableName is like ParseTableName but panics on error.
// Use only in tests or where the input is guaranteed to be valid.
func MustParseTableName(name string) TableName {
	parsed, err := ParseTableName(name)
	if err != nil {
		panic(fmt.Sprintf("invalid table name: %s", err)) //nolint:forbidigo // MustParse* functions panic by design on invalid input
	}

	return parsed
}

// String returns the canonical string representation of the table name.
func (n TableName) String() string {
	return fmt.Sprintf("instances/%s/databases/%s/schemas/%s/tables/%s", n.InstanceID, encodeIDSegment(n.DatabaseID), encodeIDSegment(n.SchemaID), encodeIDSegment(n.TableID))
}

// ResourceType returns the canonical resource type.
func (n TableName) ResourceType() Type {
	return TypeTable
}

// Parent returns the parent schema name.
func (n TableName) Parent() SchemaName {
	return SchemaName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID, SchemaID: n.SchemaID}
}

// Direct ancestor accessors to avoid verbose Parent() chaining

// Schema returns the schema resource name.
func (n TableName) Schema() SchemaName {
	return SchemaName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID, SchemaID: n.SchemaID}
}

// Database returns the database resource name.
func (n TableName) Database() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// Instance returns the instance resource name.
func (n TableName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// Convenience string helpers - most commonly needed in service implementations

// InstanceName returns the full instance resource name as a string.
func (n TableName) InstanceName() string {
	return n.Instance().String()
}

// DatabaseName returns the full database resource name as a string.
func (n TableName) DatabaseName() string {
	return n.Database().String()
}

// SchemaName returns the full schema resource name as a string.
func (n TableName) SchemaName() string {
	return n.Schema().String()
}

// IsZero reports whether n is the zero value.
func (n TableName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == "" && n.SchemaID == "" && n.TableID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n TableName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *TableName) UnmarshalText(data []byte) error {
	parsed, err := ParseTableName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}
