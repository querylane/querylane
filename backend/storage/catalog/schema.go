package catalog

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"time"

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

	params.Filter = normalizeLegacyCatalogFilter(params.Filter)

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

// SyncSchemaPages atomically reconciles a database's schemas while consuming
// only one bounded page at a time. Schemas that survive keep their previously
// synced descendants and child freshness state.
func (r *PGRepository) SyncSchemaPages(
	ctx context.Context,
	instanceID, databaseName string,
	syncedAt time.Time,
	pages iter.Seq2[[]model.CatalogSchema, error],
) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		syncMarker, err := nextSchemaSyncMarker(ctx, tx, instanceID, databaseName, syncedAt)
		if err != nil {
			return err
		}

		for schemas, pageErr := range pages {
			if pageErr != nil {
				return pageErr
			}

			for i := range schemas {
				schemas[i].SyncedAt = syncMarker
			}

			if err := upsertSchemas(ctx, tx, schemas); err != nil {
				return err
			}
		}

		departedCond := table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName))).
			AND(table.CatalogSchema.SyncedAt.NOT_EQ(postgres.TimestampzT(syncMarker)))

		return deleteDepartedSchemas(ctx, tx, instanceID, databaseName, departedCond)
	})
}

func nextSchemaSyncMarker(
	ctx context.Context,
	tx storage.QueryExecutor,
	instanceID, databaseName string,
	proposed time.Time,
) (time.Time, error) {
	marker := proposed.UTC().Truncate(time.Microsecond)

	var latest []model.CatalogSchema

	if err := postgres.SELECT(table.CatalogSchema.SyncedAt).
		FROM(table.CatalogSchema).
		WHERE(table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName)))).
		ORDER_BY(table.CatalogSchema.SyncedAt.DESC()).
		LIMIT(1).
		QueryContext(ctx, tx, &latest); err != nil {
		return time.Time{}, fmt.Errorf("get latest schema sync marker: %w", err)
	}

	if len(latest) > 0 && !latest[0].SyncedAt.Before(marker) {
		marker = latest[0].SyncedAt.UTC().Add(time.Microsecond)
	}

	return marker, nil
}

func deleteDepartedSchemas(
	ctx context.Context,
	tx storage.QueryExecutor,
	instanceID, databaseName string,
	departedCond postgres.BoolExpression,
) error {
	dbCond := table.CatalogSchema.InstanceID.EQ(postgres.String(instanceID)).
		AND(table.CatalogSchema.DatabaseName.EQ(postgres.String(databaseName)))

	for {
		var departedSchemas []model.CatalogSchema
		if err := postgres.SELECT(table.CatalogSchema.Name).
			FROM(table.CatalogSchema).
			WHERE(departedCond).
			ORDER_BY(table.CatalogSchema.Name.ASC()).
			LIMIT(departedCatalogBatchSize).
			QueryContext(ctx, tx, &departedSchemas); err != nil {
			return fmt.Errorf("list departed schemas: %w", err)
		}

		if len(departedSchemas) == 0 {
			return nil
		}

		departedNames := make([]postgres.Expression, len(departedSchemas))

		departedRoots := make([]string, len(departedSchemas))
		for i, s := range departedSchemas {
			departedNames[i] = postgres.String(s.Name)
			departedRoots[i] = scopeSchema(instanceID, databaseName, s.Name)
		}

		instStr := postgres.String(instanceID)
		dbStr := postgres.String(databaseName)

		if err := deleteSyncStateSubtrees(ctx, tx, departedRoots); err != nil {
			return fmt.Errorf("delete departed-schema sync states: %w", err)
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
	}
}

func upsertSchemas(ctx context.Context, tx storage.QueryExecutor, schemas []model.CatalogSchema) error {
	// Existing rows for surviving schemas have their metadata refreshed;
	// descendants and child sync_state are left untouched.
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
}
