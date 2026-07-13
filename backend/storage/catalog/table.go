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

var catalogTableSchema = aipjet.Bind(
	aip.NewSchema[model.CatalogTable](
		"console.querylane.dev/Table",
		aip.Fields[model.CatalogTable]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogTable) any { return m.Name },
				Filterable: true,
			},
			"owner": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogTable) any { return m.Owner },
				Filterable: true,
			},
			"size_bytes": {
				Codec:    aip.Int64Codec{},
				GetValue: func(m *model.CatalogTable) any { return m.SizeBytes },
			},
			"table_type": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogTable) any { return m.TableType },
				Filterable: true,
				FilterValues: []string{
					"TABLE_TYPE_BASE_TABLE",
					"TABLE_TYPE_PARTITIONED",
					"TABLE_TYPE_EXTERNAL",
					"TABLE_TYPE_TEMPORARY",
				},
			},
			"is_system_table": {
				Codec:           aip.BoolCodec{},
				DisableOrdering: true,
				GetValue:        func(m *model.CatalogTable) any { return m.IsSystemTable },
				Filterable:      true,
			},
		},
		aip.WithNameOrdering(),
	),
	aipjet.Columns{
		"name":            table.CatalogTable.Name,
		"owner":           table.CatalogTable.Owner,
		"size_bytes":      table.CatalogTable.SizeBytes,
		"table_type":      table.CatalogTable.TableType,
		"is_system_table": table.CatalogTable.IsSystemTable,
	},
)

// ListTables returns a page of cached tables under a schema.
func (r *PGRepository) ListTables(ctx context.Context, instanceID, databaseName, schemaName string, params aip.Params) ([]model.CatalogTable, string, error) {
	baseQuery := postgres.SELECT(table.CatalogTable.AllColumns).FROM(table.CatalogTable)
	baseCondition := table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
		AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
		AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName)))

	rows, nextToken, err := aipjet.ExecuteWithCondition(ctx, catalogTableSchema, params, baseQuery, baseCondition, r.db)
	if err != nil {
		return nil, "", fmt.Errorf("query tables: %w", err)
	}

	return rows, nextToken, nil
}

// GetTable returns the cached row for one table; storage.ErrNotFound when absent.
func (r *PGRepository) GetTable(ctx context.Context, instanceID, databaseName, schemaName, name string) (*model.CatalogTable, error) {
	stmt := postgres.SELECT(table.CatalogTable.AllColumns).
		FROM(table.CatalogTable).
		WHERE(
			table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogTable.Name.EQ(postgres.String(name))),
		)

	var row model.CatalogTable
	if err := stmt.QueryContext(ctx, r.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, fmt.Errorf("get table: %w", err)
	}

	return &row, nil
}

