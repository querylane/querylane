package catalogcache

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// ensureFresh checks whether the scope is fresh. If stale or missing, it runs
// a sync from the live instance.
//
// The syncCache (twmb/go-cache) does in-process coalescing AND the short
// error cooldown in one call: concurrent miss callers are collapsed onto a
// single ensureFreshUncached invocation, and any error it returns is replayed
// to subsequent callers for ~errorCooldown so a failing upstream isn't
// hammered. Success results are NOT retained (MaxAge=0) — catalog_sync_state
// in the meta DB is the single source of truth for freshness, so the next
// caller always re-consults it. Force-refresh bypasses the cache entirely.
func (c *Catalog) ensureFresh(ctx context.Context, scope string, syncFn func(ctx context.Context) error) error {
	if isForceRefresh(ctx) {
		return c.claimAndSync(ctx, scope, syncFn)
	}

	_, err, _ := c.syncCache.Get(scope, func() (struct{}, error) {
		// Detach from the caller's context so that a single cancelled
		// request (e.g. React StrictMode unmount) cannot abort the
		// shared miss function that other coalesced callers depend on.
		return struct{}{}, c.ensureFreshUncached(context.WithoutCancel(ctx), scope, syncFn)
	})

	return err
}

// ensureFreshUncached is the original staleness check logic, called via the
// singleflight group's miss function for request collapsing.
func (c *Catalog) ensureFreshUncached(ctx context.Context, scope string, syncFn func(ctx context.Context) error) error {
	state, err := c.syncStore.GetSyncState(ctx, scope)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		return fmt.Errorf("check sync state: %w", err)
	}

	if state != nil && state.Status == catalog.SyncStatusSynced && state.LastSyncedAt != nil {
		age := time.Since(*state.LastSyncedAt)
		if age < c.config.StalenessThreshold {
			return nil // fresh — use cached data
		}
	}

	if state != nil && state.Status == catalog.SyncStatusError && state.LastSyncedAt != nil && time.Since(state.UpdatedAt) < errorCooldown {
		return nil // recent refresh failure — serve stale data during cooldown
	}

	return c.claimAndSync(ctx, scope, syncFn)
}

// claimAndSync tries to acquire the sync lock for the scope and run the sync.
// If another instance holds the lock:
//   - If stale data exists (LastSyncedAt != nil): returns nil (stale-while-revalidate).
//   - If no data exists (cold miss): polls until the winner finishes syncing.
func (c *Catalog) claimAndSync(ctx context.Context, scope string, syncFn func(ctx context.Context) error) error {
	claimed, err := c.syncStore.ClaimSync(ctx, scope, catalog.SyncClaimOptions{
		Force:       isForceRefresh(ctx),
		StaleBefore: time.Now().Add(-c.config.StalenessThreshold),
	})
	if err != nil {
		return fmt.Errorf("claim sync lock: %w", err)
	}

	if !claimed {
		return c.waitIfColdMiss(ctx, scope, syncFn)
	}

	// Detach from the caller's context so the sync completes even if the
	// original RPC is canceled (e.g. client disconnect, React StrictMode
	// unmount). Other callers may be polling for this sync to finish.
	syncCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), c.config.SyncTimeout)
	defer cancel()

	if err := syncFn(syncCtx); err != nil {
		if markErr := c.syncStore.MarkSyncError(context.WithoutCancel(ctx), scope, err); markErr != nil {
			slog.ErrorContext(ctx, "failed to mark sync as error", slog.String("scope", scope), slog.String("error", markErr.Error()))
		}

		state, stateErr := c.syncStore.GetSyncState(context.WithoutCancel(ctx), scope)
		if stateErr == nil && state != nil && state.LastSyncedAt != nil && !isForceRefresh(ctx) {
			slog.WarnContext(ctx, "sync failed, serving stale catalog data",
				slog.String("scope", scope),
				slog.String("error", err.Error()))

			return nil
		}

		return fmt.Errorf("sync %s: %w", scope, err)
	}

	// Fatal on MarkSynced failure: syncFn already committed catalog rows, but
	// without a durable "synced" record the next parent refresh treats this
	// scope as never-synced and nukes the orphan rows. Returning the error
	// keeps the invariant "never return success unless durable sync state was
	// written" — the next reader will reclaim and retry.
	if err := c.syncStore.MarkSynced(context.WithoutCancel(ctx), scope); err != nil {
		return fmt.Errorf("mark sync as synced for %s: %w", scope, err)
	}

	return nil
}

