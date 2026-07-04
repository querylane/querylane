package catalogcache

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// syncFunc runs an on-demand sync of a single catalog scope.
type syncFunc = func(context.Context) error

// listPaginated runs a paginated cached read with sync-on-stale.
//
// When emptyRetry is non-nil and the result is empty, it is invoked to verify
// the parent still exists; if the scope has since gone stale, the read is
// resynced and retried once. This distinguishes "genuinely empty" from "rows
// removed between ensureFresh and the read by a concurrent parent sync".
func listPaginated[Row, Out any](
	ctx context.Context,
	c *Catalog,
	scope string,
	sync syncFunc,
	fetch func(context.Context, aip.Params) ([]Row, string, error),
	emptyRetry func(context.Context) error,
	convert func(Row) Out,
	params aip.Params,
) ([]Out, string, error) {
	out, nextToken, _, err := listPaginatedWithSyncMetadata(ctx, c, scope, sync, fetch, emptyRetry, convert, params)
	return out, nextToken, err
}

func listPaginatedWithSyncMetadata[Row, Out any](
	ctx context.Context,
	c *Catalog,
	scope string,
	sync syncFunc,
	fetch func(context.Context, aip.Params) ([]Row, string, error),
	emptyRetry func(context.Context) error,
	convert func(Row) Out,
	params aip.Params,
) ([]Out, string, CatalogSyncMetadata, error) {
	if err := c.ensureFresh(ctx, scope, sync); err != nil {
		return nil, "", CatalogSyncMetadata{}, err
	}

	rows, nextToken, err := fetch(ctx, params)
	if err != nil {
		return nil, "", CatalogSyncMetadata{}, err
	}

	if len(rows) == 0 && emptyRetry != nil {
		rows, nextToken, err = retryPaginatedIfStale(ctx, c, scope, sync, fetch, emptyRetry, params)
		if err != nil {
			return nil, "", CatalogSyncMetadata{}, err
		}
	}

	out := make([]Out, len(rows))
	for i, row := range rows {
		out[i] = convert(row)
	}

	state, stateErr := c.syncStore.GetSyncState(ctx, scope)

	metadata, err := c.syncMetadata(syncStateResult{state: state, err: stateErr})
	if err != nil {
		slog.WarnContext(ctx, "failed to read catalog sync metadata",
			slog.String("scope", scope),
			slog.String("error", err.Error()))

		metadata = CatalogSyncMetadata{
			Status:  CatalogSyncStatusNeverSynced,
			IsStale: true,
		}
	}

	return out, nextToken, metadata, nil
}

// retryPaginatedIfStale verifies the parent still exists and, if the scope has
// since gone stale, runs a single resync + re-fetch. On stale-but-no-resync it
// returns nil rows, signalling the caller to keep the original empty result.
func retryPaginatedIfStale[Row any](
	ctx context.Context,
	c *Catalog,
	scope string,
	sync syncFunc,
	fetch func(context.Context, aip.Params) ([]Row, string, error),
	emptyRetry func(context.Context) error,
	params aip.Params,
) ([]Row, string, error) {
	if err := emptyRetry(ctx); err != nil {
		return nil, "", err
	}

	didResync, err := c.resyncIfStale(ctx, scope, sync)
	if err != nil {
		return nil, "", err
	}

	if !didResync {
		return nil, "", nil
	}

	return fetch(ctx, params)
}

// listAll runs a non-paginated cached read with sync-on-stale.
// emptyRetry has the same semantics as in listPaginated. op is used to wrap
// repository errors with context (e.g. "list columns").
func listAll[Row, Out any](
	ctx context.Context,
	c *Catalog,
	scope, op string,
	sync syncFunc,
	fetch func(context.Context) ([]Row, error),
	emptyRetry func(context.Context) error,
	convert func(Row) Out,
) ([]Out, error) {
	if err := c.ensureFresh(ctx, scope, sync); err != nil {
		return nil, err
	}

	rows, err := fetch(ctx)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", op, err)
	}

	if len(rows) == 0 && emptyRetry != nil {
		rows, err = retryListIfStale(ctx, c, scope, op, sync, fetch, emptyRetry)
		if err != nil {
			return nil, err
		}
	}

	out := make([]Out, len(rows))
	for i, row := range rows {
		out[i] = convert(row)
	}

	return out, nil
}

