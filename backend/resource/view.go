package resource

import (
	"fmt"
	"strings"
)

var viewTemplate = strings.Split(ViewPattern, "/")

// ViewName represents a parsed view resource name.
// Format: instances/{instance}/databases/{database}/schemas/{schema}/views/{view}.
type ViewName struct { //nolint:recvcheck // UnmarshalText requires pointer receiver
	InstanceID string
	DatabaseID string
	SchemaID   string
	ViewID     string
}

// NewViewName creates a ViewName from components.
func NewViewName(instanceID, databaseID, schemaID, viewID string) ViewName {
	return ViewName{InstanceID: instanceID, DatabaseID: databaseID, SchemaID: schemaID, ViewID: viewID}
}

// ParseViewName parses a view resource name.
func ParseViewName(name string) (ViewName, error) {
	vars, err := parse(name, viewTemplate)
	if err != nil {
		return ViewName{}, fmt.Errorf("invalid view name: %w", err)
	}

	return ViewName{
		InstanceID: vars["instanceID"],
		DatabaseID: decodeIDSegment(vars["databaseID"]),
		SchemaID:   decodeIDSegment(vars["schemaID"]),
		ViewID:     decodeIDSegment(vars["viewID"]),
	}, nil
}

// String returns the canonical string representation of the view name.
func (n ViewName) String() string {
	return fmt.Sprintf("instances/%s/databases/%s/schemas/%s/views/%s", n.InstanceID, encodeIDSegment(n.DatabaseID), encodeIDSegment(n.SchemaID), encodeIDSegment(n.ViewID))
}

// ResourceType returns the canonical resource type.
func (n ViewName) ResourceType() Type {
	return TypeView
}

// Parent returns the parent schema name.
func (n ViewName) Parent() SchemaName {
	return SchemaName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID, SchemaID: n.SchemaID}
}

// Schema returns the schema resource name.
func (n ViewName) Schema() SchemaName {
	return SchemaName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID, SchemaID: n.SchemaID}
}

// Database returns the database resource name.
func (n ViewName) Database() DatabaseName {
	return DatabaseName{InstanceID: n.InstanceID, DatabaseID: n.DatabaseID}
}

// Instance returns the instance resource name.
func (n ViewName) Instance() InstanceName {
	return InstanceName{InstanceID: n.InstanceID}
}

// IsZero reports whether n is the zero value.
func (n ViewName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == "" && n.SchemaID == "" && n.ViewID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n ViewName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *ViewName) UnmarshalText(data []byte) error {
	parsed, err := ParseViewName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}
