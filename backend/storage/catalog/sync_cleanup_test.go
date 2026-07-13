package catalog_test

import (
	"context"
	"database/sql"
	"errors"
	"iter"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/types"
)

func oneCatalogPage[T any](rows []T) iter.Seq2[[]T, error] {
	return func(yield func([]T, error) bool) {
		yield(rows, nil)
	}
}

func syncDatabases(ctx context.Context, repo *catalog.PGRepository, instanceID string, rows []model.CatalogDatabase) error {
	syncedAt := time.Now()
	if len(rows) > 0 {
		syncedAt = rows[0].SyncedAt
	}

	return repo.SyncDatabasePages(ctx, instanceID, syncedAt, oneCatalogPage(rows))
}

func syncSchemas(ctx context.Context, repo *catalog.PGRepository, instanceID, databaseName string, rows []model.CatalogSchema) error {
	syncedAt := time.Now()
	if len(rows) > 0 {
		syncedAt = rows[0].SyncedAt
	}

	return repo.SyncSchemaPages(ctx, instanceID, databaseName, syncedAt, oneCatalogPage(rows))
}

func syncTables(ctx context.Context, repo *catalog.PGRepository, instanceID, databaseName, schemaName string, rows []model.CatalogTable) error {
	syncedAt := time.Now()
	if len(rows) > 0 {
		syncedAt = rows[0].SyncedAt
	}

	return repo.SyncTablePages(ctx, instanceID, databaseName, schemaName, syncedAt, oneCatalogPage(rows))
}

func syncViews(ctx context.Context, repo *catalog.PGRepository, instanceID, databaseName, schemaName string, rows []model.CatalogView) error {
	return repo.SyncViewPages(ctx, instanceID, databaseName, schemaName, oneCatalogPage(rows))
}

func TestIntegrationCatalogRepositorySyncDatabasePagesRollsBackOnLaterPageError(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	now := time.Now().UTC()

	require.NoError(t, syncDatabases(ctx, repo, "inst1", []model.CatalogDatabase{{
		InstanceID: "inst1",
		Name:       "existing",
		SyncedAt:   now,
	}}))

	pageErr := errors.New("later page failed")
	err := repo.SyncDatabasePages(ctx, "inst1", now.Add(time.Second), func(yield func([]model.CatalogDatabase, error) bool) {
		if !yield([]model.CatalogDatabase{{
			InstanceID: "inst1",
			Name:       "partial",
		}}, nil) {
			return
		}

		yield(nil, pageErr)
	})
	require.ErrorIs(t, err, pageErr)
	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_database", "instance_id = $1 AND name = $2", "inst1", "existing"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_database", "instance_id = $1 AND name = $2", "inst1", "partial"))
}

func TestIntegrationCatalogRepositorySyncDatabasePagesUsesUniqueRunMarker(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	now := time.Now().UTC().Truncate(time.Microsecond)

	require.NoError(t, repo.SyncDatabasePages(ctx, "inst1", now, oneCatalogPage([]model.CatalogDatabase{
		{InstanceID: "inst1", Name: "kept"},
		{InstanceID: "inst1", Name: "departed"},
	})))
	require.NoError(t, repo.SyncDatabasePages(ctx, "inst1", now, oneCatalogPage([]model.CatalogDatabase{
		{InstanceID: "inst1", Name: "kept"},
	})))

	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_database", "instance_id = $1 AND name = $2", "inst1", "kept"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_database", "instance_id = $1 AND name = $2", "inst1", "departed"))
}

func TestIntegrationCatalogRepositorySyncTablePagesBatchesLargeDepartedCatalog(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())

	_, err := testDB.DB().ExecContext(ctx, `
		INSERT INTO catalog_table (instance_id, database_name, schema_name, name)
		SELECT 'inst1', 'db1', 'public', 'table-' || i
		FROM generate_series(1, 66000) AS i
	`)
	require.NoError(t, err)

	require.NoError(t, repo.SyncTablePages(
		ctx,
		"inst1",
		"db1",
		"public",
		time.Now(),
		oneCatalogPage([]model.CatalogTable{}),
	))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table", "instance_id = $1", "inst1"))
}