// retryListIfStale is the non-paginated twin of retryPaginatedIfStale.
// Only fetch errors are wrapped with op; emptyRetry/resync errors pass through
// unchanged to preserve their sentinel semantics.
func retryListIfStale[Row any](
	ctx context.Context,
	c *Catalog,
	scope, op string,
	sync syncFunc,
	fetch func(context.Context) ([]Row, error),
	emptyRetry func(context.Context) error,
) ([]Row, error) {
	if err := emptyRetry(ctx); err != nil {
		return nil, err
	}

	didResync, err := c.resyncIfStale(ctx, scope, sync)
	if err != nil {
		return nil, err
	}

	if !didResync {
		return nil, nil
	}

	rows, err := fetch(ctx)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", op, err)
	}

	return rows, nil
}

// getOne runs a cached single-row read with sync-on-stale.
//
// When notFound is non-nil, storage.ErrNotFound is translated to that sentinel
// and parentMissing (if set) is invoked first so its error takes precedence —
// this lets callers distinguish "table doesn't exist" from "schema doesn't
// exist" without a second roundtrip in the happy path. When notFound is nil,
// ErrNotFound is wrapped with op like any other repository error.
func getOne[Row, Out any](
	ctx context.Context,
	c *Catalog,
	scope, op string,
	sync syncFunc,
	fetch func(context.Context) (*Row, error),
	parentMissing func(context.Context) error,
	convert func(Row) Out,
	notFound error,
) (*Out, error) {
	if err := c.ensureFresh(ctx, scope, sync); err != nil {
		return nil, err
	}

	row, err := fetch(ctx)
	if err == nil {
		result := convert(*row)
		return &result, nil
	}

	if notFound == nil || !errors.Is(err, storage.ErrNotFound) {
		return nil, fmt.Errorf("%s: %w", op, err)
	}

	if parentMissing != nil {
		if parentErr := parentMissing(ctx); parentErr != nil {
			return nil, parentErr
		}
	}

	return nil, notFound
}

// ListDatabases returns databases for an instance from the catalog.
// Triggers sync if data is stale or missing.
func (c *Catalog) ListDatabases(ctx context.Context, instance resource.InstanceName, params aip.Params) ([]engine.Database, string, error) {
	return listPaginated(ctx, c,
		instance.String()+"/databases",
		func(ctx context.Context) error { return c.syncDatabases(ctx, instance.InstanceID, instance) },
		func(ctx context.Context, p aip.Params) ([]model.CatalogDatabase, string, error) {
			return c.repo.ListDatabases(ctx, instance.InstanceID, p)
		},
		nil,
		catalogDBToEngine,
		params,
	)
}

// GetDatabase retrieves a single database from the catalog.
func (c *Catalog) GetDatabase(ctx context.Context, db resource.DatabaseName) (*engine.Database, error) {
	return getOne(ctx, c,
		db.Instance().String()+"/databases", "get database",
		func(ctx context.Context) error { return c.syncDatabases(ctx, db.InstanceID, db.Instance()) },
		func(ctx context.Context) (*model.CatalogDatabase, error) {
			return c.repo.GetDatabase(ctx, db.InstanceID, db.DatabaseID)
		},
		nil,
		catalogDBToEngine,
		engine.ErrDatabaseNotFound,
	)
}

// ListSchemas returns schemas for a database from the catalog.
func (c *Catalog) ListSchemas(ctx context.Context, db resource.DatabaseName, params aip.Params) ([]engine.Schema, string, error) {
	schemas, nextToken, _, err := c.ListSchemasWithSyncMetadata(ctx, db, params)
	return schemas, nextToken, err
}

