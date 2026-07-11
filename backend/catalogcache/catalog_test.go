package catalogcache

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
)

// mockInstanceSession implements engine.InstanceSession for testing.
type mockInstanceSession struct {
	databases   []engine.Database
	dbSessions  map[string]*mockDatabaseSession
	listDBErr   error
	listDBCalls int
	syncCh      chan struct{} // if non-nil, ListDatabases blocks until signaled
	startedCh   chan struct{} // if non-nil, signaled (closed) when ListDatabases is entered
}

func (m *mockInstanceSession) ListDatabases(ctx context.Context, _ aip.Params) ([]engine.Database, string, error) {
	m.listDBCalls++

	if m.syncCh != nil {
		if m.startedCh != nil {
			select {
			case <-m.startedCh:
			default:
				close(m.startedCh)
			}
		}

		select {
		case <-m.syncCh:
		case <-ctx.Done():
			return nil, "", ctx.Err()
		}
	}

	if m.listDBErr != nil {
		return nil, "", m.listDBErr
	}

	return m.databases, "", nil
}

func (m *mockInstanceSession) ListRoles(_ context.Context, _ aip.Params) ([]engine.Role, string, error) {
	return nil, "", nil
}

func (m *mockInstanceSession) GetRole(_ context.Context, _ string) (*engine.Role, error) {
	return nil, nil //nolint:nilnil // Test mock intentionally returns zero values
}

func (m *mockInstanceSession) GetServerInfo(_ context.Context) (*engine.ServerInfo, error) {
	return &engine.ServerInfo{}, nil
}

func (m *mockInstanceSession) GetInstanceOverview(_ context.Context) (*engine.InstanceOverview, error) {
	return &engine.InstanceOverview{}, nil
}

func (m *mockInstanceSession) CheckInstanceHealth(_ context.Context) (*engine.InstanceHealth, error) {
	return &engine.InstanceHealth{}, nil
}

// Prober is never exercised by catalog tests; the probe surface lives on a
// separate interface precisely so this fake ignores it.
func (m *mockInstanceSession) Prober() engine.InstanceProber { return nil }

func (m *mockInstanceSession) GetDatabase(_ context.Context, name string) (*engine.Database, error) {
	for _, db := range m.databases {
		if db.Name == name {
			return &db, nil
		}
	}

	return nil, engine.ErrDatabaseNotFound
}

func (m *mockInstanceSession) OpenDatabase(_ context.Context, name string) (engine.DatabaseSession, error) {
	if s, ok := m.dbSessions[name]; ok {
		return s, nil
	}

	return nil, engine.ErrDatabaseNotFound
}

func (m *mockInstanceSession) Close() error { return nil }

// mockDatabaseSession implements engine.DatabaseSession for testing.
type mockDatabaseSession struct {
	schemas               []engine.Schema
	tables                map[string][]engine.Table  // keyed by schema name
	columns               map[string][]engine.Column // keyed by "schema/table"
	listSchemasCalls      int
	getSchemaCalls        int
	listTablesCalls       int
	getTableCalls         int
	listTableColumnsCalls int
	listTablesErr         error
	tableSyncCh           chan struct{}
	tableStartedCh        chan struct{}
}

// Prober is never exercised by catalog tests.
func (m *mockDatabaseSession) Prober() engine.DatabaseProber { return nil }