// SyncTables reconciles the schema's table list with the incoming snapshot.
//
// Delta-delete contract: rows (and child sync_state) for tables that still
// exist after the sync are preserved. Only tables absent from the incoming
// snapshot are removed, along with their descendant columns / constraints /
// indexes / policies / triggers and the matching child catalog_sync_state
// entries. Surviving same-name tables keep their previously-synced child data
// and child freshness. Child staleness is governed by each child scope's own
// StalenessThreshold.
func (r *PGRepository) SyncTables(ctx context.Context, instanceID, databaseName, schemaName string, tables []model.CatalogTable) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		schemaCond := table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
			AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName)))

		incomingNames := make([]postgres.Expression, len(tables))
		for i, t := range tables {
			incomingNames[i] = postgres.String(t.Name)
		}

		// Find tables present in the catalog but absent from the incoming snapshot.
		departedCond := schemaCond
		if len(incomingNames) > 0 {
			departedCond = departedCond.AND(table.CatalogTable.Name.NOT_IN(incomingNames...))
		}

		var departedRows []model.CatalogTable
		if err := postgres.SELECT(table.CatalogTable.Name).
			FROM(table.CatalogTable).
			WHERE(departedCond).
			QueryContext(ctx, tx, &departedRows); err != nil {
			return fmt.Errorf("list departed tables: %w", err)
		}

		// Clean descendants and the table row itself for every departed table.
		if len(departedRows) > 0 {
			departedNames := make([]postgres.Expression, len(departedRows))
			for i, r := range departedRows {
				departedNames[i] = postgres.String(r.Name)
			}

			instStr := postgres.String(instanceID)
			dbStr := postgres.String(databaseName)
			schStr := postgres.String(schemaName)

			if err := deleteTableChildCatalogRows(ctx, tx, tableChildDeleteConditions{
				label: "departed",
				triggers: table.CatalogTableTrigger.InstanceID.EQ(instStr).
					AND(table.CatalogTableTrigger.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableTrigger.SchemaName_.EQ(schStr)).
					AND(table.CatalogTableTrigger.TableName_.IN(departedNames...)),
				policies: table.CatalogTablePolicy.InstanceID.EQ(instStr).
					AND(table.CatalogTablePolicy.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTablePolicy.SchemaName_.EQ(schStr)).
					AND(table.CatalogTablePolicy.TableName_.IN(departedNames...)),
				indexes: table.CatalogTableIndex.InstanceID.EQ(instStr).
					AND(table.CatalogTableIndex.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableIndex.SchemaName_.EQ(schStr)).
					AND(table.CatalogTableIndex.TableName_.IN(departedNames...)),
				constraints: table.CatalogTableConstraint.InstanceID.EQ(instStr).
					AND(table.CatalogTableConstraint.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableConstraint.SchemaName_.EQ(schStr)).
					AND(table.CatalogTableConstraint.TableName_.IN(departedNames...)),
				columns: table.CatalogColumn.InstanceID.EQ(instStr).
					AND(table.CatalogColumn.DatabaseName.EQ(dbStr)).
					AND(table.CatalogColumn.SchemaName_.EQ(schStr)).
					AND(table.CatalogColumn.TableName_.IN(departedNames...)),
			}); err != nil {
				return err
			}

			if _, err := table.CatalogTable.DELETE().
				WHERE(schemaCond.AND(table.CatalogTable.Name.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed tables: %w", err)
			}

			// Build the exact set of child sync_state scopes to delete for
			// each departed table — avoids LIKE-pattern escaping pitfalls with
			// PostgreSQL identifiers that may contain '%' or '_'.
			departedScopes := make([]postgres.Expression, 0, len(departedRows)*(len(catalogChildScopeSuffixes)+1))
			for _, r := range departedRows {
				departedScopes = appendTableSubtreeScopeExpressions(departedScopes, instanceID, databaseName, schemaName, r.Name)
			}

			if err := deleteSyncStateScopes(ctx, tx, departedScopes); err != nil {
				return fmt.Errorf("delete departed child sync states: %w", err)
			}
		}

		// Upsert incoming tables. Existing rows for surviving tables get their
		// metadata refreshed; their descendant data and child sync_state are
		// left untouched.
		if len(tables) > 0 {
			stmt := table.CatalogTable.
				INSERT(
					table.CatalogTable.InstanceID,
					table.CatalogTable.DatabaseName,
					table.CatalogTable.SchemaName_,
					table.CatalogTable.Name,
					table.CatalogTable.DisplayName,
					table.CatalogTable.TableType,
					table.CatalogTable.IsSystemTable,
					table.CatalogTable.Comment,
					table.CatalogTable.Owner,
					table.CatalogTable.RowCount,
					table.CatalogTable.SizeBytes,
					table.CatalogTable.SyncedAt,
				).
				MODELS(tables).
				ON_CONFLICT(
					table.CatalogTable.InstanceID,
					table.CatalogTable.DatabaseName,
					table.CatalogTable.SchemaName_,
					table.CatalogTable.Name,
				).
				DO_UPDATE(postgres.SET(
					table.CatalogTable.DisplayName.SET(table.CatalogTable.EXCLUDED.DisplayName),
					table.CatalogTable.TableType.SET(table.CatalogTable.EXCLUDED.TableType),
					table.CatalogTable.IsSystemTable.SET(table.CatalogTable.EXCLUDED.IsSystemTable),
					table.CatalogTable.Comment.SET(table.CatalogTable.EXCLUDED.Comment),
					table.CatalogTable.Owner.SET(table.CatalogTable.EXCLUDED.Owner),
					table.CatalogTable.RowCount.SET(table.CatalogTable.EXCLUDED.RowCount),
					table.CatalogTable.SizeBytes.SET(table.CatalogTable.EXCLUDED.SizeBytes),
					table.CatalogTable.SyncedAt.SET(table.CatalogTable.EXCLUDED.SyncedAt),
				))

			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("upsert tables: %w", err)
			}
		}

		return nil
	})
}