func (c *Catalog) ListSchemasWithSyncMetadata(ctx context.Context, db resource.DatabaseName, params aip.Params) ([]engine.Schema, string, CatalogSyncMetadata, error) {
	return listPaginatedWithSyncMetadata(ctx, c,
		db.String()+"/schemas",
		func(ctx context.Context) error {
			return c.syncSchemas(ctx, db.InstanceID, db.DatabaseID, db.Instance())
		},
		func(ctx context.Context, p aip.Params) ([]model.CatalogSchema, string, error) {
			return c.repo.ListSchemas(ctx, db.InstanceID, db.DatabaseID, p)
		},
		nil,
		catalogSchemaToEngine,
		params,
	)
}

// GetSchema retrieves a single schema from the catalog.
func (c *Catalog) GetSchema(ctx context.Context, schema resource.SchemaName) (*engine.Schema, error) {
	return getOne(ctx, c,
		schema.Parent().String()+"/schemas", "get schema",
		func(ctx context.Context) error {
			return c.syncSchemas(ctx, schema.InstanceID, schema.DatabaseID, schema.Instance())
		},
		func(ctx context.Context) (*model.CatalogSchema, error) {
			return c.repo.GetSchema(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID)
		},
		nil,
		catalogSchemaToEngine,
		engine.ErrSchemaNotFound,
	)
}

// ListTables returns tables for a schema from the catalog.
func (c *Catalog) ListTables(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.Table, string, error) {
	tables, nextToken, _, err := c.ListTablesWithSyncMetadata(ctx, schema, params)
	return tables, nextToken, err
}

func (c *Catalog) ListTablesWithSyncMetadata(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.Table, string, CatalogSyncMetadata, error) {
	return listPaginatedWithSyncMetadata(ctx, c,
		schema.String()+"/tables",
		func(ctx context.Context) error {
			return c.syncTables(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID, schema.Instance())
		},
		func(ctx context.Context, p aip.Params) ([]model.CatalogTable, string, error) {
			return c.repo.ListTables(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID, p)
		},
		func(ctx context.Context) error { return c.EnsureSchemaExists(ctx, schema) },
		catalogTableToEngine,
		params,
	)
}