// resyncIfStale runs claimAndSync iff scope's persistent sync state is not
// currently fresh. Used after a list read returns empty to distinguish
// "legitimately empty" from "rows were nuked between ensureFresh and the read"
// (e.g. a concurrent parent sync committing in that window). Returns true when
// a resync ran so the caller knows to re-fetch.
func (c *Catalog) resyncIfStale(ctx context.Context, scope string, syncFn func(ctx context.Context) error) (bool, error) {
	fresh, err := c.isScopeFresh(ctx, scope)
	if err != nil {
		return false, err
	}

	if fresh {
		return false, nil
	}

	if err := c.claimAndSync(ctx, scope, syncFn); err != nil {
		return false, err
	}

	return true, nil
}

// waitIfColdMiss decides what to do when this instance lost the ClaimSync race.
// If stale data exists (LastSyncedAt != nil) and this is not a force-refresh,
// it returns nil (stale-while-revalidate).
// If no data has ever been synced (cold miss), or if the caller requested a
// force-refresh, it polls until the winner finishes.
func (c *Catalog) waitIfColdMiss(ctx context.Context, scope string, syncFn func(ctx context.Context) error) error {
	state, err := c.syncStore.GetSyncState(ctx, scope)
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		return fmt.Errorf("get sync state for cold-miss check: %w", err)
	}

	// No row at all: the caller reached waitIfColdMiss after losing ClaimSync,
	// but in the meantime something deleted the row (e.g. an InvalidateInstance
	// landed). Re-attempt the claim rather than polling — pollForSyncCompletion
	// would just re-explode on the next ErrNotFound, and ClaimSync's
	// INSERT…ON CONFLICT will succeed (or coalesce on a concurrent winner).
	if state == nil {
		return c.claimAndSync(ctx, scope, syncFn)
	}

	if state.LastSyncedAt != nil && !isForceRefresh(ctx) {
		slog.DebugContext(ctx, "sync already in progress, serving stale data", slog.String("scope", scope))
		return nil
	}

	if state.LastSyncedAt != nil {
		slog.DebugContext(ctx, "force refresh: waiting for in-flight sync to complete", slog.String("scope", scope))
	} else {
		slog.DebugContext(ctx, "cold miss: waiting for sync winner to complete", slog.String("scope", scope))
	}

	return c.pollForSyncCompletion(ctx, scope, syncFn)
}

// pollForSyncCompletion polls GetSyncState with exponential backoff until the
// sync winner completes (status "synced"), fails (status "error"), the context
// is cancelled, or the lock holder appears to have crashed (UpdatedAt older
// than SyncLockTimeout), in which case it reclaims the lock.
func (c *Catalog) pollForSyncCompletion(ctx context.Context, scope string, syncFn func(ctx context.Context) error) error {
	const (
		initialBackoff = 50 * time.Millisecond
		maxBackoff     = 500 * time.Millisecond
		backoffFactor  = 2
	)

	backoff := initialBackoff

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}

		state, err := c.syncStore.GetSyncState(ctx, scope)
		if err != nil {
			// The row vanished mid-poll (e.g. a concurrent InvalidateInstance
			// landed). Re-attempt the claim, mirroring the pre-poll guard in
			// waitIfColdMiss: ClaimSync's INSERT…ON CONFLICT either wins or
			// coalesces on a concurrent winner.
			if errors.Is(err, storage.ErrNotFound) {
				slog.DebugContext(ctx, "sync state row deleted mid-poll, reclaiming",
					slog.String("scope", scope))

				return c.claimAndSync(ctx, scope, syncFn)
			}

			return fmt.Errorf("poll sync state: %w", err)
		}

		switch state.Status {
		case catalog.SyncStatusSynced:
			return nil
		case catalog.SyncStatusError:
			// The winner failed. Reclaim and run our own sync so typed
			// sentinel errors (e.g. engine.ErrInstanceNotFound) propagate
			// correctly to the API error mapper.
			slog.DebugContext(ctx, "sync winner failed, reclaiming",
				slog.String("scope", scope))

			return c.claimAndSync(ctx, scope, syncFn)
		case catalog.SyncStatusSyncing:
			if time.Since(state.UpdatedAt) > c.config.SyncLockTimeout {
				slog.WarnContext(ctx, "sync lock holder appears crashed, reclaiming",
					slog.String("scope", scope),
					slog.Time("updated_at", state.UpdatedAt))

				return c.claimAndSync(ctx, scope, syncFn)
			}
		}

		backoff = min(backoff*backoffFactor, maxBackoff)
	}
}