func TestIntegrationCatalogRepositorySyncTablePagesEscapesWildcardScopes(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	now := time.Now().UTC()

	require.NoError(t, syncTables(ctx, repo, "inst1", "db1", "public", []model.CatalogTable{
		{InstanceID: "inst1", DatabaseName: "db1", SchemaName: "public", Name: "gone_%", SyncedAt: now},
		{InstanceID: "inst1", DatabaseName: "db1", SchemaName: "public", Name: "gone_AX", SyncedAt: now},
	}))

	departedScope := resource.NewTableName("inst1", "db1", "public", "gone_%").String() + "/columns"
	keptScope := resource.NewTableName("inst1", "db1", "public", "gone_AX").String() + "/columns"

	insertSyncState(t, ctx, testDB.DB(), departedScope)
	insertSyncState(t, ctx, testDB.DB(), keptScope)

	require.NoError(t, syncTables(ctx, repo, "inst1", "db1", "public", []model.CatalogTable{
		{InstanceID: "inst1", DatabaseName: "db1", SchemaName: "public", Name: "gone_AX", SyncedAt: now.Add(time.Second)},
	}))

	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope = $1", departedScope))
	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope = $1", keptScope))
}

func TestIntegrationCatalogRepositorySyncSchemasClearsDescendants(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	now := time.Now().UTC()

	require.NoError(t, syncSchemas(ctx, repo, "inst1", "db1", []model.CatalogSchema{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		Name:         "public",
		DisplayName:  "public",
		Owner:        "postgres",
		SyncedAt:     now,
	}}))
	require.NoError(t, syncTables(ctx, repo, "inst1", "db1", "public", []model.CatalogTable{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		Name:         "users",
		DisplayName:  "users",
		TableType:    "BASE TABLE",
		Owner:        "postgres",
		SyncedAt:     now,
	}}))
	require.NoError(t, repo.SyncColumns(ctx, "inst1", "db1", "public", "users", []model.CatalogColumn{{
		InstanceID:      "inst1",
		DatabaseName:    "db1",
		SchemaName:      "public",
		TableName:       "users",
		Name:            "id",
		OrdinalPosition: 1,
		RawType:         "int8",
		SyncedAt:        now,
	}}))
	require.NoError(t, syncViews(ctx, repo, "inst1", "db1", "public", []model.CatalogView{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		Name:         "active_users",
		DisplayName:  "active_users",
		Owner:        "postgres",
		Definition:   "SELECT 1",
		SyncedAt:     now,
	}}))
	require.NoError(t, repo.SyncTableConstraints(ctx, "inst1", "db1", "public", "users", []model.CatalogTableConstraint{{
		InstanceID:            "inst1",
		DatabaseName:          "db1",
		SchemaName:            "public",
		TableName:             "users",
		Name:                  "users_pkey",
		ColumnNames:           types.StringArray{"id"},
		ReferencedColumnNames: types.StringArray{},
		SyncedAt:              now,
	}}))
	require.NoError(t, repo.SyncTableIndexes(ctx, "inst1", "db1", "public", "users", []model.CatalogTableIndex{{
		InstanceID:      "inst1",
		DatabaseName:    "db1",
		SchemaName:      "public",
		TableName:       "users",
		Name:            "users_pkey",
		Method:          "btree",
		KeyColumns:      types.StringArray{"id"},
		IncludedColumns: types.StringArray{},
		SyncedAt:        now,
	}}))
	require.NoError(t, repo.SyncTablePolicies(ctx, "inst1", "db1", "public", "users", []model.CatalogTablePolicy{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		TableName:    "users",
		Name:         "users_policy",
		Roles:        types.StringArray{"public"},
		SyncedAt:     now,
	}}))
	require.NoError(t, repo.SyncTableTriggers(ctx, "inst1", "db1", "public", "users", []model.CatalogTableTrigger{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		TableName:    "users",
		Name:         "users_trigger",
		Timing:       "BEFORE",
		Events:       types.StringArray{"INSERT"},
		FunctionName: "public.fn_users",
		SyncedAt:     now,
	}}))

	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas")
	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/tables")
	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/tables/users/columns")
	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/views")

	require.NoError(t, syncSchemas(ctx, repo, "inst1", "db1", []model.CatalogSchema{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		Name:         "archive",
		DisplayName:  "archive",
		Owner:        "postgres",
		SyncedAt:     now.Add(time.Second),
	}}))

	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_column", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_view", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_constraint", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_index", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_policy", "instance_id = $1 AND database_name = $2", "inst1", "db1"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_trigger", "instance_id = $1 AND database_name = $2", "inst1", "db1"))

	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope = $1", "instances/inst1/databases/db1/schemas"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope LIKE $1", "instances/inst1/databases/db1/schemas/%"))
}