func (m *mockDatabaseSession) ListRoleGrants(_ context.Context, _ string, _ aip.Params) ([]engine.RoleGrant, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListRoleOwnedObjects(_ context.Context, _ string, _ aip.Params) ([]engine.OwnedObject, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListRoleDefaultPrivileges(_ context.Context, _ string, _ aip.Params) ([]engine.RoleDefaultPrivilege, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListPublicGrants(_ context.Context, _ aip.Params) ([]engine.RoleGrant, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListSchemas(_ context.Context, _ aip.Params) ([]engine.Schema, string, error) {
	m.listSchemasCalls++
	return m.schemas, "", nil
}

func (m *mockDatabaseSession) GetSchema(_ context.Context, name string) (*engine.Schema, error) {
	m.getSchemaCalls++

	for _, s := range m.schemas {
		if s.Name == name {
			return &s, nil
		}
	}

	return nil, engine.ErrSchemaNotFound
}

func (m *mockDatabaseSession) ListExtensions(_ context.Context, _ aip.Params) ([]engine.Extension, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListWorkflows(_ context.Context, _ aip.Params) ([]engine.Workflow, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) GetWorkflow(_ context.Context, _ string) (*engine.Workflow, error) {
	return nil, engine.ErrWorkflowNotFound
}

func (m *mockDatabaseSession) ListWorkflowNodes(_ context.Context, _ string, _ aip.Params) ([]engine.WorkflowNode, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) ListTables(ctx context.Context, schemaName string, _ aip.Params) ([]engine.Table, string, error) {
	m.listTablesCalls++

	if m.tableSyncCh != nil {
		if m.tableStartedCh != nil {
			select {
			case <-m.tableStartedCh:
			default:
				close(m.tableStartedCh)
			}
		}

		select {
		case <-m.tableSyncCh:
		case <-ctx.Done():
			return nil, "", ctx.Err()
		}
	}

	if m.listTablesErr != nil {
		return nil, "", m.listTablesErr
	}

	return m.tables[schemaName], "", nil
}

func (m *mockDatabaseSession) GetTable(_ context.Context, schemaName, tableName string) (*engine.Table, error) {
	m.getTableCalls++

	for _, t := range m.tables[schemaName] {
		if t.Name == tableName {
			return &t, nil
		}
	}

	return nil, engine.ErrTableNotFound
}

func (m *mockDatabaseSession) GetTablePartitionMetadata(_ context.Context, _, _ string) (*engine.TablePartitionMetadata, error) {
	return &engine.TablePartitionMetadata{}, nil
}

func (m *mockDatabaseSession) ListTableColumns(_ context.Context, schemaName, tableName string) ([]engine.Column, error) {
	m.listTableColumnsCalls++

	key := schemaName + "/" + tableName

	return m.columns[key], nil
}

func (m *mockDatabaseSession) ListTableConstraints(_ context.Context, _, _ string) ([]engine.TableConstraint, error) {
	return nil, nil
}

func (m *mockDatabaseSession) ListTableIndexes(_ context.Context, _, _ string) ([]engine.TableIndex, error) {
	return nil, nil
}

func (m *mockDatabaseSession) ListTablePolicies(_ context.Context, _, _ string) ([]engine.TablePolicy, error) {
	return nil, nil
}

func (m *mockDatabaseSession) ListTableTriggers(_ context.Context, _, _ string) ([]engine.TableTrigger, error) {
	return nil, nil
}

func (m *mockDatabaseSession) ListViews(_ context.Context, _ string, _ aip.Params) ([]engine.View, string, error) {
	return nil, "", nil
}

func (m *mockDatabaseSession) GetView(_ context.Context, _, _ string) (*engine.View, error) {
	return nil, engine.ErrViewNotFound
}

func (m *mockDatabaseSession) ReadRows(_ context.Context, _ engine.ReadRowsParams) (*engine.ReadRowsResult, error) {
	return nil, nil //nolint:nilnil // test mock
}

func (m *mockDatabaseSession) ReadCellValue(_ context.Context, _ engine.ReadCellValueParams) (*engine.ReadCellValueResult, error) {
	return nil, nil //nolint:nilnil // test mock
}

func (m *mockDatabaseSession) ExecuteQuery(_ context.Context, _ engine.ExecuteQueryParams) (engine.ExecuteQueryStream, error) {
	return nil, nil //nolint:nilnil // test mock
}

func (m *mockDatabaseSession) ExplainQuery(_ context.Context, _ engine.ExplainQueryParams) (*engine.ExplainQueryResult, error) {
	return nil, nil //nolint:nilnil // test mock
}

func (m *mockDatabaseSession) GetDatabaseQueryInsights(_ context.Context) (*engine.DatabaseQueryInsights, error) {
	return nil, nil //nolint:nilnil // test mock
}

func (m *mockDatabaseSession) Close() error { return nil }

// mockEngine implements instanceSessionOpener for testing.
type mockEngine struct {
	sessions  map[string]*mockInstanceSession
	callCount int
}

func (m *mockEngine) OpenInstance(_ context.Context, name resource.InstanceName) (engine.InstanceSession, error) {
	m.callCount++

	if s, ok := m.sessions[name.InstanceID]; ok {
		return s, nil
	}

	return nil, engine.ErrDatabaseNotFound
}

func newTestCatalog(t *testing.T, eng *mockEngine, cfg Config) *Catalog {
	t.Helper()

	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	syncStore := catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout)

	return New(cfg, repo, syncStore, eng)
}

func TestIntegrationListDatabases(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{
					{Name: "db1", DisplayName: "Database 1", Owner: "postgres"},
					{Name: "db2", DisplayName: "Database 2", Owner: "admin", IsSystemDatabase: true},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, Config{
		StalenessThreshold: 60 * time.Second,
		SyncTimeout:        30 * time.Second,
		SyncLockTimeout:    5 * time.Minute,
	})

	// First call triggers sync
	databases, nextToken, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Empty(t, nextToken)
	assert.Len(t, databases, 2)
	assert.Equal(t, "db1", databases[0].Name)
	assert.Equal(t, "Database 1", databases[0].DisplayName)
	assert.Equal(t, "postgres", databases[0].Owner)
	assert.Equal(t, "db2", databases[1].Name)
	assert.True(t, databases[1].IsSystemDatabase)

	// Second call uses cache (engine should not be called again)
	initialCallCount := eng.callCount
	databases, _, err = cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Len(t, databases, 2)
	assert.Equal(t, initialCallCount, eng.callCount)

	// Force refresh bypasses cache
	refreshCtx := WithForceRefresh(ctx)
	databases, _, err = cat.ListDatabases(refreshCtx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Len(t, databases, 2)
	assert.Greater(t, eng.callCount, initialCallCount)
}

func TestIntegrationGetDatabase(t *testing.T) { //nolint:tparallel // subtests share a sync lock and must run sequentially
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{
					{Name: "mydb", DisplayName: "My Database", Owner: "user1", CharacterSet: "UTF8", Collation: "en_US.UTF-8"},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	// Subtests are sequential: they share a catalog whose sync lock causes
	// a race when both run in parallel (the loser sees empty data).
	t.Run("found", func(t *testing.T) { //nolint:paralleltest // shared sync lock
		db, err := cat.GetDatabase(ctx, resource.NewDatabaseName("inst1", "mydb"))
		require.NoError(t, err)
		assert.Equal(t, "mydb", db.Name)
		assert.Equal(t, "My Database", db.DisplayName)
		assert.Equal(t, "user1", db.Owner)
		assert.Equal(t, "UTF8", db.CharacterSet)
		assert.Equal(t, "en_US.UTF-8", db.Collation)
	})

	t.Run("not found", func(t *testing.T) { //nolint:paralleltest // shared sync lock
		_, err := cat.GetDatabase(ctx, resource.NewDatabaseName("inst1", "nonexistent"))
		assert.ErrorIs(t, err, engine.ErrDatabaseNotFound)
	})
}

func TestIntegrationListSchemas(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": {
						schemas: []engine.Schema{
							{Name: "public", DisplayName: "Public", Owner: "postgres"},
							{Name: "pg_catalog", Owner: "postgres", IsSystemSchema: true},
						},
					},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	schemas, _, err := cat.ListSchemas(ctx, resource.NewDatabaseName("inst1", "mydb"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Len(t, schemas, 2)
	assert.Equal(t, "pg_catalog", schemas[0].Name) // alphabetical order
	assert.True(t, schemas[0].IsSystemSchema)
	assert.Equal(t, "public", schemas[1].Name)
}

func TestIntegrationListTables(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": {
						tables: map[string][]engine.Table{
							"public": {
								{Name: "users", Owner: "admin", RowCount: 100, SizeBytes: 8192},
								{Name: "orders", Owner: "admin", RowCount: 500},
							},
						},
					},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	tables, _, err := cat.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "public"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Len(t, tables, 2)
	assert.Equal(t, "orders", tables[0].Name) // alphabetical
	assert.Equal(t, "users", tables[1].Name)
	assert.Equal(t, int64(100), tables[1].RowCount)
	assert.Equal(t, int64(8192), tables[1].SizeBytes)
}

func TestIntegrationListTablesDoesNotSyncParentCollections(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables: map[string][]engine.Table{
			"public": {{Name: "users"}},
		},
	}
	instSession := &mockInstanceSession{
		databases: []engine.Database{{Name: "mydb"}},
		dbSessions: map[string]*mockDatabaseSession{
			"mydb": dbSession,
		},
	}
	eng := &mockEngine{sessions: map[string]*mockInstanceSession{"inst1": instSession}}

	cat := newTestCatalog(t, eng, DefaultConfig())

	tables, _, err := cat.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "public"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, tables, 1)
	assert.Equal(t, 0, instSession.listDBCalls, "table listing should not sync databases for parent validation")
	assert.Equal(t, 0, dbSession.listSchemasCalls, "table listing should not sync schemas for parent validation")
	assert.Equal(t, 1, dbSession.listTablesCalls, "table listing should sync only the requested tables scope")
}

func TestIntegrationListTablesMissingSchemaReturnsSchemaNotFound(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": dbSession,
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	_, _, err := cat.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "missing"), aip.Params{PageSize: 10})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrSchemaNotFound)
	assert.Equal(t, 0, dbSession.listSchemasCalls, "missing schema should be resolved with a targeted probe, not a schema collection sync")
	assert.Equal(t, 1, dbSession.getSchemaCalls)
}

func TestIntegrationListTablesUsesFreshSchemaCacheToDisambiguateMissingSchema(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": dbSession,
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	_, _, err := cat.ListSchemas(ctx, resource.NewDatabaseName("inst1", "mydb"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Equal(t, 1, dbSession.listSchemasCalls)

	_, _, err = cat.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "missing"), aip.Params{PageSize: 10})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrSchemaNotFound)
	assert.Equal(t, 1, dbSession.listSchemasCalls, "fresh schema cache should avoid a live schema probe")
	assert.Equal(t, 0, dbSession.getSchemaCalls)
}

