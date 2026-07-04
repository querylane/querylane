package catalog

import (
	"context"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// InvalidateInstance removes every cached row and catalog_sync_state entry
// under the instance so the next read triggers a fresh sync.
func (r *PGRepository) InvalidateInstance(ctx context.Context, instanceID string) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		instStr := postgres.String(instanceID)

		// Capture database/schema/table names under this instance so we can
		// build the exact set of catalog_sync_state scopes to delete. Instance
		// IDs are NOT validation-constrained against '%' or '_' at the API
		// layer, so a LIKE pattern over instanceID could over-match siblings.
		// We follow the same explicit-scope-list pattern as InvalidateDatabase.
		var databases []model.CatalogDatabase
		if err := postgres.SELECT(table.CatalogDatabase.Name).
			FROM(table.CatalogDatabase).
			WHERE(table.CatalogDatabase.InstanceID.EQ(instStr)).
			QueryContext(ctx, tx, &databases); err != nil {
			return fmt.Errorf("list databases to invalidate: %w", err)
		}

		var schemas []model.CatalogSchema
		if err := postgres.SELECT(table.CatalogSchema.DatabaseName, table.CatalogSchema.Name).
			FROM(table.CatalogSchema).
			WHERE(table.CatalogSchema.InstanceID.EQ(instStr)).
			QueryContext(ctx, tx, &schemas); err != nil {
			return fmt.Errorf("list schemas to invalidate: %w", err)
		}

		var tables []model.CatalogTable
		if err := postgres.SELECT(table.CatalogTable.DatabaseName, table.CatalogTable.SchemaName_, table.CatalogTable.Name).
			FROM(table.CatalogTable).
			WHERE(table.CatalogTable.InstanceID.EQ(instStr)).
			QueryContext(ctx, tx, &tables); err != nil {
			return fmt.Errorf("list tables to invalidate: %w", err)
		}

		// Delete catalog rows scoped to this instance. All conditions use
		// exact column matches — no LIKE — so user-supplied identifiers can
		// safely contain '%' or '_'.
		if _, err := table.CatalogTableTrigger.DELETE().
			WHERE(table.CatalogTableTrigger.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete triggers: %w", err)
		}

		if _, err := table.CatalogTablePolicy.DELETE().
			WHERE(table.CatalogTablePolicy.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete policies: %w", err)
		}

		if _, err := table.CatalogTableIndex.DELETE().
			WHERE(table.CatalogTableIndex.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete indexes: %w", err)
		}

		if _, err := table.CatalogTableConstraint.DELETE().
			WHERE(table.CatalogTableConstraint.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete constraints: %w", err)
		}

		if _, err := table.CatalogView.DELETE().
			WHERE(table.CatalogView.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete views: %w", err)
		}

		if _, err := table.CatalogColumn.DELETE().
			WHERE(table.CatalogColumn.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete columns: %w", err)
		}

		if _, err := table.CatalogTable.DELETE().
			WHERE(table.CatalogTable.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete tables: %w", err)
		}

		if _, err := table.CatalogSchema.DELETE().
			WHERE(table.CatalogSchema.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete schemas: %w", err)
		}

		if _, err := table.CatalogDatabase.DELETE().
			WHERE(table.CatalogDatabase.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete databases: %w", err)
		}

		if _, err := table.CatalogServerInfo.DELETE().
			WHERE(table.CatalogServerInfo.InstanceID.EQ(instStr)).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete server info: %w", err)
		}

		// Build the exact set of catalog_sync_state scopes to delete: the
		// top-level databases list and server_info, plus every descendant
		// scope captured above.
		scopes := []postgres.Expression{
			postgres.String(scopeDatabasesForInstance(instanceID)),
			postgres.String(scopeServerInfo(instanceID)),
		}

		for _, d := range databases {
			scopes = appendDatabaseSubtreeScopeExpressions(scopes, instanceID, d.Name)
		}

		for _, s := range schemas {
			scopes = appendSchemaSubtreeScopeExpressions(scopes, instanceID, s.DatabaseName, s.Name)
		}

		for _, t := range tables {
			scopes = appendTableSubtreeScopeExpressions(scopes, instanceID, t.DatabaseName, t.SchemaName, t.Name)
		}

		if err := deleteSyncStateScopes(ctx, tx, scopes); err != nil {
			return fmt.Errorf("delete instance-invalidated sync states: %w", err)
		}

		return nil
	})
}

