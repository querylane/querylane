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

var catalogSchemaSchema = aipjet.Bind(
	aip.NewSchema[model.CatalogSchema](
		"console.querylane.dev/Schema",
		aip.Fields[model.CatalogSchema]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogSchema) any { return m.Name },
				Filterable: true,
			},
			"display_name": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *model.CatalogSchema) any { return m.DisplayName },
			},
			"owner": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogSchema) any { return m.Owner },
				Filterable: true,
			},
			"is_system_schema": {
				Codec:           aip.BoolCodec{},
				DisableOrdering: true,
				GetValue:        func(m *model.CatalogSchema) any { return m.IsSystemSchema },
				Filterable:      true,
			},
		},
		aip.WithNameOrdering(),
	),
	aipjet.Columns{
		"name":             table.CatalogSchema.Name,
		"display_name":     table.CatalogSchema.DisplayName,
		"owner":            table.CatalogSchema.Owner,
		"is_system_schema": table.CatalogSchema.IsSystemSchema,
	},
)

// ListSchemas returns a page of cached schemas under a database.
func (r *PGRepository) ListSchemas(ctx context.Context, instanceID, databaseName string, params aip.Params) ([]model.CatalogSchema, string, error) {
	baseQuery := postgres.SELECT(table.CatalogSchema.AllColumns).FROM(table.CatalogSchema)
	baseCondition := table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
		AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName)))

	rows, nextToken, err := aipjet.ExecuteWithCondition(ctx, catalogSchemaSchema, params, baseQuery, baseCondition, r.db)
	if err != nil {
		return nil, "", fmt.Errorf("query schemas: %w", err)
	}

	return rows, nextToken, nil
}

// GetSchema returns the cached row for one schema; storage.ErrNotFound when absent.
func (r *PGRepository) GetSchema(ctx context.Context, instanceID, databaseName, name string) (*model.CatalogSchema, error) {
	stmt := postgres.SELECT(table.CatalogSchema.AllColumns).
		FROM(table.CatalogSchema).
		WHERE(
			table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogSchema.Name.EQ(postgres.String(name))),
		)

	var row model.CatalogSchema
	if err := stmt.QueryContext(ctx, r.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, fmt.Errorf("get schema: %w", err)
	}

	return &row, nil
}

