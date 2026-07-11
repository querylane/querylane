package engine

import (
	"context"
	"database/sql"

	"google.golang.org/protobuf/proto"

	"github.com/querylane/querylane/backend/aip"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

var (
	_ InstanceSession = (*instanceSession)(nil)
	_ DatabaseSession = (*databaseSession)(nil)
)

type instanceSession struct {
	cfg                   *api.PostgresConfig
	db                    *sql.DB
	pool                  *instancePool
	healthDriver          healthDriver
	probeDriver           probeDriver
	instanceCatalogDriver instanceCatalogDriver
	databaseCatalogDriver databaseCatalogDriver
	tablePartitionDriver  tablePartitionDriver
	tableDataDriver       tableDataDriver
	queryDriver           queryDriver
}

func (s *instanceSession) GetServerInfo(ctx context.Context) (*ServerInfo, error) {
	return s.healthDriver.GetServerInfo(ctx, s.db)
}

func (s *instanceSession) GetInstanceOverview(ctx context.Context) (*InstanceOverview, error) {
	return s.healthDriver.GetInstanceOverview(ctx, s.db)
}

func (s *instanceSession) CheckInstanceHealth(ctx context.Context) (*InstanceHealth, error) {
	return s.healthDriver.CheckInstanceHealth(ctx, s.db)
}

func (s *instanceSession) ListDatabases(ctx context.Context, params aip.Params) ([]Database, string, error) {
	return s.instanceCatalogDriver.ListDatabases(ctx, s.db, params)
}

func (s *instanceSession) GetDatabase(ctx context.Context, databaseName string) (*Database, error) {
	return s.instanceCatalogDriver.GetDatabase(ctx, s.db, databaseName)
}

func (s *instanceSession) ListRoles(ctx context.Context, params aip.Params) ([]Role, string, error) {
	return s.instanceCatalogDriver.ListRoles(ctx, s.db, params)
}

func (s *instanceSession) GetRole(ctx context.Context, roleName string) (*Role, error) {
	return s.instanceCatalogDriver.GetRole(ctx, s.db, roleName)
}

func (s *instanceSession) OpenDatabase(ctx context.Context, databaseName string) (DatabaseSession, error) {
	db, err := s.pool.getOrCreateDBPool(ctx, s.cfg, databaseName)
	if err != nil {
		return nil, err
	}

	return s.newDatabaseSession(db, nil), nil
}

func (s *instanceSession) Close() error { return nil }

func (s *instanceSession) newDatabaseSession(db *sql.DB, closeDB func() error) *databaseSession {
	return &databaseSession{
		db:                    db,
		closeDB:               closeDB,
		probeDriver:           s.probeDriver,
		databaseCatalogDriver: s.databaseCatalogDriver,
		tablePartitionDriver:  s.tablePartitionDriver,
		tableDataDriver:       s.tableDataDriver,
		queryDriver:           s.queryDriver,
	}
}

type databaseSession struct {
	db *sql.DB
	// closeDB is set only for ephemeral sessions that own their pool; pooled
	// sessions leave it nil because their pool is owned by the instancePool.
	closeDB               func() error
	probeDriver           probeDriver
	databaseCatalogDriver databaseCatalogDriver
	tablePartitionDriver  tablePartitionDriver
	tableDataDriver       tableDataDriver
	queryDriver           queryDriver
}

func (s *databaseSession) ListRoleGrants(ctx context.Context, roleName string, params aip.Params) ([]RoleGrant, string, error) {
	return s.databaseCatalogDriver.ListRoleGrants(ctx, s.db, roleName, params)
}

func (s *databaseSession) ListRoleOwnedObjects(ctx context.Context, roleName string, params aip.Params) ([]OwnedObject, string, error) {
	return s.databaseCatalogDriver.ListRoleOwnedObjects(ctx, s.db, roleName, params)
}

func (s *databaseSession) ListRoleDefaultPrivileges(ctx context.Context, roleName string, params aip.Params) ([]RoleDefaultPrivilege, string, error) {
	return s.databaseCatalogDriver.ListRoleDefaultPrivileges(ctx, s.db, roleName, params)
}

func (s *databaseSession) ListPublicGrants(ctx context.Context, params aip.Params) ([]RoleGrant, string, error) {
	return s.databaseCatalogDriver.ListPublicGrants(ctx, s.db, params)
}

func (s *databaseSession) ListSchemas(ctx context.Context, params aip.Params) ([]Schema, string, error) {
	return s.databaseCatalogDriver.ListSchemas(ctx, s.db, params)
}

func (s *databaseSession) GetSchema(ctx context.Context, schemaName string) (*Schema, error) {
	return s.databaseCatalogDriver.GetSchema(ctx, s.db, schemaName)
}

func (s *databaseSession) ListExtensions(ctx context.Context, params aip.Params) ([]Extension, string, error) {
	return s.databaseCatalogDriver.ListExtensions(ctx, s.db, params)
}

func (s *databaseSession) ListWorkflows(ctx context.Context, params aip.Params) ([]Workflow, string, error) {
	return s.databaseCatalogDriver.ListWorkflows(ctx, s.db, params)
}

func (s *databaseSession) GetWorkflow(ctx context.Context, workflowID string) (*Workflow, error) {
	return s.databaseCatalogDriver.GetWorkflow(ctx, s.db, workflowID)
}

func (s *databaseSession) ListWorkflowNodes(ctx context.Context, workflowID string, params aip.Params) ([]WorkflowNode, string, error) {
	return s.databaseCatalogDriver.ListWorkflowNodes(ctx, s.db, workflowID, params)
}

func (s *databaseSession) ListTables(ctx context.Context, schemaName string, params aip.Params) ([]Table, string, error) {
	return s.databaseCatalogDriver.ListTables(ctx, s.db, schemaName, params)
}

func (s *databaseSession) GetTable(ctx context.Context, schemaName, tableName string) (*Table, error) {
	return s.databaseCatalogDriver.GetTable(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) GetTablePartitionMetadata(ctx context.Context, schemaName, tableName string) (*TablePartitionMetadata, error) {
	return s.tablePartitionDriver.GetTablePartitionMetadata(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListTableColumns(ctx context.Context, schemaName, tableName string) ([]Column, error) {
	return s.databaseCatalogDriver.ListTableColumns(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListTableConstraints(ctx context.Context, schemaName, tableName string) ([]TableConstraint, error) {
	return s.databaseCatalogDriver.ListTableConstraints(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListTableIndexes(ctx context.Context, schemaName, tableName string) ([]TableIndex, error) {
	return s.databaseCatalogDriver.ListTableIndexes(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListTablePolicies(ctx context.Context, schemaName, tableName string) ([]TablePolicy, error) {
	return s.databaseCatalogDriver.ListTablePolicies(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListTableTriggers(ctx context.Context, schemaName, tableName string) ([]TableTrigger, error) {
	return s.databaseCatalogDriver.ListTableTriggers(ctx, s.db, schemaName, tableName)
}

func (s *databaseSession) ListViews(ctx context.Context, schemaName string, params aip.Params) ([]View, string, error) {
	return s.databaseCatalogDriver.ListViews(ctx, s.db, schemaName, params)
}

func (s *databaseSession) GetView(ctx context.Context, schemaName, viewName string) (*View, error) {
	return s.databaseCatalogDriver.GetView(ctx, s.db, schemaName, viewName)
}

func (s *databaseSession) ReadRows(ctx context.Context, params ReadRowsParams) (*ReadRowsResult, error) {
	return s.tableDataDriver.ReadRows(ctx, s.db, params)
}

func (s *databaseSession) ReadCellValue(ctx context.Context, params ReadCellValueParams) (*ReadCellValueResult, error) {
	return s.tableDataDriver.ReadCellValue(ctx, s.db, params)
}

func (s *databaseSession) GetDatabaseQueryInsights(ctx context.Context) (*DatabaseQueryInsights, error) {
	return s.queryDriver.GetDatabaseQueryInsights(ctx, s.db)
}

func (s *databaseSession) ExecuteQuery(ctx context.Context, params ExecuteQueryParams) (ExecuteQueryStream, error) {
	return s.queryDriver.ExecuteQuery(ctx, s.db, params)
}

func (s *databaseSession) ExplainQuery(ctx context.Context, params ExplainQueryParams) (*ExplainQueryResult, error) {
	return s.queryDriver.ExplainQuery(ctx, s.db, params)
}

// Close releases an ephemeral session's private pool. For pooled sessions it
// is a no-op: their pools are owned by the instancePool and intentionally
// outlive request-scoped sessions.
func (s *databaseSession) Close() error {
	if s.closeDB != nil {
		return s.closeDB()
	}

	return nil
}

func clonePostgresConfig(cfg *api.PostgresConfig) *api.PostgresConfig {
	if cfg == nil {
		return nil
	}

	clonedCfg, ok := proto.Clone(cfg).(*api.PostgresConfig)
	if !ok {
		return nil
	}

	return clonedCfg
}
