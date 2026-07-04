package catalog

import (
	"context"
	"errors"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// ListTableIndexes returns all cached indexes for a table.
func (r *PGRepository) ListTableIndexes(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableIndex, error) {
	stmt := postgres.SELECT(table.CatalogTableIndex.AllColumns).
		FROM(table.CatalogTableIndex).
		WHERE(
			table.CatalogTableIndex.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogTableIndex.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogTableIndex.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogTableIndex.TableName_.EQ(postgres.String(tableName))),
		).
		ORDER_BY(table.CatalogTableIndex.Name.ASC())

	var rows []model.CatalogTableIndex
	if err := stmt.QueryContext(ctx, r.db, &rows); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("list indexes: %w", err)
	}

	return rows, nil
}

// SyncTableIndexes replaces the cached index list for a table in one transaction.
func (r *PGRepository) SyncTableIndexes(ctx context.Context, instanceID, databaseName, schemaName, tableName string, indexes []model.CatalogTableIndex) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogTableIndex.DELETE().
			WHERE(
				table.CatalogTableIndex.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogTableIndex.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogTableIndex.SchemaName_.EQ(postgres.String(schemaName))).
					AND(table.CatalogTableIndex.TableName_.EQ(postgres.String(tableName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old indexes: %w", err)
		}

		if len(indexes) == 0 {
			return nil
		}

		stmt := table.CatalogTableIndex.
			INSERT(
				table.CatalogTableIndex.InstanceID,
				table.CatalogTableIndex.DatabaseName,
				table.CatalogTableIndex.SchemaName_,
				table.CatalogTableIndex.TableName_,
				table.CatalogTableIndex.Name,
				table.CatalogTableIndex.Method,
				table.CatalogTableIndex.IsUnique,
				table.CatalogTableIndex.KeyColumns,
				table.CatalogTableIndex.IncludedColumns,
				table.CatalogTableIndex.Predicate,
				table.CatalogTableIndex.SizeBytes,
				table.CatalogTableIndex.SyncedAt,
			).
			MODELS(indexes)

		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("insert indexes: %w", err)
		}

		return nil
	})
}
