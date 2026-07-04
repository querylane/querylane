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

// ListTableConstraints returns all cached constraints for a table.
func (r *PGRepository) ListTableConstraints(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableConstraint, error) {
	stmt := postgres.SELECT(table.CatalogTableConstraint.AllColumns).
		FROM(table.CatalogTableConstraint).
		WHERE(
			table.CatalogTableConstraint.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogTableConstraint.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogTableConstraint.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogTableConstraint.TableName_.EQ(postgres.String(tableName))),
		).
		ORDER_BY(table.CatalogTableConstraint.Name.ASC())

	var rows []model.CatalogTableConstraint
	if err := stmt.QueryContext(ctx, r.db, &rows); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("list constraints: %w", err)
	}

	return rows, nil
}

// SyncTableConstraints replaces the cached constraint list for a table in one transaction.
func (r *PGRepository) SyncTableConstraints(ctx context.Context, instanceID, databaseName, schemaName, tableName string, constraints []model.CatalogTableConstraint) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogTableConstraint.DELETE().
			WHERE(
				table.CatalogTableConstraint.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogTableConstraint.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogTableConstraint.SchemaName_.EQ(postgres.String(schemaName))).
					AND(table.CatalogTableConstraint.TableName_.EQ(postgres.String(tableName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old constraints: %w", err)
		}

		if len(constraints) == 0 {
			return nil
		}

		stmt := table.CatalogTableConstraint.
			INSERT(
				table.CatalogTableConstraint.InstanceID,
				table.CatalogTableConstraint.DatabaseName,
				table.CatalogTableConstraint.SchemaName_,
				table.CatalogTableConstraint.TableName_,
				table.CatalogTableConstraint.Name,
				table.CatalogTableConstraint.Type,
				table.CatalogTableConstraint.ColumnNames,
				table.CatalogTableConstraint.ReferencedSchemaName,
				table.CatalogTableConstraint.ReferencedTableName,
				table.CatalogTableConstraint.ReferencedColumnNames,
				table.CatalogTableConstraint.OnUpdate,
				table.CatalogTableConstraint.OnDelete,
				table.CatalogTableConstraint.Definition,
				table.CatalogTableConstraint.SyncedAt,
			).
			MODELS(constraints)

		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("insert constraints: %w", err)
		}

		return nil
	})
}
