//nolint:dupl // Jet query builder boilerplate is structurally similar across per-resource files; this is intentional, not duplication to eliminate.
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

// ListTableTriggers returns all cached triggers for a table.
func (r *PGRepository) ListTableTriggers(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableTrigger, error) {
	stmt := postgres.SELECT(table.CatalogTableTrigger.AllColumns).
		FROM(table.CatalogTableTrigger).
		WHERE(
			table.CatalogTableTrigger.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogTableTrigger.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogTableTrigger.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogTableTrigger.TableName_.EQ(postgres.String(tableName))),
		).
		ORDER_BY(table.CatalogTableTrigger.Name.ASC())

	var rows []model.CatalogTableTrigger
	if err := stmt.QueryContext(ctx, r.db, &rows); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("list triggers: %w", err)
	}

	return rows, nil
}

// SyncTableTriggers replaces the cached trigger list for a table in one transaction.
func (r *PGRepository) SyncTableTriggers(ctx context.Context, instanceID, databaseName, schemaName, tableName string, triggers []model.CatalogTableTrigger) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogTableTrigger.DELETE().
			WHERE(
				table.CatalogTableTrigger.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogTableTrigger.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogTableTrigger.SchemaName_.EQ(postgres.String(schemaName))).
					AND(table.CatalogTableTrigger.TableName_.EQ(postgres.String(tableName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old triggers: %w", err)
		}

		if len(triggers) == 0 {
			return nil
		}

		stmt := table.CatalogTableTrigger.
			INSERT(
				table.CatalogTableTrigger.InstanceID,
				table.CatalogTableTrigger.DatabaseName,
				table.CatalogTableTrigger.SchemaName_,
				table.CatalogTableTrigger.TableName_,
				table.CatalogTableTrigger.Name,
				table.CatalogTableTrigger.Timing,
				table.CatalogTableTrigger.Events,
				table.CatalogTableTrigger.FunctionName,
				table.CatalogTableTrigger.Enabled,
				table.CatalogTableTrigger.Definition,
				table.CatalogTableTrigger.SyncedAt,
			).
			MODELS(triggers)

		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("insert triggers: %w", err)
		}

		return nil
	})
}
