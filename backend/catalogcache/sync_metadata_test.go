package catalogcache

import (
	"context"
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
)

func TestIntegrationListTablesWithSyncMetadata(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	tests := []struct {
		name string
		run  func(t *testing.T)
	}{
		{
			name: "serves stale cache on refresh error",
			run: func(t *testing.T) {
				t.Helper()

				ctx := context.Background()
				dbSession := &mockDatabaseSession{
					schemas: []engine.Schema{{Name: "public"}},
					tables:  map[string][]engine.Table{"public": {{Name: "users"}}},
				}
				eng := newSyncMetadataMockEngine(dbSession)
				cfg := Config{
					StalenessThreshold: time.Hour,
					SyncTimeout:        30 * time.Second,
					SyncLockTimeout:    time.Minute,
				}
				testDB := storage.NewTestDB(t)
				repo := catalog.New(testDB.DB())
				syncStore := catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout)
				cat := New(cfg, repo, syncStore, eng)
				schema := resource.NewSchemaName("inst1", "mydb", "public")
				scope := schema.String() + "/tables"

				tables, _, metadata, err := cat.ListTablesWithSyncMetadata(ctx, schema, aip.Params{PageSize: 10})
				require.NoError(t, err)
				require.Len(t, tables, 1)
				require.NotNil(t, metadata.LastSyncedAt)
				assert.Equal(t, CatalogSyncStatusSynced, metadata.Status)
				assert.False(t, metadata.IsStale)

				_, err = testDB.DB().ExecContext(ctx, "UPDATE catalog_sync_state SET last_synced_at = now() - interval '2 hours' WHERE scope = $1", scope)
				require.NoError(t, err)

				dbSession.listTablesErr = errors.New("upstream unavailable")

				tables, _, metadata, err = cat.ListTablesWithSyncMetadata(ctx, schema, aip.Params{PageSize: 10})
				require.NoError(t, err)
				require.Len(t, tables, 1, "stale cached rows should remain visible")
				assert.Equal(t, "users", tables[0].Name)
				assert.Equal(t, CatalogSyncStatusError, metadata.Status)
				assert.True(t, metadata.IsStale)
				require.NotNil(t, metadata.SyncError)
				assert.Contains(t, *metadata.SyncError, "upstream unavailable")
			},
		},
		{
			name: "distinguishes fresh empty from cold syncing",
			run: func(t *testing.T) {
				t.Helper()

				ctx := context.Background()
				dbSession := &mockDatabaseSession{
					schemas: []engine.Schema{{Name: "public"}},
					tables:  map[string][]engine.Table{"public": {}},
				}
				cat := newTestCatalog(t, newSyncMetadataMockEngine(dbSession), DefaultConfig())
				schema := resource.NewSchemaName("inst1", "mydb", "public")

				tables, _, metadata, err := cat.ListTablesWithSyncMetadata(ctx, schema, aip.Params{PageSize: 10})
				require.NoError(t, err)
				assert.Empty(t, tables)
				assert.Equal(t, CatalogSyncStatusSynced, metadata.Status)
				assert.False(t, metadata.IsStale, "fresh empty table list is an actual empty schema")
				assert.Nil(t, metadata.SyncError)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			tt.run(t)
		})
	}
}

func TestIntegrationListTablesWithSyncMetadataFallsBackWhenMetadataLookupFails(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	tests := []struct {
		name string
	}{
		{name: "falls back when metadata lookup fails"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ctx := context.Background()
			dbSession := &mockDatabaseSession{
				schemas: []engine.Schema{{Name: "public"}},
				tables:  map[string][]engine.Table{"public": {{Name: "users"}}},
			}
			cfg := DefaultConfig()
			testDB := storage.NewTestDB(t)
			repo := catalog.New(testDB.DB())
			syncStore := &syncStoreFailSecondGetSyncState{
				inner: catalog.NewSyncStore(testDB.DB(), cfg.SyncLockTimeout),
			}
			cat := New(cfg, repo, syncStore, newSyncMetadataMockEngine(dbSession))
			schema := resource.NewSchemaName("inst1", "mydb", "public")

			tables, _, metadata, err := cat.ListTablesWithSyncMetadata(ctx, schema, aip.Params{PageSize: 10})
			require.NoError(t, err)
			require.Len(t, tables, 1)
			assert.Equal(t, CatalogSyncStatusNeverSynced, metadata.Status)
			assert.True(t, metadata.IsStale)
		})
	}
}

func TestSyncMetadataFromState(t *testing.T) {
	t.Parallel()

	lastSynced := time.Now().Add(-2 * time.Minute)
	tests := []struct {
		name       string
		state      *catalog.SyncState
		err        error
		wantStatus CatalogSyncStatus
		wantStale  bool
		wantTime   *time.Time
	}{
		{
			name:       "missing row maps to never synced",
			err:        storage.ErrNotFound,
			wantStatus: CatalogSyncStatusNeverSynced,
			wantStale:  true,
		},
		{
			name: "in-flight stale cache maps to syncing stale",
			state: &catalog.SyncState{
				Status:       catalog.SyncStatusSyncing,
				LastSyncedAt: &lastSynced,
				UpdatedAt:    time.Now(),
			},
			wantStatus: CatalogSyncStatusSyncing,
			wantStale:  true,
			wantTime:   &lastSynced,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			metadata := syncMetadataFromState(tt.state, tt.err, time.Minute)

			assert.Equal(t, tt.wantStatus, metadata.Status)
			assert.Equal(t, tt.wantStale, metadata.IsStale)
			assert.Equal(t, tt.wantTime, metadata.LastSyncedAt)
			assert.Nil(t, metadata.SyncError)
		})
	}
}

func newSyncMetadataMockEngine(dbSession *mockDatabaseSession) *mockEngine {
	return &mockEngine{
		sessions: map[string]*mockInstanceSession{
			"inst1": {
				databases:  []engine.Database{{Name: "mydb"}},
				dbSessions: map[string]*mockDatabaseSession{"mydb": dbSession},
			},
		},
	}
}

type syncStoreFailSecondGetSyncState struct {
	inner    *catalog.PGSyncStore
	getCount int
}

func (s *syncStoreFailSecondGetSyncState) GetSyncState(ctx context.Context, scope string) (*catalog.SyncState, error) {
	s.getCount++
	if s.getCount == 2 {
		return nil, errors.New("metadata store unavailable")
	}

	return s.inner.GetSyncState(ctx, scope)
}

func (s *syncStoreFailSecondGetSyncState) ClaimSync(ctx context.Context, scope string, opts catalog.SyncClaimOptions) (bool, error) {
	return s.inner.ClaimSync(ctx, scope, opts)
}

func (s *syncStoreFailSecondGetSyncState) MarkSynced(ctx context.Context, scope string) error {
	return s.inner.MarkSynced(ctx, scope)
}

func (s *syncStoreFailSecondGetSyncState) MarkSyncError(ctx context.Context, scope string, syncErr error) error {
	return s.inner.MarkSyncError(ctx, scope, syncErr)
}
