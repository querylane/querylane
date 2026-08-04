package catalogcache

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

func TestIntegrationStaleListDatabasesReturnsWhileRefreshRuns(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	config := DefaultConfig()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	syncStore := catalog.NewSyncStore(testDB.DB(), config.SyncLockTimeout)
	instanceSession := &mockInstanceSession{databases: []engine.Database{{Name: "cached"}}}
	cat := New(config, repo, syncStore, &mockEngine{sessions: map[string]*mockInstanceSession{"inst1": instanceSession}})
	instance := resource.NewInstanceName("inst1")

	initial, _, err := cat.ListDatabases(ctx, instance, aip.Params{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, initial, 1)
	require.Equal(t, "cached", initial[0].Name)

	_, err = testDB.DB().ExecContext(ctx, `
		UPDATE catalog_sync_state
		SET last_synced_at = NOW() - INTERVAL '2 hours'
		WHERE scope = $1
	`, instance.String()+"/databases")
	require.NoError(t, err)

	refreshStarted := make(chan struct{})
	releaseRefresh := make(chan struct{})
	instanceSession.databases = []engine.Database{{Name: "refreshed"}}
	instanceSession.startedCh = refreshStarted
	instanceSession.syncCh = releaseRefresh

	type listResult struct {
		databases []engine.Database
		err       error
	}

	resultCh := make(chan listResult, 1)

	go func() {
		databases, _, listErr := cat.ListDatabases(ctx, instance, aip.Params{PageSize: 10})
		resultCh <- listResult{databases: databases, err: listErr}
	}()

	select {
	case <-refreshStarted:
	case <-time.After(2 * time.Second):
		close(releaseRefresh)
		t.Fatal("stale refresh did not start")
	}

	select {
	case result := <-resultCh:
		require.NoError(t, result.err)
		require.Len(t, result.databases, 1)
		assert.Equal(t, "cached", result.databases[0].Name)
	case <-time.After(2 * time.Second):
		close(releaseRefresh)
		<-resultCh
		t.Fatal("stale read waited for the background refresh")
	}

	close(releaseRefresh)
	require.Eventually(t, func() bool {
		databases, _, listErr := repo.ListDatabases(ctx, "inst1", aip.Params{PageSize: 10})

		return listErr == nil && len(databases) == 1 && databases[0].Name == "refreshed"
	}, 5*time.Second, 10*time.Millisecond)
}

// TestIntegrationParentSyncPreservesChildrenForStillExistingTables exercises
// Fix A: a force-refresh of the parent {schema}/tables scope must not nuke
// child catalog_column data or child catalog_sync_state for tables that still
// exist in the upstream snapshot.
func TestIntegrationParentSyncPreservesChildrenForStillExistingTables(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{"public": {{Name: "users"}}},
		columns: map[string][]engine.Column{
			"public/users": {{Name: "id", OrdinalPosition: 1, RawType: "integer", IsPrimaryKey: true}},
		},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases:  []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{"mydb": dbSession},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	tbl := resource.NewTableName("inst1", "mydb", "public", "users")

	// Populate columns and verify the engine ran once.
	cols, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	require.Len(t, cols, 1)
	require.Equal(t, 1, dbSession.listTableColumnsCalls)

	// Force-refresh the parent {schema}/tables scope. `users` still exists in
	// the upstream snapshot, so its children must survive.
	_, _, err = cat.ListTables(WithForceRefresh(ctx), tbl.Parent(), aip.Params{PageSize: 10})
	require.NoError(t, err)
	require.GreaterOrEqual(t, dbSession.listTablesCalls, 1)

	// Re-read columns (no force). The catalog must serve the previously-cached
	// rows without re-invoking the engine for columns.
	cols2, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	assert.Len(t, cols2, 1)
	assert.Equal(t, 1, dbSession.listTableColumnsCalls,
		"surviving table's children must be preserved across parent {schema}/tables refresh")
}

// TestIntegrationParentSyncDropsChildrenForVanishedTables exercises Fix A's
// other side: a parent sync that omits a previously-known table must clean up
// that table's descendant rows and the table itself.
func TestIntegrationParentSyncDropsChildrenForVanishedTables(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{"public": {{Name: "users"}}},
		columns: map[string][]engine.Column{
			"public/users": {{Name: "id", OrdinalPosition: 1, RawType: "integer", IsPrimaryKey: true}},
		},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases:  []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{"mydb": dbSession},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	users := resource.NewTableName("inst1", "mydb", "public", "users")

	cols, err := cat.ListTableColumns(ctx, users)
	require.NoError(t, err)
	require.Len(t, cols, 1)

	// Upstream drops `users` and creates `customers`.
	dbSession.tables = map[string][]engine.Table{"public": {{Name: "customers"}}}

	_, _, err = cat.ListTables(WithForceRefresh(ctx), users.Parent(), aip.Params{PageSize: 10})
	require.NoError(t, err)

	// `users` is gone — the catalog must surface NotFound, not an empty row.
	_, err = cat.GetTable(ctx, users)
	require.ErrorIs(t, err, engine.ErrTableNotFound)
}

// TestIntegrationListTableColumnsRetriesEmptyFromCatalog exercises Fix C: if
// the catalog repo returns empty for a still-existing table AND the scope's
// sync_state has been cleared (simulating a parent nuke landing between
// ensureFresh and the repo read), the read path must resync once and retry
// instead of returning [].
//
// The fake repo simulates the race by clearing sync_state at the same moment
// it returns an empty result — i.e. by the time the read-side guard checks
// freshness, the scope is stale and the retry must fire.
func TestIntegrationListTableColumnsRetriesEmptyFromCatalog(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{"public": {{Name: "users"}}},
		columns: map[string][]engine.Column{
			"public/users": {{Name: "id", OrdinalPosition: 1, RawType: "integer", IsPrimaryKey: true}},
		},
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases:  []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{"mydb": dbSession},
			},
		},
	}

	cfg := DefaultConfig()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	tbl := resource.NewTableName("inst1", "mydb", "public", "users")
	scope := tbl.String() + "/columns"

	wrappedRepo := &repoFakingEmptyOnce{
		catalogRepository: repo,
		onFakeEmpty: func() {
			clearSyncStateRow(t, ctx, testDB.DB(), scope)
		},
	}
	syncStore := catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout)
	cat := New(cfg, wrappedRepo, syncStore, eng)

	// Prime the catalog so it has fresh data + sync_state.
	cols, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	require.Len(t, cols, 1)
	require.Equal(t, 1, dbSession.listTableColumnsCalls)

	// Arm the fake: next ListTableColumns call returns empty AND clears
	// sync_state at the same moment. The Fix C path must observe the stale
	// scope, resync, and return the real rows from the retry.
	wrappedRepo.fakeEmptyOnce()

	cols2, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	assert.Len(t, cols2, 1, "empty + stale scope must trigger resync and retry")
	assert.Equal(t, 2, dbSession.listTableColumnsCalls,
		"engine must be re-queried exactly once on retry")
}