func TestIntegrationGetTableMissingSchemaReturnsSchemaNotFound(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": dbSession,
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	_, err := cat.GetTable(ctx, resource.NewTableName("inst1", "mydb", "missing", "users"))
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrSchemaNotFound)
	assert.Equal(t, 1, dbSession.getSchemaCalls)
	assert.Equal(t, 0, dbSession.listSchemasCalls)
}

func TestIntegrationListTableConstraintsMissingTableReturnsTableNotFound(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{"public": {}},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": dbSession,
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	_, err := cat.ListTableConstraints(ctx, resource.NewTableName("inst1", "mydb", "public", "users"))
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrTableNotFound)
	assert.Equal(t, 1, dbSession.getSchemaCalls)
	assert.Equal(t, 1, dbSession.getTableCalls)
	assert.Equal(t, 0, dbSession.listTablesCalls)
}

func TestIntegrationListTablesConcurrentColdMissHasSingleSyncWinner(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	tableStartedCh := make(chan struct{})
	tableSyncCh := make(chan struct{})
	dbSession := &mockDatabaseSession{
		schemas:        []engine.Schema{{Name: "public"}},
		tables:         map[string][]engine.Table{"public": {{Name: "users"}}},
		tableStartedCh: tableStartedCh,
		tableSyncCh:    tableSyncCh,
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": dbSession,
				},
			},
		},
	}

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	repo := catalog.New(testDB.DB())
	cfg := DefaultConfig()
	cat1 := New(cfg, repo, catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout), eng)
	cat2 := New(cfg, repo, catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout), eng)
	errs := make(chan error, 2)

	go func() {
		_, _, err := cat1.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "public"), aip.Params{PageSize: 10})
		errs <- err
	}()

	select {
	case <-tableStartedCh:
	case <-ctx.Done():
		t.Fatal("timed out waiting for first table sync to start")
	}

	go func() {
		_, _, err := cat2.ListTables(ctx, resource.NewSchemaName("inst1", "mydb", "public"), aip.Params{PageSize: 10})
		errs <- err
	}()

	close(tableSyncCh)

	for range 2 {
		require.NoError(t, <-errs)
	}

	assert.Equal(t, 1, dbSession.listTablesCalls, "concurrent cold misses should share one table sync")
	assert.Equal(t, 0, dbSession.listSchemasCalls)
}

