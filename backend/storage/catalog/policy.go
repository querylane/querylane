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

// ListTablePolicies returns all cached RLS policies for a table.
func (r *PGRepository) ListTablePolicies(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTablePolicy, error) {
	stmt := postgres.SELECT(table.CatalogTablePolicy.AllColumns).
		FROM(table.CatalogTablePolicy).
		WHERE(
			table.CatalogTablePolicy.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogTablePolicy.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogTablePolicy.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogTablePolicy.TableName_.EQ(postgres.String(tableName))),
		).
		ORDER_BY(table.CatalogTablePolicy.Name.ASC())

	var rows []model.CatalogTablePolicy
	if err := stmt.QueryContext(ctx, r.db, &rows); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}

		return nil, fmt.Errorf("list policies: %w", err)
	}

	return rows, nil
}

// SyncTablePolicies replaces the cached policy list for a table in one transaction.
func (r *PGRepository) SyncTablePolicies(ctx context.Context, instanceID, databaseName, schemaName, tableName string, policies []model.CatalogTablePolicy) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogTablePolicy.DELETE().
			WHERE(
				table.CatalogTablePolicy.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogTablePolicy.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogTablePolicy.SchemaName_.EQ(postgres.String(schemaName))).
					AND(table.CatalogTablePolicy.TableName_.EQ(postgres.String(tableName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old policies: %w", err)
		}

		if len(policies) == 0 {
			return nil
		}

		stmt := table.CatalogTablePolicy.
			INSERT(
				table.CatalogTablePolicy.InstanceID,
				table.CatalogTablePolicy.DatabaseName,
				table.CatalogTablePolicy.SchemaName_,
				table.CatalogTablePolicy.TableName_,
				table.CatalogTablePolicy.Name,
				table.CatalogTablePolicy.Mode,
				table.CatalogTablePolicy.Command,
				table.CatalogTablePolicy.Roles,
				table.CatalogTablePolicy.UsingExpression,
				table.CatalogTablePolicy.CheckExpression,
				table.CatalogTablePolicy.SyncedAt,
			).
			MODELS(policies)

		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("insert policies: %w", err)
		}

		return nil
	})
}