// syncDatabases fetches all databases from the live instance and writes them
// to the catalog via the repository.
func (c *Catalog) syncDatabases(ctx context.Context, instanceID string, instanceName resource.InstanceName) error {
	session, err := c.engine.OpenInstance(ctx, instanceName)
	if err != nil {
		return fmt.Errorf("open instance: %w", err)
	}
	defer session.Close()

	spool, err := spoolCatalogPages(ctx, "list databases", session.ListDatabases, func(db engine.Database, syncedAt time.Time) model.CatalogDatabase {
		return engineDBToCatalog(instanceID, db, syncedAt)
	})
	if err != nil {
		return err
	}
	defer spool.remove()

	return c.repo.SyncDatabasePages(ctx, instanceID, spool.syncedAt, spool.pages())
}

func (c *Catalog) openDatabaseSession(ctx context.Context, instanceName resource.InstanceName, databaseName string) (engine.DatabaseSession, func(), error) {
	session, err := c.engine.OpenInstance(ctx, instanceName)
	if err != nil {
		return nil, nil, fmt.Errorf("open instance: %w", err)
	}

	dbSession, err := session.OpenDatabase(ctx, databaseName)
	if err != nil {
		_ = session.Close()

		return nil, nil, fmt.Errorf("open database: %w", err)
	}

	closeFn := func() {
		_ = dbSession.Close()
		_ = session.Close()
	}

	return dbSession, closeFn, nil
}

// syncSchemas fetches all schemas for a database from the live instance and
// writes them to the catalog via the repository.
func (c *Catalog) syncSchemas(ctx context.Context, instanceID, databaseName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	spool, err := spoolCatalogPages(ctx, "list schemas", dbSession.ListSchemas, func(schema engine.Schema, syncedAt time.Time) model.CatalogSchema {
		return engineSchemaToCatalog(instanceID, databaseName, schema, syncedAt)
	})
	if err != nil {
		return err
	}
	defer spool.remove()

	return c.repo.SyncSchemaPages(ctx, instanceID, databaseName, spool.syncedAt, spool.pages())
}

// syncTables fetches all tables for a schema from the live instance and writes
// them to the catalog via the repository.
func (c *Catalog) syncTables(ctx context.Context, instanceID, databaseName, schemaName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	spool, err := spoolCatalogPages(ctx, "list tables", func(ctx context.Context, p aip.Params) ([]engine.Table, string, error) {
		return dbSession.ListTables(ctx, schemaName, p)
	}, func(table engine.Table, syncedAt time.Time) model.CatalogTable {
		return engineTableToCatalog(instanceID, databaseName, schemaName, table, syncedAt)
	})
	if err != nil {
		return err
	}
	defer spool.remove()

	return c.repo.SyncTablePages(ctx, instanceID, databaseName, schemaName, spool.syncedAt, spool.pages())
}

// syncColumns fetches all columns for a table from the live instance and
// writes them to the catalog via the repository.
func (c *Catalog) syncColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	columns, err := dbSession.ListTableColumns(ctx, schemaName, tableName)
	if err != nil {
		return fmt.Errorf("list columns: %w", err)
	}

	now := time.Now()

	catalogRows := make([]model.CatalogColumn, len(columns))
	for i, col := range columns {
		catalogRows[i] = engineColumnToCatalog(instanceID, databaseName, schemaName, tableName, col, now)
	}

	return c.repo.SyncColumns(ctx, instanceID, databaseName, schemaName, tableName, catalogRows)
}

