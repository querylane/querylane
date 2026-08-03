package resource

import "fmt"

// RelationName carries the shared identity of a table or view resource.
type RelationName struct {
	InstanceID string
	DatabaseID string
	SchemaID   string
	RelationID string
	Type       Type
}

// ParseRelationName parses a table or view resource name.
func ParseRelationName(name string) (RelationName, error) {
	if table, err := ParseTableName(name); err == nil {
		return RelationName{
			InstanceID: table.InstanceID,
			DatabaseID: table.DatabaseID,
			SchemaID:   table.SchemaID,
			RelationID: table.TableID,
			Type:       TypeTable,
		}, nil
	}

	if view, err := ParseViewName(name); err == nil {
		return RelationName{
			InstanceID: view.InstanceID,
			DatabaseID: view.DatabaseID,
			SchemaID:   view.SchemaID,
			RelationID: view.ViewID,
			Type:       TypeView,
		}, nil
	}

	return RelationName{}, fmt.Errorf("invalid relation name: %w", ErrInvalidName)
}

// String returns the canonical resource name.
func (n RelationName) String() string {
	if n.Type == TypeView {
		return NewViewName(n.InstanceID, n.DatabaseID, n.SchemaID, n.RelationID).String()
	}

	return NewTableName(n.InstanceID, n.DatabaseID, n.SchemaID, n.RelationID).String()
}

// Schema returns the containing schema.
func (n RelationName) Schema() SchemaName {
	return NewSchemaName(n.InstanceID, n.DatabaseID, n.SchemaID)
}

// Database returns the containing database.
func (n RelationName) Database() DatabaseName {
	return NewDatabaseName(n.InstanceID, n.DatabaseID)
}

// Instance returns the containing instance.
func (n RelationName) Instance() InstanceName {
	return NewInstanceName(n.InstanceID)
}
