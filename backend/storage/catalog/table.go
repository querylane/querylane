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

	params.Filter = normalizeLegacyCatalogFilter(params.Filter)

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

// SyncTablePages atomically reconciles a schema's tables while consuming only
// one bounded page at a time. Tables that survive keep their previously synced
// descendants and child freshness state.
func (r *PGRepository) SyncTablePages(
	ctx context.Context,
	instanceID, databaseName, schemaName string,
	syncedAt time.Time,
	pages iter.Seq2[[]model.CatalogTable, error],
) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		syncMarker, err := nextTableSyncMarker(ctx, tx, instanceID, databaseName, schemaName, syncedAt)
		if err != nil {
			return err
		}

		for tables, pageErr := range pages {
			if pageErr != nil {
				return pageErr
			}

			for i := range tables {
				tables[i].SyncedAt = syncMarker
			}

			if err := upsertTables(ctx, tx, tables); err != nil {
				return err
			}
		}

		departedCond := table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
			AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName))).
			AND(table.CatalogTable.SyncedAt.NOT_EQ(postgres.TimestampzT(syncMarker)))

		return deleteDepartedTables(ctx, tx, instanceID, databaseName, schemaName, departedCond)
	})
}

func nextTableSyncMarker(
	ctx context.Context,
	tx storage.QueryExecutor,
	instanceID, databaseName, schemaName string,
	proposed time.Time,
) (time.Time, error) {
	marker := proposed.UTC().Truncate(time.Microsecond)

	var latest []model.CatalogTable

	if err := postgres.SELECT(table.CatalogTable.SyncedAt).
		FROM(table.CatalogTable).
		WHERE(table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
			AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName)))).
		ORDER_BY(table.CatalogTable.SyncedAt.DESC()).
		LIMIT(1).
		QueryContext(ctx, tx, &latest); err != nil {
		return time.Time{}, fmt.Errorf("get latest table sync marker: %w", err)
	}

	if len(latest) > 0 && !latest[0].SyncedAt.Before(marker) {
		marker = latest[0].SyncedAt.UTC().Add(time.Microsecond)
	}

	return marker, nil
}

func deleteDepartedTables(
	ctx context.Context,
	tx storage.QueryExecutor,
	instanceID, databaseName, schemaName string,
	departedCond postgres.BoolExpression,
) error {
	schemaCond := table.CatalogTable.InstanceID.EQ(postgres.String(instanceID)).
		AND(table.CatalogTable.DatabaseName.EQ(postgres.String(databaseName))).
		AND(table.CatalogTable.SchemaName_.EQ(postgres.String(schemaName)))

	for {
		var departedRows []model.CatalogTable
		if err := postgres.SELECT(table.CatalogTable.Name).
			FROM(table.CatalogTable).
			WHERE(departedCond).
			ORDER_BY(table.CatalogTable.Name.ASC()).
			LIMIT(departedCatalogBatchSize).
			QueryContext(ctx, tx, &departedRows); err != nil {
			return fmt.Errorf("list departed tables: %w", err)
		}

		if len(departedRows) == 0 {
			return nil
		}

		departedNames := make([]postgres.Expression, len(departedRows))

		departedRoots := make([]string, len(departedRows))
		for i, r := range departedRows {
			departedNames[i] = postgres.String(r.Name)
			departedRoots[i] = scopeTable(instanceID, databaseName, schemaName, r.Name)
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

		if err := deleteSyncStateSubtrees(ctx, tx, departedRoots); err != nil {
			return fmt.Errorf("delete departed child sync states: %w", err)
		}
	}
}

func upsertTables(ctx context.Context, tx storage.QueryExecutor, tables []model.CatalogTable) error {
	// Existing rows for surviving tables get their metadata refreshed; their
	// descendant data and child sync_state are left untouched.
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
}
