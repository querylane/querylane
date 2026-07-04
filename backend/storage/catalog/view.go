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

var catalogViewSchema = aipjet.Bind(
	aip.NewSchema[model.CatalogView](
		"console.querylane.dev/View",
		aip.Fields[model.CatalogView]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *model.CatalogView) any { return m.Name },
				Filterable: true,
			},
		},
		aip.WithNameOrdering(),
	),
	aipjet.Columns{
		"name": table.CatalogView.Name,
	},
)

// ListViews returns a page of cached views under a schema.
func (r *PGRepository) ListViews(ctx context.Context, instanceID, databaseName, schemaName string, params aip.Params) ([]model.CatalogView, string, error) {
	baseQuery := postgres.SELECT(table.CatalogView.AllColumns).FROM(table.CatalogView)
	baseCondition := table.CatalogView.InstanceID.EQ(postgres.String(instanceID)).
		AND(table.CatalogView.DatabaseName.EQ(postgres.String(databaseName))).
		AND(table.CatalogView.SchemaName_.EQ(postgres.String(schemaName)))

	params.Filter = normalizeLegacyCatalogFilter(params.Filter)

	rows, nextToken, err := aipjet.ExecuteWithCondition(ctx, catalogViewSchema, params, baseQuery, baseCondition, r.db)
	if err != nil {
		return nil, "", fmt.Errorf("query views: %w", err)
	}

	return rows, nextToken, nil
}

// GetView returns the cached row for one view; storage.ErrNotFound when absent.
func (r *PGRepository) GetView(ctx context.Context, instanceID, databaseName, schemaName, name string) (*model.CatalogView, error) {
	stmt := postgres.SELECT(table.CatalogView.AllColumns).
		FROM(table.CatalogView).
		WHERE(
			table.CatalogView.InstanceID.EQ(postgres.String(instanceID)).
				AND(table.CatalogView.DatabaseName.EQ(postgres.String(databaseName))).
				AND(table.CatalogView.SchemaName_.EQ(postgres.String(schemaName))).
				AND(table.CatalogView.Name.EQ(postgres.String(name))),
		)

	var row model.CatalogView
	if err := stmt.QueryContext(ctx, r.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, fmt.Errorf("get view: %w", err)
	}

	return &row, nil
}

// SyncViews replaces the cached view list for a schema in one transaction.
func (r *PGRepository) SyncViews(ctx context.Context, instanceID, databaseName, schemaName string, views []model.CatalogView) error {
	return storage.RunInTransaction(ctx, r.db, func(tx storage.QueryExecutor) error {
		if _, err := table.CatalogView.DELETE().
			WHERE(
				table.CatalogView.InstanceID.EQ(postgres.String(instanceID)).
					AND(table.CatalogView.DatabaseName.EQ(postgres.String(databaseName))).
					AND(table.CatalogView.SchemaName_.EQ(postgres.String(schemaName))),
			).
			ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("delete old views: %w", err)
		}

		if len(views) == 0 {
			return nil
		}

		stmt := table.CatalogView.
			INSERT(
				table.CatalogView.InstanceID,
				table.CatalogView.DatabaseName,
				table.CatalogView.SchemaName_,
				table.CatalogView.Name,
				table.CatalogView.DisplayName,
				table.CatalogView.ViewType,
				table.CatalogView.Owner,
				table.CatalogView.Comment,
				table.CatalogView.IsSystemView,
				table.CatalogView.Definition,
				table.CatalogView.SizeBytes,
				table.CatalogView.RowCount,
				table.CatalogView.IsPopulated,
				table.CatalogView.SyncedAt,
			).
			MODELS(views)

		if _, err := stmt.ExecContext(ctx, tx); err != nil {
			return fmt.Errorf("insert views: %w", err)
		}

		return nil
	})
}