func TestIntegrationListTableColumns(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{
					"mydb": {
						columns: map[string][]engine.Column{
							"public/users": {
								{Name: "id", OrdinalPosition: 1, DataType: 1, RawType: "integer", IsPrimaryKey: true},
								{Name: "name", OrdinalPosition: 2, DataType: 2, RawType: "text", IsNullable: true},
								{Name: "email", OrdinalPosition: 3, DataType: 2, RawType: "varchar", CharacterMaximumLength: 255, IsUnique: true},
							},
						},
					},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	tblName := resource.NewTableName("inst1", "mydb", "public", "users")
	columns, err := cat.ListTableColumns(ctx, tblName)
	require.NoError(t, err)
	assert.Len(t, columns, 3)
	assert.Equal(t, "id", columns[0].Name)
	assert.Equal(t, int32(1), columns[0].OrdinalPosition)
	assert.True(t, columns[0].IsPrimaryKey)
	assert.Equal(t, "name", columns[1].Name)
	assert.True(t, columns[1].IsNullable)
	assert.Equal(t, "email", columns[2].Name)
	assert.Equal(t, int32(255), columns[2].CharacterMaximumLength)
	assert.True(t, columns[2].IsUnique)
}

func TestIntegrationInvalidateInstance(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{
					{Name: "db1"},
				},
				dbSessions: map[string]*mockDatabaseSession{
					"db1": {
						schemas: []engine.Schema{{Name: "public"}},
					},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	// Populate the catalog
	_, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	_, _, err = cat.ListSchemas(ctx, resource.NewDatabaseName("inst1", "db1"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	// Invalidate
	err = cat.InvalidateInstance(ctx, resource.NewInstanceName("inst1"))
	require.NoError(t, err)

	// Next call should trigger a fresh sync (engine called again)
	callsBefore := eng.callCount
	_, _, err = cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Greater(t, eng.callCount, callsBefore, "should have re-synced after invalidation")
}

func TestIntegrationStalenessTriggersResync(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{
					{Name: "db1"},
				},
			},
		},
	}

	// Use a very short staleness threshold
	cat := newTestCatalog(t, eng, Config{
		StalenessThreshold: 1 * time.Millisecond,
		SyncTimeout:        30 * time.Second,
		SyncLockTimeout:    5 * time.Minute,
	})

	// First call syncs
	_, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	callsAfterFirst := eng.callCount

	// Wait for staleness
	time.Sleep(5 * time.Millisecond)

	// Second call should trigger re-sync
	_, _, err = cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Greater(t, eng.callCount, callsAfterFirst, "should have re-synced after staleness")
}

func TestIntegrationEagerCleanup(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	// First sync: instance has two databases
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{
					{Name: "db1"},
					{Name: "db2"},
				},
				dbSessions: map[string]*mockDatabaseSession{
					"db1": {schemas: []engine.Schema{{Name: "public"}}},
					"db2": {schemas: []engine.Schema{{Name: "public"}}},
				},
			},
		},
	}

	cat := newTestCatalog(t, eng, Config{
		StalenessThreshold: 1 * time.Millisecond,
		SyncTimeout:        30 * time.Second,
		SyncLockTimeout:    5 * time.Minute,
	})

	// Populate catalog with databases and schemas
	_, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	_, _, err = cat.ListSchemas(ctx, resource.NewDatabaseName("inst1", "db1"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	_, _, err = cat.ListSchemas(ctx, resource.NewDatabaseName("inst1", "db2"), aip.Params{PageSize: 10})
	require.NoError(t, err)

	// Now db2 is removed from the instance
	eng.sessions["inst1"].databases = []engine.Database{{Name: "db1"}}

	time.Sleep(5 * time.Millisecond)

	// Re-sync databases — should eagerly clean up db2's child rows
	dbs, _, err := cat.ListDatabases(WithForceRefresh(ctx), resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	assert.Len(t, dbs, 1)
	assert.Equal(t, "db1", dbs[0].Name)
}
