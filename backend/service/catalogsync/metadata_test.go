package catalogsync

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/catalogcache"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestToProtoSanitizesSyncErrors(t *testing.T) {
	t.Parallel()

	internalError := "dial tcp 10.0.0.5:5432: password leaked"

	tests := []struct {
		name      string
		syncError *string
		wantError string
	}{
		{
			name:      "omits nil sync error",
			syncError: nil,
			wantError: "",
		},
		{
			name:      "replaces internal sync error",
			syncError: &internalError,
			wantError: "Showing cached catalog. Refresh failed.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			pb := ToProto(catalogcache.CatalogSyncMetadata{
				Status:    catalogcache.CatalogSyncStatusError,
				IsStale:   true,
				SyncError: tt.syncError,
			})

			assert.Equal(t, tt.wantError, pb.GetSyncError())
		})
	}
}

func TestToProtoMapsStatusStalenessAndLastSyncedAt(t *testing.T) {
	t.Parallel()

	lastSyncedAt := time.Date(2026, time.May, 21, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name             string
		metadata         catalogcache.CatalogSyncMetadata
		wantStatus       v1alpha1.CatalogSyncStatus
		wantStale        bool
		wantLastSyncedAt bool
	}{
		{
			name: "never synced stale cache",
			metadata: catalogcache.CatalogSyncMetadata{
				Status:  catalogcache.CatalogSyncStatusNeverSynced,
				IsStale: true,
			},
			wantStatus: v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_NEVER_SYNCED,
			wantStale:  true,
		},
		{
			name: "syncing stale cache with prior sync",
			metadata: catalogcache.CatalogSyncMetadata{
				Status:       catalogcache.CatalogSyncStatusSyncing,
				IsStale:      true,
				LastSyncedAt: &lastSyncedAt,
			},
			wantStatus:       v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCING,
			wantStale:        true,
			wantLastSyncedAt: true,
		},
		{
			name: "synced fresh cache",
			metadata: catalogcache.CatalogSyncMetadata{
				Status:       catalogcache.CatalogSyncStatusSynced,
				IsStale:      false,
				LastSyncedAt: &lastSyncedAt,
			},
			wantStatus:       v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCED,
			wantStale:        false,
			wantLastSyncedAt: true,
		},
		{
			name: "unknown status falls back to unspecified",
			metadata: catalogcache.CatalogSyncMetadata{
				Status: catalogcache.CatalogSyncStatus("unexpected"),
			},
			wantStatus: v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_UNSPECIFIED,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			pb := ToProto(tt.metadata)

			assert.Equal(t, tt.wantStatus, pb.GetSyncStatus())
			assert.Equal(t, tt.wantStale, pb.GetIsStale())

			if tt.wantLastSyncedAt {
				assert.NotNil(t, pb.GetLastSyncedAt())
				assert.Equal(t, lastSyncedAt, pb.GetLastSyncedAt().AsTime())
			} else {
				assert.Nil(t, pb.GetLastSyncedAt())
			}
		})
	}
}