// TestIntegrationListTableColumnsLegitimateEmptyDoesNotResync exercises the
// negative path of Fix C: an empty result on a fresh scope is a legitimate
// "no columns" answer and must not trigger a redundant resync.
func TestIntegrationListTableColumnsLegitimateEmptyDoesNotResync(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	dbSession := &mockDatabaseSession{
		schemas: []engine.Schema{{Name: "public"}},
		tables:  map[string][]engine.Table{"public": {{Name: "empty_table"}}},
		// no columns mapped for public/empty_table — engine returns empty
	}
	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases:  []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{"mydb": dbSession},
			},
		},
	}

	cat := newTestCatalog(t, eng, DefaultConfig())

	tbl := resource.NewTableName("inst1", "mydb", "public", "empty_table")

	cols, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	require.Empty(t, cols)

	firstCalls := dbSession.listTableColumnsCalls

	// Same fresh scope. Must NOT trigger an extra resync.
	cols2, err := cat.ListTableColumns(ctx, tbl)
	require.NoError(t, err)
	require.Empty(t, cols2)
	assert.Equal(t, firstCalls, dbSession.listTableColumnsCalls,
		"fresh empty result must be served from catalog without an extra engine call")
}

// TestIntegrationMarkSyncedFailureSurfacesError exercises Fix B: if the
// catalog rows are committed but MarkSynced fails, ensureFresh must surface
// the error rather than returning nil with no durable sync state.
func TestIntegrationMarkSyncedFailureSurfacesError(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
			},
		},
	}

	cfg := DefaultConfig()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	wrappedStore := &syncStoreFailMarkSynced{
		inner: catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout),
	}
	cat := New(cfg, repo, wrappedStore, eng)

	_, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.Error(t, err, "MarkSynced failure must propagate")
	assert.Contains(t, err.Error(), "mark sync as synced")
}

