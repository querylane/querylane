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

// ListTableColumns returns all cached columns for a table, ordered by ordinal position.
func (r *PGRepository) ListTableColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogColumn, error) {
	stmt := postgres.SELECT(table.CatalogColumn.AllColumns).
		FROM(table.CatalogColumn).
		WHERE(
			table.CatalogColumn.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogColumn.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogColumn.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogColumn.TableName_.EQ(postgres.String(tableName))),
		).
		ORDER_BY(table.CatalogColumn.OrdinalPosition.ASC())

	var rows []model.CatalogColumn
	if err := stmt.QueryContext(ctx, r.db, &rows); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("list columns: %w", err)
	}

	return rows, nil
}

// SyncColumns replaces the cached column list for a table in one transaction.
func (r *PGRepository) SyncColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string, columns []model.CatalogColumn) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogColumn.DELETE().
			WHERE(
				table.CatalogColumn.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogColumn.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogColumn.SchemaName_.EQ(postgres.String(schemaName))).
					AND(table.CatalogColumn.TableName_.EQ(postgres.String(tableName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old columns: %w", err)
		}

		if len(columns) > 0 {
			stmt := table.CatalogColumn.
				INSERT(
					table.CatalogColumn.InstanceID,
					table.CatalogColumn.DatabaseName,
					table.CatalogColumn.SchemaName_,
					table.CatalogColumn.TableName_,
					table.CatalogColumn.Name,
					table.CatalogColumn.OrdinalPosition,
					table.CatalogColumn.DataType,
					table.CatalogColumn.RawType,
					table.CatalogColumn.IsNullable,
					table.CatalogColumn.IsPrimaryKey,
					table.CatalogColumn.IsUnique,
					table.CatalogColumn.DefaultValue,
					table.CatalogColumn.CharacterMaximumLength,
					table.CatalogColumn.Comment,
					table.CatalogColumn.SyncedAt,
					table.CatalogColumn.IsGenerated,
					table.CatalogColumn.GenerationExpression,
					table.CatalogColumn.IsIdentity,
					table.CatalogColumn.IdentityGeneration,
				).
				MODELS(columns)

			if _, err := stmt.ExecContext(ctx, tx); err != nil {
				return fmt.Errorf("insert columns: %w", err)
			}
		}

		return nil
	})
}