// InvalidateDatabase removes every cached row under a database and its
// sync_state entries, plus the parent databases-list scope, so the next
// ListDatabases re-discovers it.
func (r *PGRepository) InvalidateDatabase(ctx context.Context, instanceID, databaseName string) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		instStr := postgres.String(instanceID)
		dbStr := postgres.String(databaseName)

		// Capture schema and table names under this database so we can build
		// the exact set of catalog_sync_state scopes to delete. Database names
		// may contain '%' or '_', which would over-match a LIKE pattern and
		// nuke sibling databases' sync state — we follow the same explicit-
		// scope-list pattern used by departed-database cleanup in SyncDatabases.
		var schemas []model.CatalogSchema
		if err := postgres.SELECT(table.CatalogSchema.Name).
			FROM(table.CatalogSchema).
			WHERE(table.CatalogSchema.InstanceID.EQ(instStr).
				AND(table.CatalogSchema.DatabaseName.EQ(dbStr))).
			QueryContext(ctx, tx, &schemas); err != nil {
			return fmt.Errorf("list schemas to invalidate: %w", err)
		}

		var tables []model.CatalogTable
		if err := postgres.SELECT(table.CatalogTable.SchemaName_, table.CatalogTable.Name).
			FROM(table.CatalogTable).
			WHERE(table.CatalogTable.InstanceID.EQ(instStr).
				AND(table.CatalogTable.DatabaseName.EQ(dbStr))).
			QueryContext(ctx, tx, &tables); err != nil {
			return fmt.Errorf("list tables to invalidate: %w", err)
		}

		dbCond := func(col postgres.ColumnString) postgres.BoolExpression {
			return col.EQ(dbStr)
		}

		// Delete catalog rows scoped to this database. All conditions use
		// exact column matches — no LIKE — so user-supplied identifiers can
		// safely contain '%' or '_'.
		if _, err := table.CatalogTableTrigger.DELETE().
			WHERE(table.CatalogTableTrigger.InstanceID.EQ(instStr).AND(dbCond(table.CatalogTableTrigger.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete triggers: %w", err)
		}

		if _, err := table.CatalogTablePolicy.DELETE().
			WHERE(table.CatalogTablePolicy.InstanceID.EQ(instStr).AND(dbCond(table.CatalogTablePolicy.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete policies: %w", err)
		}

		if _, err := table.CatalogTableIndex.DELETE().
			WHERE(table.CatalogTableIndex.InstanceID.EQ(instStr).AND(dbCond(table.CatalogTableIndex.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete indexes: %w", err)
		}

		if _, err := table.CatalogTableConstraint.DELETE().
			WHERE(table.CatalogTableConstraint.InstanceID.EQ(instStr).AND(dbCond(table.CatalogTableConstraint.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete constraints: %w", err)
		}

		if _, err := table.CatalogView.DELETE().
			WHERE(table.CatalogView.InstanceID.EQ(instStr).AND(dbCond(table.CatalogView.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete views: %w", err)
		}

		if _, err := table.CatalogColumn.DELETE().
			WHERE(table.CatalogColumn.InstanceID.EQ(instStr).AND(dbCond(table.CatalogColumn.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete columns: %w", err)
		}

		if _, err := table.CatalogTable.DELETE().
			WHERE(table.CatalogTable.InstanceID.EQ(instStr).AND(dbCond(table.CatalogTable.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete tables: %w", err)
		}

		if _, err := table.CatalogSchema.DELETE().
			WHERE(table.CatalogSchema.InstanceID.EQ(instStr).AND(dbCond(table.CatalogSchema.DatabaseName))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete schemas: %w", err)
		}

		if _, err := table.CatalogDatabase.DELETE().
			WHERE(table.CatalogDatabase.InstanceID.EQ(instStr).AND(table.CatalogDatabase.Name.EQ(dbStr))).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete database: %w", err)
		}

		// Build the exact list of catalog_sync_state scopes to delete: the
		// database subtree plus every surviving schema/table scope, plus the
		// parent databases list scope so the next ListDatabases triggers a
		// re-sync.
		scopes := appendDatabaseSubtreeScopeExpressions(nil, instanceID, databaseName)
		scopes = append(scopes, postgres.String(scopeDatabasesForInstance(instanceID)))

		for _, s := range schemas {
			scopes = appendSchemaSubtreeScopeExpressions(scopes, instanceID, databaseName, s.Name)
		}

		for _, t := range tables {
			scopes = appendTableSubtreeScopeExpressions(scopes, instanceID, databaseName, t.SchemaName, t.Name)
		}

		if err := deleteSyncStateScopes(ctx, tx, scopes); err != nil {
			return fmt.Errorf("delete database-invalidated sync states: %w", err)
		}

		return nil
	})
}