// --- Test helpers ---

// repoFakingEmptyOnce wraps a real CatalogRepository and, when armed, returns
// an empty column slice from the next ListTableColumns call exactly once.
// The optional onFakeEmpty hook runs after the fake-empty is observed so the
// caller can simulate side effects (e.g. clearing sync_state to mimic a
// concurrent parent-nuke).
type repoFakingEmptyOnce struct {
	catalogRepository

	emptyOnceArmed bool
	onFakeEmpty    func()
}

func (r *repoFakingEmptyOnce) ListTableColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogColumn, error) {
	if r.emptyOnceArmed {
		r.emptyOnceArmed = false

		if r.onFakeEmpty != nil {
			r.onFakeEmpty()
		}

		return nil, nil
	}

	return r.catalogRepository.ListTableColumns(ctx, instanceID, databaseName, schemaName, tableName)
}

func (r *repoFakingEmptyOnce) fakeEmptyOnce() {
	r.emptyOnceArmed = true
}

// TestIntegrationWaitIfColdMissRecoversWhenRowDeleted exercises the
// defense-in-depth path in waitIfColdMiss: the caller lost ClaimSync, but by
// the time GetSyncState runs the row has been deleted (e.g. a concurrent
// InvalidateInstance landed). The catalog must re-attempt the claim rather
// than returning a wrapped ErrNotFound.
func TestIntegrationWaitIfColdMissRecoversWhenRowDeleted(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
			},
		},
	}

	cfg := DefaultConfig()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	inner := catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout)
	wrapped := &syncStoreLoseClaimOnce{inner: inner, db: testDB.DB()}
	cat := New(cfg, repo, wrapped, eng)

	// Trigger ListDatabases. The wrapped sync store forces ClaimSync to lose
	// once and deletes the state row before GetSyncState reads it, so
	// waitIfColdMiss must observe state==nil and re-claim.
	dbs, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, dbs, 1)
	require.Equal(t, "mydb", dbs[0].Name)
	require.Equal(t, 1, wrapped.loseClaimCount, "wrapper must have forced one ClaimSync loss")
}

// syncStoreLoseClaimOnce wraps a real catalog sync store. The first ClaimSync
// call (across all scopes) is forced to return claimed=false and the
// corresponding state row is deleted, simulating a concurrent invalidate
// landing between ClaimSync and waitIfColdMiss's GetSyncState. Subsequent
// calls pass through.
type syncStoreLoseClaimOnce struct {
	inner          *catalog.PGSyncStore
	db             *sql.DB
	loseClaimCount int
}

func (s *syncStoreLoseClaimOnce) GetSyncState(ctx context.Context, scope string) (*catalog.SyncState, error) {
	return s.inner.GetSyncState(ctx, scope)
}

func (s *syncStoreLoseClaimOnce) ClaimSync(ctx context.Context, scope string, opts catalog.SyncClaimOptions) (bool, error) {
	if s.loseClaimCount == 0 {
		s.loseClaimCount++

		if _, err := s.inner.ClaimSync(ctx, scope, opts); err != nil {
			return false, err
		}

		if _, err := s.db.ExecContext(ctx, "DELETE FROM catalog_sync_state WHERE scope = $1", scope); err != nil {
			return false, err
		}

		return false, nil
	}

	return s.inner.ClaimSync(ctx, scope, opts)
}

func (s *syncStoreLoseClaimOnce) MarkSynced(ctx context.Context, scope string) error {
	return s.inner.MarkSynced(ctx, scope)
}

func (s *syncStoreLoseClaimOnce) MarkSyncError(ctx context.Context, scope string, syncErr error) error {
	return s.inner.MarkSyncError(ctx, scope, syncErr)
}

