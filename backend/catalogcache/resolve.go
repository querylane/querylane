package catalogcache

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
)

func (c *Catalog) isScopeFresh(ctx context.Context, scope string) (bool, error) {
	state, err := c.syncStore.GetSyncState(ctx, scope)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return false, nil
		}

		return false, fmt.Errorf("get sync state: %w", err)
	}

	if state == nil || state.Status != catalog.SyncStatusSynced || state.LastSyncedAt == nil {
		return false, nil
	}

	return time.Since(*state.LastSyncedAt) < c.config.StalenessThreshold, nil
}

func (c *Catalog) cachedSchemaExists(ctx context.Context, schema resource.SchemaName) (bool, bool, error) {
	scope := schema.Parent().String() + "/schemas"

	fresh, err := c.isScopeFresh(ctx, scope)
	if err != nil || !fresh {
		return false, fresh, err
	}

	_, err = c.repo.GetSchema(ctx, schema.InstanceID, schema.DatabaseID, schema.SchemaID)
	if err == nil {
		return true, true, nil
	}

	if errors.Is(err, storage.ErrNotFound) {
		return false, true, nil
	}

	return false, true, fmt.Errorf("get cached schema: %w", err)
}

func (c *Catalog) cachedTableExists(ctx context.Context, tbl resource.TableName) (bool, bool, error) {
	scope := tbl.Parent().String() + "/tables"

	fresh, err := c.isScopeFresh(ctx, scope)
	if err != nil || !fresh {
		return false, fresh, err
	}

	_, err = c.repo.GetTable(ctx, tbl.InstanceID, tbl.DatabaseID, tbl.SchemaID, tbl.TableID)
	if err == nil {
		return true, true, nil
	}

	if errors.Is(err, storage.ErrNotFound) {
		return false, true, nil
	}

	return false, true, fmt.Errorf("get cached table: %w", err)
}

// EnsureDatabaseExists verifies that the database exists without syncing the
// full database catalog scope unless the cache is already fresh.
func (c *Catalog) EnsureDatabaseExists(ctx context.Context, db resource.DatabaseName) error {
	scope := db.Instance().String() + "/databases"

	fresh, err := c.isScopeFresh(ctx, scope)
	if err != nil {
		return err
	}

	if fresh {
		_, err := c.repo.GetDatabase(ctx, db.InstanceID, db.DatabaseID)
		if err == nil {
			return nil
		}

		if errors.Is(err, storage.ErrNotFound) {
			return engine.ErrDatabaseNotFound
		}

		return fmt.Errorf("get cached database: %w", err)
	}

	session, err := c.engine.OpenInstance(ctx, db.Instance())
	if err != nil {
		return fmt.Errorf("open instance: %w", err)
	}
	defer session.Close()

	_, err = session.GetDatabase(ctx, db.DatabaseID)
	if err != nil {
		return err
	}

	return nil
}

// EnsureSchemaExists verifies that the schema exists using a fresh cached
// schema scope when possible, otherwise a targeted live probe.
func (c *Catalog) EnsureSchemaExists(ctx context.Context, schema resource.SchemaName) error {
	if exists, fresh, err := c.cachedSchemaExists(ctx, schema); err != nil {
		return err
	} else if fresh {
		if exists {
			return nil
		}

		return engine.ErrSchemaNotFound
	}

	dbSession, closeFn, err := c.openDatabaseSession(ctx, schema.Instance(), schema.DatabaseID)
	if err != nil {
		return err
	}
	defer closeFn()

	_, err = dbSession.GetSchema(ctx, schema.SchemaID)
	if err != nil {
		return err
	}

	return nil
}

// EnsureTableExists verifies that the table exists using fresh cached table and
// schema scopes when possible, otherwise targeted live probes.
func (c *Catalog) EnsureTableExists(ctx context.Context, tbl resource.TableName) error {
	if exists, fresh, err := c.cachedTableExists(ctx, tbl); err != nil {
		return err
	} else if fresh && exists {
		return nil
	}

	if err := c.EnsureSchemaExists(ctx, tbl.Schema()); err != nil {
		return err
	}

	if exists, fresh, err := c.cachedTableExists(ctx, tbl); err != nil {
		return err
	} else if fresh {
		if exists {
			return nil
		}

		return engine.ErrTableNotFound
	}

	dbSession, closeFn, err := c.openDatabaseSession(ctx, tbl.Instance(), tbl.DatabaseID)
	if err != nil {
		return err
	}
	defer closeFn()

	_, err = dbSession.GetTable(ctx, tbl.SchemaID, tbl.TableID)
	if err != nil {
		return err
	}

	return nil
}