// GetTable retrieves a single table from the catalog.
func (c *Catalog) GetTable(ctx context.Context, tbl resource.TableName) (*engine.Table, error) {
	return getOne(ctx, c,
		tbl.Parent().String()+"/tables", "get table",
		func(ctx context.Context) error {
			return c.syncTables(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.Instance())
		},
		func(ctx context.Context) (*model.CatalogTable, error) {
			return c.repo.GetTable(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureSchemaExists(ctx, tbl.Schema()) },
		catalogTableToEngine,
		engine.ErrTableNotFound,
	)
}

func (c *Catalog) GetTablePartitionMetadata(ctx context.Context, tbl resource.TableName) (*engine.TablePartitionMetadata, error) {
	if err := c.EnsureTableExists(ctx, tbl); err != nil {
		return nil, err
	}

	dbSession, closeFn, err := c.openDatabaseSession(ctx, tbl.Instance(), tbl.DatabaseID)
	if err != nil {
		return nil, err
	}
	defer closeFn()

	metadata, err := dbSession.GetTablePartitionMetadata(ctx, tbl.SchemaID, tbl.TableID)
	if err != nil {
		return nil, fmt.Errorf("get table partition metadata: %w", err)
	}

	return metadata, nil
}

// ListViews returns views for a schema from the catalog.
func (c *Catalog) ListViews(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.View, string, error) {
	return listPaginated(ctx, c,
		schema.String()+"/views",
		func(ctx context.Context) error {
			return c.syncViews(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID, schema.Instance())
		},
		func(ctx context.Context, p aip.Params) ([]model.CatalogView, string, error) {
			return c.repo.ListViews(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID, p)
		},
		func(ctx context.Context) error { return c.EnsureSchemaExists(ctx, schema) },
		catalogViewToEngine,
		params,
	)
}

// GetView retrieves a single view from the catalog.
func (c *Catalog) GetView(ctx context.Context, view resource.ViewName) (*engine.View, error) {
	return getOne(ctx, c,
		view.Parent().String()+"/views", "get view",
		func(ctx context.Context) error {
			return c.syncViews(ctx, view.InstanceID, view.DatabaseID, view.SchemaID, view.Instance())
		},
		func(ctx context.Context) (*model.CatalogView, error) {
			return c.repo.GetView(ctx, view.InstanceID, view.DatabaseID, view.SchemaID, view.ViewID)
		},
		func(ctx context.Context) error { return c.EnsureSchemaExists(ctx, view.Schema()) },
		catalogViewToEngine,
		engine.ErrViewNotFound,
	)
}

// ListTableColumns returns all columns for a table from the catalog.
func (c *Catalog) ListTableColumns(ctx context.Context, tbl resource.TableName) ([]engine.Column, error) {
	return listAll(ctx, c,
		tbl.String()+"/columns", "list columns",
		func(ctx context.Context) error {
			return c.syncColumns(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID, tbl.Instance())
		},
		func(ctx context.Context) ([]model.CatalogColumn, error) {
			return c.repo.ListTableColumns(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureTableExists(ctx, tbl) },
		catalogColumnToEngine,
	)
}

// ListTableConstraints returns all constraints for a table from the catalog.
func (c *Catalog) ListTableConstraints(ctx context.Context, tbl resource.TableName) ([]engine.TableConstraint, error) {
	return listAll(ctx, c,
		tbl.String()+"/constraints", "list constraints",
		func(ctx context.Context) error {
			return c.syncTableConstraints(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID, tbl.Instance())
		},
		func(ctx context.Context) ([]model.CatalogTableConstraint, error) {
			return c.repo.ListTableConstraints(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureTableExists(ctx, tbl) },
		catalogConstraintToEngine,
	)
}

// ListTableIndexes returns all indexes for a table from the catalog.
func (c *Catalog) ListTableIndexes(ctx context.Context, tbl resource.TableName) ([]engine.TableIndex, error) {
	return listAll(ctx, c,
		tbl.String()+"/indexes", "list indexes",
		func(ctx context.Context) error {
			return c.syncTableIndexes(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID, tbl.Instance())
		},
		func(ctx context.Context) ([]model.CatalogTableIndex, error) {
			return c.repo.ListTableIndexes(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureTableExists(ctx, tbl) },
		catalogIndexToEngine,
	)
}

// ListTablePolicies returns all RLS policies for a table from the catalog.
func (c *Catalog) ListTablePolicies(ctx context.Context, tbl resource.TableName) ([]engine.TablePolicy, error) {
	return listAll(ctx, c,
		tbl.String()+"/policies", "list policies",
		func(ctx context.Context) error {
			return c.syncTablePolicies(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID, tbl.Instance())
		},
		func(ctx context.Context) ([]model.CatalogTablePolicy, error) {
			return c.repo.ListTablePolicies(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureTableExists(ctx, tbl) },
		catalogPolicyToEngine,
	)
}

// ListTableTriggers returns all triggers for a table from the catalog.
func (c *Catalog) ListTableTriggers(ctx context.Context, tbl resource.TableName) ([]engine.TableTrigger, error) {
	return listAll(ctx, c,
		tbl.String()+"/triggers", "list triggers",
		func(ctx context.Context) error {
			return c.syncTableTriggers(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID, tbl.Instance())
		},
		func(ctx context.Context) ([]model.CatalogTableTrigger, error) {
			return c.repo.ListTableTriggers(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
		},
		func(ctx context.Context) error { return c.EnsureTableExists(ctx, tbl) },
		catalogTriggerToEngine,
	)
}

// GetServerInfo returns cached server info for an instance, syncing if stale.
func (c *Catalog) GetServerInfo(ctx context.Context, instance resource.InstanceName) (*engine.ServerInfo, error) {
	return getOne(ctx, c,
		instance.String()+"/server_info", "get server info",
		func(ctx context.Context) error { return c.syncServerInfo(ctx, instance) },
		func(ctx context.Context) (*model.CatalogServerInfo, error) {
			return c.repo.GetServerInfo(ctx, instance.InstanceID)
		},
		nil,
		catalogServerInfoToEngine,
		nil,
	)
}
