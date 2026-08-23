package resource

import (
	"fmt"
	"strings"
)

var viewDependencyTemplate = strings.Split(ViewDependencyPattern, "/")

// ViewDependencyName represents a parsed view dependency resource name.
// Format: instances/{instance}/databases/{database}/schemas/{schema}/views/{view}/viewDependencies/{view_dependency}.
type ViewDependencyName struct {
	InstanceID       string
	DatabaseID       string
	SchemaID         string
	ViewID           string
	ViewDependencyID string
}

// NewViewDependencyName creates a ViewDependencyName from components.
func NewViewDependencyName(instanceID, databaseID, schemaID, viewID, viewDependencyID string) ViewDependencyName {
	return ViewDependencyName{
		InstanceID:       instanceID,
		DatabaseID:       databaseID,
		SchemaID:         schemaID,
		ViewID:           viewID,
		ViewDependencyID: viewDependencyID,
	}
}

// ParseViewDependencyName parses a view dependency resource name.
func ParseViewDependencyName(name string) (ViewDependencyName, error) {
	vars, err := parse(name, viewDependencyTemplate)
	if err != nil {
		return ViewDependencyName{}, fmt.Errorf("invalid view dependency name: %w", err)
	}

	return ViewDependencyName{
		InstanceID:       vars["instanceID"],
		DatabaseID:       decodeIDSegment(vars["databaseID"]),
		SchemaID:         decodeIDSegment(vars["schemaID"]),
		ViewID:           decodeIDSegment(vars["viewID"]),
		ViewDependencyID: decodeIDSegment(vars["viewDependencyID"]),
	}, nil
}

// String returns the canonical string representation of the view dependency name.
func (n ViewDependencyName) String() string {
	return fmt.Sprintf(
		"instances/%s/databases/%s/schemas/%s/views/%s/viewDependencies/%s",
		n.InstanceID,
		encodeIDSegment(n.DatabaseID),
		encodeIDSegment(n.SchemaID),
		encodeIDSegment(n.ViewID),
		encodeIDSegment(n.ViewDependencyID),
	)
}

// ResourceType returns the canonical resource type.
func (n ViewDependencyName) ResourceType() Type {
	return TypeViewDependency
}

// Parent returns the parent view name.
func (n ViewDependencyName) Parent() ViewName {
	return NewViewName(n.InstanceID, n.DatabaseID, n.SchemaID, n.ViewID)
}

// View returns the parent view name.
func (n ViewDependencyName) View() ViewName {
	return n.Parent()
}

// Schema returns the containing schema name.
func (n ViewDependencyName) Schema() SchemaName {
	return NewSchemaName(n.InstanceID, n.DatabaseID, n.SchemaID)
}

// Database returns the containing database name.
func (n ViewDependencyName) Database() DatabaseName {
	return NewDatabaseName(n.InstanceID, n.DatabaseID)
}

// Instance returns the containing instance name.
func (n ViewDependencyName) Instance() InstanceName {
	return NewInstanceName(n.InstanceID)
}

// IsZero reports whether n is the zero value.
func (n ViewDependencyName) IsZero() bool {
	return n.InstanceID == "" && n.DatabaseID == "" && n.SchemaID == "" && n.ViewID == "" && n.ViewDependencyID == ""
}

// MarshalText implements encoding.TextMarshaler.
func (n ViewDependencyName) MarshalText() ([]byte, error) {
	return []byte(n.String()), nil
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (n *ViewDependencyName) UnmarshalText(data []byte) error {
	parsed, err := ParseViewDependencyName(string(data))
	if err != nil {
		return err
	}

	*n = parsed

	return nil
}
