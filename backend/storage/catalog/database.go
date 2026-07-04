package catalog

import (
	"context"
	"errors"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/aip"
	aipjet "github.com/querylane/querylane/backend/aip/jet"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

var catalogDatabaseSchema = aipjet.Bind(
	aip.NewSchema[model.CatalogDatabase](
		"console.querylane.dev/Database",
		aip.Fields[model.CatalogDatabase]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogDatabase) any { return m.Name },
				Filterable: true,
			},
			"display_name": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *model.CatalogDatabase) any { return m.DisplayName },
			},
			"owner": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogDatabase) any { return m.Owner },
				Filterable: true,
			},
			"is_system_database": {
				Codec:           aip.BoolCodec{},
				DisableOrdering: true,
				GetValue:        func(m *model.CatalogDatabase) any { return m.IsSystemDatabase },
				Filterable:      true,
			},
		},
		aip.WithNameOrdering(),
	),
	aipjet.Columns{
		"name":               table.CatalogDatabase.Name,
		"display_name":       table.CatalogDatabase.DisplayName,
		"owner":              table.CatalogDatabase.Owner,
		"is_system_database": table.CatalogDatabase.IsSystemDatabase,
	},
)

// ListDatabases returns a page of cached databases for an instance.
func (r *PGRepository) ListDatabases(ctx context.Context, instanceID string, params aip.Params) ([]model.CatalogDatabase, string, error) {
	baseQuery := postgres.SELECT(table.CatalogDatabase.AllColumns).FROM(table.CatalogDatabase)
	baseCondition := table.CatalogDatabase.InstanceID.EQ(postgres.String(instanceID))

	params.Filter = normalizeLegacyCatalogFilter(params.Filter)

	rows, nextToken, err := aipjet.ExecuteWithCondition(ctx, catalogDatabaseSchema, params, baseQuery, baseCondition, r.db)
	if err != nil {
		return nil, "", fmt.Errorf("query databases: %w", err)
	}

	return rows, nextToken, nil
}

// GetDatabase returns the cached row for one database; storage.ErrNotFound when absent.
func (r *PGRepository) GetDatabase(ctx context.Context, instanceID, name string) (*model.CatalogDatabase, error) {
	stmt := postgres.SELECT(table.CatalogDatabase.AllColumns).
		FROM(table.CatalogDatabase).
		WHERE(
			table.CatalogDatabase.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogDatabase.Name.EQ(postgres.String(name))),
		)

	var row model.CatalogDatabase
	if err := stmt.QueryContext(ctx, r.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, fmt.Errorf("get database: %w", err)
	}

	return &row, nil
}

