package catalog_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
)

func TestIntegrationCatalogSyncStoreMarkSyncedReturnsNotFoundWhenScopeRowMissing(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	store := catalog.NewSyncStore(testDB.DB(), time.Minute)
	scope := "instances/inst1/databases"

	claimed, err := store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{
		StaleBefore: time.Now().Add(-time.Minute),
	})
	require.NoError(t, err)
	require.True(t, claimed)

	_, err = testDB.DB().ExecContext(ctx, "DELETE FROM catalog_sync_state WHERE scope = $1", scope)
	require.NoError(t, err)

	err = store.MarkSynced(ctx, scope)
	require.ErrorIs(t, err, storage.ErrNotFound)
}

// TestIntegrationCatalogSyncStoreClaimSyncLockLifecycle pins the claim
// semantics around the stale-lock cutoff, which is computed with the database
// clock (now() - syncLockTimeout) so replicas with skewed client clocks agree
// on lock expiry. Single-node tests cannot skew the DB clock, so these cases
// characterize the claim behavior rather than the clock source itself.
func TestIntegrationCatalogSyncStoreClaimSyncLockLifecycle(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	store := catalog.NewSyncStore(testDB.DB(), time.Minute)
	scope := "instances/inst-lock/databases"
	staleBefore := time.Now().Add(-time.Hour)

	claimed, err := store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: staleBefore})
	require.NoError(t, err)
	require.True(t, claimed, "first claim on an unknown scope must win")

	claimed, err = store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: staleBefore})
	require.NoError(t, err)
	assert.False(t, claimed, "a fresh syncing lock must not be stolen")

	// Simulate a crashed lock holder: age the row beyond syncLockTimeout in
	// the database. The update_catalog_sync_state_updated_at trigger forces
	// updated_at to now() on every update, so it must be disabled while
	// backdating.
	backdateSyncStateRow(t, ctx, testDB.DB(), scope, "2 minutes")

	claimed, err = store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: staleBefore})
	require.NoError(t, err)
	assert.True(t, claimed, "a lock older than syncLockTimeout must be reclaimable")
}

// backdateSyncStateRow rewinds updated_at for a scope by the given interval,
// temporarily disabling the updated_at trigger that would otherwise reset it.
// The test database is isolated per test, so toggling the trigger is safe.
func backdateSyncStateRow(t *testing.T, ctx context.Context, db *sql.DB, scope, interval string) { //nolint:revive // ctx after *testing.T for test helpers
	t.Helper()

	_, err := db.ExecContext(ctx, "ALTER TABLE catalog_sync_state DISABLE TRIGGER update_catalog_sync_state_updated_at")
	require.NoError(t, err)

	_, err = db.ExecContext(ctx,
		"UPDATE catalog_sync_state SET updated_at = now() - $1::interval WHERE scope = $2", interval, scope)
	require.NoError(t, err)

	_, err = db.ExecContext(ctx, "ALTER TABLE catalog_sync_state ENABLE TRIGGER update_catalog_sync_state_updated_at")
	require.NoError(t, err)
}

func TestIntegrationCatalogSyncStoreClaimSyncFreshnessGate(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	store := catalog.NewSyncStore(testDB.DB(), time.Minute)
	scope := "instances/inst-fresh/databases"

	claimed, err := store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: time.Now().Add(-time.Hour)})
	require.NoError(t, err)
	require.True(t, claimed)
	require.NoError(t, store.MarkSynced(ctx, scope))

	claimed, err = store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: time.Now().Add(-time.Hour)})
	require.NoError(t, err)
	assert.False(t, claimed, "fresh synced data must not be re-claimed without force")

	claimed, err = store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: time.Now().Add(time.Second)})
	require.NoError(t, err)
	assert.True(t, claimed, "data synced before the staleness cutoff must be re-claimable")
}

func TestIntegrationCatalogSyncStoreMarkSyncedAndMarkSyncError(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	testDB := storage.NewTestDB(t)
	store := catalog.NewSyncStore(testDB.DB(), time.Minute)
	scope := "instances/inst-mark/databases"

	claimed, err := store.ClaimSync(ctx, scope, catalog.SyncClaimOptions{StaleBefore: time.Now().Add(-time.Hour)})
	require.NoError(t, err)
	require.True(t, claimed)

	require.NoError(t, store.MarkSyncError(ctx, scope, errors.New("upstream unreachable")))

	state, err := store.GetSyncState(ctx, scope)
	require.NoError(t, err)
	assert.Equal(t, catalog.SyncStatusError, state.Status)
	require.NotNil(t, state.SyncError)
	assert.Equal(t, "upstream unreachable", *state.SyncError)
	assert.Nil(t, state.LastSyncedAt)

	require.NoError(t, store.MarkSynced(ctx, scope))

	state, err = store.GetSyncState(ctx, scope)
	require.NoError(t, err)
	assert.Equal(t, catalog.SyncStatusSynced, state.Status)
	assert.Nil(t, state.SyncError, "MarkSynced must clear a previous error")
	require.NotNil(t, state.LastSyncedAt)
	assert.WithinDuration(t, time.Now(), *state.LastSyncedAt, 10*time.Second)
	assert.WithinDuration(t, time.Now(), state.UpdatedAt, 10*time.Second)
}