// TestIntegrationPollForSyncCompletionRecoversWhenRowDeleted exercises the
// poll loop in pollForSyncCompletion: the caller lost ClaimSync on a cold
// miss and is polling for the winner, but the sync-state row is deleted
// mid-poll (e.g. a concurrent InvalidateInstance landed). Like the pre-poll
// guard in waitIfColdMiss, the poll loop must re-attempt the claim instead of
// surfacing a wrapped ErrNotFound.
func TestIntegrationPollForSyncCompletionRecoversWhenRowDeleted(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()

	eng := &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases: []engine.Database{{Name: "mydb"}},
			},
		},
	}

	cfg := DefaultConfig()
	testDB := storage.NewTestDB(t)
	repo := catalog.New(testDB.DB())
	inner := catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout)
	wrapped := &syncStoreDeleteRowMidPoll{inner: inner, db: testDB.DB()}
	cat := New(cfg, repo, wrapped, eng)

	// The wrapped sync store forces the first ClaimSync to lose while leaving
	// a live "syncing" row with no LastSyncedAt, sending the caller into the
	// cold-miss poll loop. The poll's GetSyncState then observes the row was
	// deleted, and must re-claim and run the sync itself.
	dbs, _, err := cat.ListDatabases(ctx, resource.NewInstanceName("inst1"), aip.Params{PageSize: 10})
	require.NoError(t, err)
	require.Len(t, dbs, 1)
	require.Equal(t, "mydb", dbs[0].Name)
	require.Equal(t, 2, wrapped.claimCalls, "claim must be re-attempted after the row vanished mid-poll")
	require.True(t, wrapped.deleted, "wrapper must have deleted the row during polling")
}

// syncStoreDeleteRowMidPoll wraps a real catalog sync store. The first
// ClaimSync claims via the inner store (so a live 'syncing' row exists) but
// reports claimed=false, pushing the caller into waitIfColdMiss. The first
// GetSyncState after the forced loss returns that row (cold miss — enter the
// poll loop); before the second one the row is deleted, simulating a
// concurrent invalidate landing mid-poll. Subsequent calls pass through.
type syncStoreDeleteRowMidPoll struct {
	inner         *catalog.PGSyncStore
	db            *sql.DB
	claimCalls    int
	getsAfterLoss int
	deleted       bool
}

func (s *syncStoreDeleteRowMidPoll) GetSyncState(ctx context.Context, scope string) (*catalog.SyncState, error) {
	if s.claimCalls == 1 && !s.deleted {
		s.getsAfterLoss++

		if s.getsAfterLoss == 2 {
			if _, err := s.db.ExecContext(ctx, "DELETE FROM catalog_sync_state WHERE scope = $1", scope); err != nil {
				return nil, err
			}

			s.deleted = true
		}
	}

	return s.inner.GetSyncState(ctx, scope)
}

func (s *syncStoreDeleteRowMidPoll) ClaimSync(ctx context.Context, scope string, opts catalog.SyncClaimOptions) (bool, error) {
	s.claimCalls++

	if s.claimCalls == 1 {
		if _, err := s.inner.ClaimSync(ctx, scope, opts); err != nil {
			return false, err
		}

		return false, nil
	}

	return s.inner.ClaimSync(ctx, scope, opts)
}

func (s *syncStoreDeleteRowMidPoll) MarkSynced(ctx context.Context, scope string) error {
	return s.inner.MarkSynced(ctx, scope)
}

func (s *syncStoreDeleteRowMidPoll) MarkSyncError(ctx context.Context, scope string, syncErr error) error {
	return s.inner.MarkSyncError(ctx, scope, syncErr)
}

// syncStoreFailMarkSynced wraps a real catalog sync store and fails every
// MarkSynced call so we can assert ensureFresh refuses to return success.
type syncStoreFailMarkSynced struct {
	inner *catalog.PGSyncStore
}

func (s *syncStoreFailMarkSynced) GetSyncState(ctx context.Context, scope string) (*catalog.SyncState, error) {
	return s.inner.GetSyncState(ctx, scope)
}

func (s *syncStoreFailMarkSynced) ClaimSync(ctx context.Context, scope string, opts catalog.SyncClaimOptions) (bool, error) {
	return s.inner.ClaimSync(ctx, scope, opts)
}

func (s *syncStoreFailMarkSynced) MarkSynced(_ context.Context, _ string) error {
	return errors.New("simulated meta-DB failure")
}

func (s *syncStoreFailMarkSynced) MarkSyncError(ctx context.Context, scope string, syncErr error) error {
	return s.inner.MarkSyncError(ctx, scope, syncErr)
}

// clearSyncStateRow removes the catalog_sync_state row for scope. Used to
// simulate parent-sync nuke landing between ensureFresh and the repo read.
func clearSyncStateRow(t *testing.T, ctx context.Context, db *sql.DB, scope string) { //nolint:revive // ctx after *testing.T for test helpers
	t.Helper()

	_, err := db.ExecContext(ctx, "DELETE FROM catalog_sync_state WHERE scope = $1", scope)
	require.NoError(t, err)
}