// SyncSchemas reconciles the database's schema list with the incoming snapshot.
//
// Delta-delete contract: schemas (and their descendants and child sync_state)
// that still exist after the sync are preserved. Only schemas absent from the
// incoming snapshot have their views, tables, and per-table descendants
// removed, along with the matching catalog_sync_state entries. Surviving
// same-name schemas keep their previously-synced descendant data and
// freshness; child staleness is governed by each child scope's own
// StalenessThreshold.
//
//nolint:nestif // departed-resource cleanup intentionally fans out across all descendant tables in one TX
func (r *PGRepository) SyncSchemas(ctx context.Context, instanceID, databaseName string, schemas []model.CatalogSchema) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		dbCond := table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName)))

		incomingNames := make([]postgres.Expression, len(schemas))
		for i, s := range schemas {
			incomingNames[i] = postgres.String(s.Name)
		}

		// Find departed schemas (in catalog but absent from the incoming snapshot).
		departedCond := dbCond
		if len(incomingNames) > 0 {
			departedCond = departedCond.AND(table.CatalogSchema.Name.NOT_IN(incomingNames...))
		}

		var departedSchemas []model.CatalogSchema
		if err := postgres.SELECT(table.CatalogSchema.Name).
			FROM(table.CatalogSchema).
			WHERE(departedCond).
			QueryContext(ctx, tx, &departedSchemas); err != nil {
			return fmt.Errorf("list departed schemas: %w", err)
		}

		if len(departedSchemas) > 0 {
			departedNames := make([]postgres.Expression, len(departedSchemas))
			for i, s := range departedSchemas {
				departedNames[i] = postgres.String(s.Name)
			}

			instStr := postgres.String(instanceID)
			dbStr := postgres.String(databaseName)

			// Capture the table names underneath every departed schema so we
			// can clean their per-table child sync_state entries by exact match.
			var departedSchemaTables []model.CatalogTable
			if err := postgres.SELECT(table.CatalogTable.SchemaName_, table.CatalogTable.Name).
				FROM(table.CatalogTable).
				WHERE(table.CatalogTable.InstanceID.EQ(instStr).
					AND(table.CatalogTable.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTable.SchemaName_.IN(departedNames...))).
				QueryContext(ctx, tx, &departedSchemaTables); err != nil {
				return fmt.Errorf("list departed-schema tables: %w", err)
			}

			if err := deleteTableChildCatalogRows(ctx, tx, tableChildDeleteConditions{
				label: "departed-schema",
				triggers: table.CatalogTableTrigger.InstanceID.EQ(instStr).
					AND(table.CatalogTableTrigger.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableTrigger.SchemaName_.IN(departedNames...)),
				policies: table.CatalogTablePolicy.InstanceID.EQ(instStr).
					AND(table.CatalogTablePolicy.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTablePolicy.SchemaName_.IN(departedNames...)),
				indexes: table.CatalogTableIndex.InstanceID.EQ(instStr).
					AND(table.CatalogTableIndex.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableIndex.SchemaName_.IN(departedNames...)),
				constraints: table.CatalogTableConstraint.InstanceID.EQ(instStr).
					AND(table.CatalogTableConstraint.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTableConstraint.SchemaName_.IN(departedNames...)),
				columns: table.CatalogColumn.InstanceID.EQ(instStr).
					AND(table.CatalogColumn.DatabaseName.EQ(dbStr)).
					AND(table.CatalogColumn.SchemaName_.IN(departedNames...)),
			}); err != nil {
				return err
			}

			if _, err := table.CatalogView.DELETE().
				WHERE(table.CatalogView.InstanceID.EQ(instStr).
					AND(table.CatalogView.DatabaseName.EQ(dbStr)).
					AND(table.CatalogView.SchemaName_.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed-schema views: %w", err)
			}

			if _, err := table.CatalogTable.DELETE().
				WHERE(table.CatalogTable.InstanceID.EQ(instStr).
					AND(table.CatalogTable.DatabaseName.EQ(dbStr)).
					AND(table.CatalogTable.SchemaName_.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed-schema tables: %w", err)
			}

			if _, err := table.CatalogSchema.DELETE().
				WHERE(dbCond.AND(table.CatalogSchema.Name.IN(departedNames...))).
				ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("delete departed schemas: %w", err)
			}

			// Build the exact set of sync_state scopes to delete: every
			// per-schema scope (tables, views, schema row itself) plus every
			// per-table scope under each departed schema.
			var departedScopes []postgres.Expression
			for _, s := range departedSchemas {
				departedScopes = appendSchemaSubtreeScopeExpressions(departedScopes, instanceID, databaseName, s.Name)
			}

			for _, t := range departedSchemaTables {
				departedScopes = appendTableSubtreeScopeExpressions(departedScopes, instanceID, databaseName, t.SchemaName, t.Name)
			}

			if len(departedScopes) > 0 {
				if err := deleteSyncStateScopes(ctx, tx, departedScopes); err != nil {
					return fmt.Errorf("delete departed-schema sync states: %w", err)
				}
			}
		}

		// Upsert incoming schemas. Existing rows for surviving schemas have
		// their metadata refreshed; descendants and child sync_state are left
		// untouched.
		if len(schemas) > 0 {
			stmt := table.CatalogSchema.
				INSERT(
					table.CatalogSchema.InstanceID,
					table.CatalogSchema.DatabaseName,
					table.CatalogSchema.Name,
					table.CatalogSchema.DisplayName,
					table.CatalogSchema.Owner,
					table.CatalogSchema.IsSystemSchema,
					table.CatalogSchema.SyncedAt,
				).
				MODELS(schemas).
				ON_CONFLICT(
					table.CatalogSchema.InstanceID,
					table.CatalogSchema.DatabaseName,
					table.CatalogSchema.Name,
				).
				DO_UPDATE(postgres.SET(
					table.CatalogSchema.DisplayName.SET(table.CatalogSchema.EXCLUDED.DisplayName),
					table.CatalogSchema.Owner.SET(table.CatalogSchema.EXCLUDED.Owner),
					table.CatalogSchema.IsSystemSchema.SET(table.CatalogSchema.EXCLUDED.IsSystemSchema),
					table.CatalogSchema.SyncedAt.SET(table.CatalogSchema.EXCLUDED.SyncedAt),
				))

			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("upsert schemas: %w", err)
			}
		}

		return nil
	})
}
