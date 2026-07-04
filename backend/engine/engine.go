package engine

import (
	"context"

	"github.com/querylane/querylane/backend/aip"
)

// InstanceSession provides cluster-level access to one managed instance.
type InstanceSession interface {
	GetServerInfo(ctx context.Context) (*ServerInfo, error)
	GetInstanceOverview(ctx context.Context) (*InstanceOverview, error)
	CheckInstanceHealth(ctx context.Context) (*InstanceHealth, error)
	ListRoles(ctx context.Context, params aip.Params) ([]Role, string, error)
	GetRole(ctx context.Context, roleName string) (*Role, error)
	ListDatabases(ctx context.Context, params aip.Params) ([]Database, string, error)
	GetDatabase(ctx context.Context, databaseName string) (*Database, error)
	OpenDatabase(ctx context.Context, databaseName string) (DatabaseSession, error)
	Close() error
}

// DatabaseSession provides database-local access to one managed database.
//
//nolint:interfacebloat // cohesive engine session contract; matches adminDriver.
type DatabaseSession interface {
	ListRoleGrants(ctx context.Context, roleName string, params aip.Params) ([]RoleGrant, string, error)
	ListRoleOwnedObjects(ctx context.Context, roleName string, params aip.Params) ([]OwnedObject, string, error)
	ListRoleDefaultPrivileges(ctx context.Context, roleName string, params aip.Params) ([]RoleDefaultPrivilege, string, error)
	ListPublicGrants(ctx context.Context, params aip.Params) ([]RoleGrant, string, error)
	ListSchemas(ctx context.Context, params aip.Params) ([]Schema, string, error)
	GetSchema(ctx context.Context, schemaName string) (*Schema, error)
	ListExtensions(ctx context.Context, params aip.Params) ([]Extension, string, error)
	ListTables(ctx context.Context, schemaName string, params aip.Params) ([]Table, string, error)
	GetTable(ctx context.Context, schemaName, tableName string) (*Table, error)
	GetTablePartitionMetadata(ctx context.Context, schemaName, tableName string) (*TablePartitionMetadata, error)
	ListTableColumns(ctx context.Context, schemaName, tableName string) ([]Column, error)
	ListTableConstraints(ctx context.Context, schemaName, tableName string) ([]TableConstraint, error)
	ListTableIndexes(ctx context.Context, schemaName, tableName string) ([]TableIndex, error)
	ListTablePolicies(ctx context.Context, schemaName, tableName string) ([]TablePolicy, error)
	ListTableTriggers(ctx context.Context, schemaName, tableName string) ([]TableTrigger, error)
	ListViews(ctx context.Context, schemaName string, params aip.Params) ([]View, string, error)
	GetView(ctx context.Context, schemaName, viewName string) (*View, error)
	ReadRows(ctx context.Context, params ReadRowsParams) (*ReadRowsResult, error)
	ReadCellValue(ctx context.Context, params ReadCellValueParams) (*ReadCellValueResult, error)
	ExecuteQuery(ctx context.Context, params ExecuteQueryParams) (ExecuteQueryStream, error)
	ExplainQuery(ctx context.Context, params ExplainQueryParams) (*ExplainQueryResult, error)
	GetDatabaseQueryInsights(ctx context.Context) (*DatabaseQueryInsights, error)
	Close() error
}