func TestIntegrationCatalogRepositorySyncTablesClearsDescendants(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	now := time.Now().UTC()

	require.NoError(t, syncTables(ctx, repo, "inst1", "db1", "public", []model.CatalogTable{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		Name:         "users",
		DisplayName:  "users",
		TableType:    "BASE TABLE",
		Owner:        "postgres",
		SyncedAt:     now,
	}}))
	require.NoError(t, repo.SyncColumns(ctx, "inst1", "db1", "public", "users", []model.CatalogColumn{{
		InstanceID:      "inst1",
		DatabaseName:    "db1",
		SchemaName:      "public",
		TableName:       "users",
		Name:            "id",
		OrdinalPosition: 1,
		RawType:         "int8",
		SyncedAt:        now,
	}}))
	require.NoError(t, repo.SyncTableConstraints(ctx, "inst1", "db1", "public", "users", []model.CatalogTableConstraint{{
		InstanceID:            "inst1",
		DatabaseName:          "db1",
		SchemaName:            "public",
		TableName:             "users",
		Name:                  "users_pkey",
		ColumnNames:           types.StringArray{"id"},
		ReferencedColumnNames: types.StringArray{},
		SyncedAt:              now,
	}}))
	require.NoError(t, repo.SyncTableIndexes(ctx, "inst1", "db1", "public", "users", []model.CatalogTableIndex{{
		InstanceID:      "inst1",
		DatabaseName:    "db1",
		SchemaName:      "public",
		TableName:       "users",
		Name:            "users_pkey",
		Method:          "btree",
		KeyColumns:      types.StringArray{"id"},
		IncludedColumns: types.StringArray{},
		SyncedAt:        now,
	}}))
	require.NoError(t, repo.SyncTablePolicies(ctx, "inst1", "db1", "public", "users", []model.CatalogTablePolicy{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		TableName:    "users",
		Name:         "users_policy",
		Roles:        types.StringArray{"public"},
		SyncedAt:     now,
	}}))
	require.NoError(t, repo.SyncTableTriggers(ctx, "inst1", "db1", "public", "users", []model.CatalogTableTrigger{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		TableName:    "users",
		Name:         "users_trigger",
		Timing:       "BEFORE",
		Events:       types.StringArray{"INSERT"},
		FunctionName: "public.fn_users",
		SyncedAt:     now,
	}}))

	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/tables")
	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/tables/users/columns")
	insertSyncState(t, ctx, testDB.DB(), "instances/inst1/databases/db1/schemas/public/tables/users/constraints")

	require.NoError(t, syncTables(ctx, repo, "inst1", "db1", "public", []model.CatalogTable{{
		InstanceID:   "inst1",
		DatabaseName: "db1",
		SchemaName:   "public",
		Name:         "customers",
		DisplayName:  "customers",
		TableType:    "BASE TABLE",
		Owner:        "postgres",
		SyncedAt:     now.Add(time.Second),
	}}))

	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_column", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_constraint", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_index", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_policy", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_table_trigger", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_table", "instance_id = $1 AND database_name = $2 AND schema_name = $3", "inst1", "db1", "public"))
	require.Equal(t, 1, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope = $1", "instances/inst1/databases/db1/schemas/public/tables"))
	require.Equal(t, 0, countRows(t, ctx, testDB.DB(), "catalog_sync_state", "scope LIKE $1", "instances/inst1/databases/db1/schemas/public/tables/%"))
}

func insertSyncState(t *testing.T, ctx context.Context, db *sql.DB, scope string) { //nolint:revive // ctx after *testing.T is intentional for test helpers
	t.Helper()

	_, err := db.ExecContext(ctx, "\n\t\tINSERT INTO catalog_sync_state (scope, status, last_synced_at, created_at, updated_at)\n\t\tVALUES ($1, 'synced', NOW(), NOW(), NOW())\n\t", scope) //nolint:dupword // SQL VALUES are intentionally repeated
	require.NoError(t, err)
}

func countRows(t *testing.T, ctx context.Context, db *sql.DB, tableName, where string, args ...any) int { //nolint:revive // ctx after *testing.T is intentional for test helpers
	t.Helper()

	query := "SELECT COUNT(*) FROM " + tableName
	if where != "" {
		query += " WHERE " + where
	}

	var count int
	require.NoError(t, db.QueryRowContext(ctx, query, args...).Scan(&count))

	return count
}