// SyncDatabases reconciles the instance's database list with the incoming
// snapshot.
//
// Delta-delete contract: databases (and their descendants and child
// sync_state) that still exist after the sync are preserved. Only databases
// absent from the incoming snapshot have their schemas, views, tables, and
// per-table descendants removed, along with the matching catalog_sync_state
// entries. Surviving same-name databases keep their previously-synced
// descendant data and freshness.
//
//nolint:nestif // departed-resource cleanup intentionally fans out across all descendant tables in one TX
func (r *PGRepository) SyncDatabases(ctx context.Context, instanceID string, databases []model.CatalogDatabase) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		instStr := postgres.String(instanceID)
		instanceCond := table.CatalogDatabase.InstanceID.EQ(instStr)

		incomingNames := make([]postgres.Expression, len(databases))
		for i, d := range databases {
			incomingNames[i] = postgres.String(d.Name)
		}

		departedCond := instanceCond
		if len(incomingNames) > 0 {
			departedCond = departedCond.AND(table.CatalogDatabase.Name.NOT_IN(incomingNames...))
		}

		var departedDatabases []model.CatalogDatabase
		if err := postgres.SELECT(table.CatalogDatabase.Name).
			FROM(table.CatalogDatabase).
			WHERE(departedCond).
			QueryContext(ctx, tx, &departedDatabases); err != nil {
			return fmt.Errorf("list departed databases: %w", err)
		}

		if len(departedDatabases) > 0 {
			departedNames := make([]postgres.Expression, len(departedDatabases))
			for i, d := range departedDatabases {
				departedNames[i] = postgres.String(d.Name)
			}

			// Capture (schema, table) pairs from departed databases so we can
			// clean their per-table child sync_state entries by exact match.
			var departedSchemas []model.CatalogSchema
			if err := postgres.SELECT(table.CatalogSchema.DatabaseName, table.CatalogSchema.Name).
				FROM(table.CatalogSchema).
				WHERE(table.CatalogSchema.InstanceID.EQ(instStr).
					AND(table.CatalogSchema.DatabaseName.IN(departedNames...))).
				QueryContext(ctx, tx, &departedSchemas); err != nil {
				return fmt.Errorf("list departed-database schemas: %w", err)
			}

			var departedTables []model.CatalogTable
			if err := postgres.SELECT(table.CatalogTable.DatabaseName, table.CatalogTable.SchemaName_, table.CatalogTable.Name).
				FROM(table.CatalogTable).
				WHERE(table.CatalogTable.InstanceID.EQ(instStr).
					AND(table.CatalogTable.DatabaseName.IN(departedNames...))).
				QueryContext(ctx, tx, &departedTables); err != nil {
				return fmt.Errorf("list departed-database tables: %w", err)
			}

			if err := deleteTableChildCatalogRows(ctx, tx, tableChildDeleteConditions{
				label: "departed-database",
				triggers: table.CatalogTableTrigger.InstanceID.EQ(instStr).
					AND(table.CatalogTableTrigger.DatabaseName.IN(departedNames...)),
				policies: table.CatalogTablePolicy.InstanceID.EQ(instStr).
					AND(table.CatalogTablePolicy.DatabaseName.IN(departedNames...)),
				indexes: table.CatalogTableIndex.InstanceID.EQ(instStr).
					AND(table.CatalogTableIndex.DatabaseName.IN(departedNames...)),
				constraints: table.CatalogTableConstraint.InstanceID.EQ(instStr).
					AND(table.CatalogTableConstraint.DatabaseName.IN(departedNames...)),
				columns: table.CatalogColumn.InstanceID.EQ(instStr).
					AND(table.CatalogColumn.DatabaseName.IN(departedNames...)),
			}); err != nil {
				return err
			}

			if _, err := table.CatalogView.DELETE().
				WHERE(table.CatalogView.InstanceID.EQ(instStr).
					AND(table.CatalogView.DatabaseName.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed-database views: %w", err)
			}

			if _, err := table.CatalogTable.DELETE().
				WHERE(table.CatalogTable.InstanceID.EQ(instStr).
					AND(table.CatalogTable.DatabaseName.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed-database tables: %w", err)
			}

			if _, err := table.CatalogSchema.DELETE().
				WHERE(table.CatalogSchema.InstanceID.EQ(instStr).
					AND(table.CatalogSchema.DatabaseName.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed-database schemas: %w", err)
			}

			if _, err := table.CatalogDatabase.DELETE().
				WHERE(instanceCond.AND(table.CatalogDatabase.Name.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed databases: %w", err)
			}

			// Build the exact set of sync_state scopes to delete for everything
			// underneath each departed database.
			var departedScopes []postgres.Expression
			for _, d := range departedDatabases {
				departedScopes = appendDatabaseSubtreeScopeExpressions(departedScopes, instanceID, d.Name)
			}

			for _, s := range departedSchemas {
				departedScopes = appendSchemaSubtreeScopeExpressions(departedScopes, instanceID, s.DatabaseName, s.Name)
			}

			for _, t := range departedTables {
				departedScopes = appendTableSubtreeScopeExpressions(departedScopes, instanceID, t.DatabaseName, t.SchemaName, t.Name)
			}

			if len(departedScopes) > 0 {
				if err := deleteSyncStateScopes(ctx, tx, departedScopes); err != nil {
					return fmt.Errorf("delete departed-database sync states: %w", err)
				}
			}
		}

		// Upsert incoming databases. Existing rows for surviving databases
		// have their metadata refreshed; descendants and child sync_state are
		// left untouched.
		if len(databases) > 0 {
			stmt := table.CatalogDatabase.
				INSERT(
					table.CatalogDatabase.InstanceID,
					table.CatalogDatabase.Name,
					table.CatalogDatabase.DisplayName,
					table.CatalogDatabase.CharacterSet,
					table.CatalogDatabase.Collation,
					table.CatalogDatabase.Owner,
					table.CatalogDatabase.IsSystemDatabase,
					table.CatalogDatabase.SyncedAt,
				).
				MODELS(databases).
				ON_CONFLICT(
					table.CatalogDatabase.InstanceID,
					table.CatalogDatabase.Name,
				).
				DO_UPDATE(postgres.SET(
					table.CatalogDatabase.DisplayName.SET(table.CatalogDatabase.EXCLUDED.DisplayName),
					table.CatalogDatabase.CharacterSet.SET(table.CatalogDatabase.EXCLUDED.CharacterSet),
					table.CatalogDatabase.Collation.SET(table.CatalogDatabase.EXCLUDED.Collation),
					table.CatalogDatabase.Owner.SET(table.CatalogDatabase.EXCLUDED.Owner),
					table.CatalogDatabase.IsSystemDatabase.SET(table.CatalogDatabase.EXCLUDED.IsSystemDatabase),
					table.CatalogDatabase.SyncedAt.SET(table.CatalogDatabase.EXCLUDED.SyncedAt),
				))

			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("upsert databases: %w", err)
			}
		}

		return nil
	})
}
