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

// SyncDatabasePages atomically reconciles an instance's databases while
// consuming only one bounded page at a time. Databases that survive keep their
// previously synced descendants and child freshness state.
func (r *PGRepository) SyncDatabasePages(
	ctx context.Context,
	instanceID string,
	syncedAt time.Time,
	pages iter.Seq2[[]model.CatalogDatabase, error],
) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		syncMarker, err := nextDatabaseSyncMarker(ctx, tx, instanceID, syncedAt)
		if err != nil {
			return err
		}

		for databases, pageErr := range pages {
			if pageErr != nil {
				return pageErr
			}

			for i := range databases {
				databases[i].SyncedAt = syncMarker
			}

			if err := upsertDatabases(ctx, tx, databases); err != nil {
				return err
			}
		}

		departedCond := table.CatalogDatabase.InstanceID.EQ(postgres.String(instanceID)).
			AND(table.CatalogDatabase.SyncedAt.NOT_EQ(postgres.TimestampzT(syncMarker)))

		return deleteDepartedDatabases(ctx, tx, instanceID, departedCond)
	})
}

func nextDatabaseSyncMarker(
	ctx context.Context,
	tx storage.QueryExecutor,
	instanceID string,
	proposed time.Time,
) (time.Time, error) {
	marker := proposed.UTC().Truncate(time.Microsecond)

	var latest []model.CatalogDatabase

	if err := postgres.SELECT(table.CatalogDatabase.SyncedAt).
		FROM(table.CatalogDatabase).
		WHERE(table.CatalogDatabase.InstanceID.EQ(postgres.String(instanceID))).
		ORDER_BY(table.CatalogDatabase.SyncedAt.DESC()).
		LIMIT(1).
		QueryContext(ctx, tx, &latest); err != nil {
		return time.Time{}, fmt.Errorf("get latest database sync marker: %w", err)
	}

	if len(latest) > 0 && !latest[0].SyncedAt.Before(marker) {
		marker = latest[0].SyncedAt.UTC().Add(time.Microsecond)
	}

	return marker, nil
}

func deleteDepartedDatabases(ctx context.Context, tx storage.QueryExecutor, instanceID string, departedCond postgres.BoolExpression) error {
	instStr := postgres.String(instanceID)
	instanceCond := table.CatalogDatabase.InstanceID.EQ(instStr)

	for {
		var departedDatabases []model.CatalogDatabase
		if err := postgres.SELECT(table.CatalogDatabase.Name).
			FROM(table.CatalogDatabase).
			WHERE(departedCond).
			ORDER_BY(table.CatalogDatabase.Name.ASC()).
			LIMIT(departedCatalogBatchSize).
			QueryContext(ctx, tx, &departedDatabases); err != nil {
			return fmt.Errorf("list departed databases: %w", err)
		}

		if len(departedDatabases) == 0 {
			return nil
		}

		departedNames := make([]postgres.Expression, len(departedDatabases))

		departedRoots := make([]string, len(departedDatabases))
		for i, d := range departedDatabases {
			departedNames[i] = postgres.String(d.Name)
			departedRoots[i] = scopeDatabase(instanceID, d.Name)
		}

		if err := deleteSyncStateSubtrees(ctx, tx, departedRoots); err != nil {
			return fmt.Errorf("delete departed-database sync states: %w", err)
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
	}
}

func upsertDatabases(ctx context.Context, tx storage.QueryExecutor, databases []model.CatalogDatabase) error {
	// Existing rows for surviving databases have their metadata refreshed;
	// descendants and child sync_state are left untouched.
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
}