func (c *Catalog) syncViews(ctx context.Context, instanceID, databaseName, schemaName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	spool, err := spoolCatalogPages(ctx, "list views", func(ctx context.Context, p aip.Params) ([]engine.View, string, error) {
		return dbSession.ListViews(ctx, schemaName, p)
	}, func(view engine.View, syncedAt time.Time) model.CatalogView {
		return engineViewToCatalog(instanceID, databaseName, schemaName, view, syncedAt)
	})
	if err != nil {
		return err
	}
	defer spool.remove()

	return c.repo.SyncViewPages(ctx, instanceID, databaseName, schemaName, spool.pages())
}

func (c *Catalog) syncTableConstraints(ctx context.Context, instanceID, databaseName, schemaName, tableName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	constraints, err := dbSession.ListTableConstraints(ctx, schemaName, tableName)
	if err != nil {
		return fmt.Errorf("list constraints: %w", err)
	}

	now := time.Now()

	catalogRows := make([]model.CatalogTableConstraint, len(constraints))
	for i, constraint := range constraints {
		catalogRows[i] = engineConstraintToCatalog(instanceID, databaseName, schemaName, tableName, constraint, now)
	}

	return c.repo.SyncTableConstraints(ctx, instanceID, databaseName, schemaName, tableName, catalogRows)
}

func (c *Catalog) syncTableIndexes(ctx context.Context, instanceID, databaseName, schemaName, tableName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	indexes, err := dbSession.ListTableIndexes(ctx, schemaName, tableName)
	if err != nil {
		return fmt.Errorf("list indexes: %w", err)
	}

	now := time.Now()

	catalogRows := make([]model.CatalogTableIndex, len(indexes))
	for i, index := range indexes {
		catalogRows[i] = engineIndexToCatalog(instanceID, databaseName, schemaName, tableName, index, now)
	}

	return c.repo.SyncTableIndexes(ctx, instanceID, databaseName, schemaName, tableName, catalogRows)
}

func (c *Catalog) syncTablePolicies(ctx context.Context, instanceID, databaseName, schemaName, tableName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	policies, err := dbSession.ListTablePolicies(ctx, schemaName, tableName)
	if err != nil {
		return fmt.Errorf("list policies: %w", err)
	}

	now := time.Now()

	catalogRows := make([]model.CatalogTablePolicy, len(policies))
	for i, policy := range policies {
		catalogRows[i] = enginePolicyToCatalog(instanceID, databaseName, schemaName, tableName, policy, now)
	}

	return c.repo.SyncTablePolicies(ctx, instanceID, databaseName, schemaName, tableName, catalogRows)
}

func (c *Catalog) syncTableTriggers(ctx context.Context, instanceID, databaseName, schemaName, tableName string, instanceName resource.InstanceName) error {
	dbSession, closeFn, err := c.openDatabaseSession(ctx, instanceName, databaseName)
	if err != nil {
		return err
	}
	defer closeFn()

	triggers, err := dbSession.ListTableTriggers(ctx, schemaName, tableName)
	if err != nil {
		return fmt.Errorf("list triggers: %w", err)
	}

	now := time.Now()

	catalogRows := make([]model.CatalogTableTrigger, len(triggers))
	for i, trigger := range triggers {
		catalogRows[i] = engineTriggerToCatalog(instanceID, databaseName, schemaName, tableName, trigger, now)
	}

	return c.repo.SyncTableTriggers(ctx, instanceID, databaseName, schemaName, tableName, catalogRows)
}

func (c *Catalog) syncServerInfo(ctx context.Context, instanceName resource.InstanceName) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	session, err := c.engine.OpenInstance(ctx, instanceName)
	if err != nil {
		return fmt.Errorf("open instance: %w", err)
	}
	defer session.Close()

	info, err := session.GetServerInfo(ctx)
	if err != nil {
		return fmt.Errorf("get server info: %w", err)
	}

	row := engineServerInfoToCatalog(instanceName.InstanceID, *info, time.Now())

	return c.repo.SyncServerInfo(ctx, row)
}
