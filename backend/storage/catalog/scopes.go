package catalog

import (
	"fmt"

	"github.com/querylane/querylane/backend/resource"
)

// scopeDatabasesForInstance returns the {instance}/databases list scope used
// by ListDatabases.
func scopeDatabasesForInstance(instanceID string) string {
	return fmt.Sprintf("instances/%s/databases", instanceID)
}

// scopeServerInfo returns the {instance}/server_info scope used by GetServerInfo.
func scopeServerInfo(instanceID string) string {
	return fmt.Sprintf("instances/%s/server_info", instanceID)
}

// catalogChildScopeSuffixes lists every per-table sync_state scope suffix that
// hangs under a {table-resource}/... scope. Used by parent-level syncs to clean
// up the exact set of child scopes for vanished tables without resorting to
// LIKE patterns interpolated with user-supplied identifiers.
var catalogChildScopeSuffixes = []string{
	"/columns",
	"/constraints",
	"/indexes",
	"/policies",
	"/triggers",
}

// scopeDatabase returns the scope of a single database row (matches the
// resource name format the catalog package emits).
func scopeDatabase(instanceID, databaseName string) string {
	return resource.NewDatabaseName(instanceID, databaseName).String()
}

// scopeSchemasForDatabase returns the {database}/schemas list scope.
func scopeSchemasForDatabase(instanceID, databaseName string) string {
	return scopeDatabase(instanceID, databaseName) + "/schemas"
}

// scopeSchema returns the scope of a single schema row.
func scopeSchema(instanceID, databaseName, schemaName string) string {
	return resource.NewSchemaName(instanceID, databaseName, schemaName).String()
}

// scopeTablesForSchema returns the {schema}/tables list scope.
func scopeTablesForSchema(instanceID, databaseName, schemaName string) string {
	return scopeSchema(instanceID, databaseName, schemaName) + "/tables"
}

// scopeViewsForSchema returns the {schema}/views list scope.
func scopeViewsForSchema(instanceID, databaseName, schemaName string) string {
	return scopeSchema(instanceID, databaseName, schemaName) + "/views"
}

// scopeTable returns the scope of a single table row.
func scopeTable(instanceID, databaseName, schemaName, tableName string) string {
	return resource.NewTableName(instanceID, databaseName, schemaName, tableName).String()
}

// tableChildScopes returns the exact catalog_sync_state scopes for every
// per-table child resource (columns, constraints, indexes, policies, triggers)
// of the given table. Use this to clean up vanished tables' child scopes
// without relying on LIKE patterns over user-supplied table names.
func tableChildScopes(instanceID, databaseName, schemaName, tableName string) []string {
	base := scopeTable(instanceID, databaseName, schemaName, tableName)
	out := make([]string, 0, len(catalogChildScopeSuffixes))

	for _, suffix := range catalogChildScopeSuffixes {
		out = append(out, base+suffix)
	}

	return out
}
