package engine

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
)

// adminDriver composes the real engine seams needed by production DI.
// Tests should depend on the narrow seam they exercise instead of faking every method.
type adminDriver interface {
	healthDriver
	probeDriver
	instanceCatalogDriver
	databaseCatalogDriver
	tablePartitionDriver
	tableDataDriver
	queryDriver
}

// probeDriver serves the background sampling probes. Its queries run under
// probe-hardened settings (short statement/lock timeouts, probe
// application_name) so a slow catalog never occupies shared pool capacity.
type probeDriver interface {
	GetServerVersionNum(ctx context.Context, db *sql.DB) (int32, error)
	GetConnectionMetrics(ctx context.Context, db *sql.DB) (*ConnectionMetrics, error)
	GetCacheCounters(ctx context.Context, db *sql.DB) (*CacheCounters, error)
	ListDatabaseSizes(ctx context.Context, db *sql.DB) ([]DatabaseSize, error)
	GetIOCounters(ctx context.Context, db *sql.DB) (*IOCounters, error)
	GetVacuumCounters(ctx context.Context, db *sql.DB) (*VacuumCounters, error)
}

type healthDriver interface {
	GetServerInfo(ctx context.Context, db *sql.DB) (*ServerInfo, error)
	GetInstanceOverview(ctx context.Context, db *sql.DB) (*InstanceOverview, error)
	CheckInstanceHealth(ctx context.Context, db *sql.DB) (*InstanceHealth, error)
	TestConnection(ctx context.Context, db *sql.DB) error
}

type instanceCatalogDriver interface {
	ListDatabases(ctx context.Context, db *sql.DB, params aip.Params) ([]Database, string, error)
	GetDatabase(ctx context.Context, db *sql.DB, databaseName string) (*Database, error)
	ListRoles(ctx context.Context, db *sql.DB, params aip.Params) ([]Role, string, error)
	GetRole(ctx context.Context, db *sql.DB, roleName string) (*Role, error)
}

//nolint:interfacebloat // cohesive database catalog contract; mirrors DatabaseSession.
type databaseCatalogDriver interface {
	ListRoleGrants(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]RoleGrant, string, error)
	ListRoleOwnedObjects(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]OwnedObject, string, error)
	ListRoleDefaultPrivileges(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]RoleDefaultPrivilege, string, error)
	ListPublicGrants(ctx context.Context, db *sql.DB, params aip.Params) ([]RoleGrant, string, error)

	ListSchemas(ctx context.Context, db *sql.DB, params aip.Params) ([]Schema, string, error)
	GetSchema(ctx context.Context, db *sql.DB, schemaName string) (*Schema, error)
	ListExtensions(ctx context.Context, db *sql.DB, params aip.Params) ([]Extension, string, error)

	ListTables(ctx context.Context, db *sql.DB, schemaName string, params aip.Params) ([]Table, string, error)
	GetTable(ctx context.Context, db *sql.DB, schemaName, tableName string) (*Table, error)
	ListTableColumns(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]Column, error)

	ListTableConstraints(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]TableConstraint, error)
	ListTableIndexes(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]TableIndex, error)
	ListTablePolicies(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]TablePolicy, error)
	ListTableTriggers(ctx context.Context, db *sql.DB, schemaName, tableName string) ([]TableTrigger, error)

	ListViews(ctx context.Context, db *sql.DB, schemaName string, params aip.Params) ([]View, string, error)
	GetView(ctx context.Context, db *sql.DB, schemaName, viewName string) (*View, error)
}

type tablePartitionDriver interface {
	GetTablePartitionMetadata(ctx context.Context, db *sql.DB, schemaName, tableName string) (*TablePartitionMetadata, error)
}

type tableDataDriver interface {
	ReadRows(ctx context.Context, db *sql.DB, params ReadRowsParams) (*ReadRowsResult, error)
	ReadCellValue(ctx context.Context, db *sql.DB, params ReadCellValueParams) (*ReadCellValueResult, error)
}

type queryDriver interface {
	ExecuteQuery(ctx context.Context, db *sql.DB, params ExecuteQueryParams) (ExecuteQueryStream, error)
	ExplainQuery(ctx context.Context, db *sql.DB, params ExplainQueryParams) (*ExplainQueryResult, error)
	GetDatabaseQueryInsights(ctx context.Context, db *sql.DB) (*DatabaseQueryInsights, error)
}
