package catalogsync

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/catalogcache"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func ToProto(metadata catalogcache.CatalogSyncMetadata) *v1alpha1.CatalogSyncMetadata {
	pb := &v1alpha1.CatalogSyncMetadata{
		SyncStatus: statusToProto(metadata.Status),
		IsStale:    metadata.IsStale,
	}

	if metadata.LastSyncedAt != nil {
		pb.LastSyncedAt = timestamppb.New(*metadata.LastSyncedAt)
	}

	if metadata.SyncError != nil {
		pb.SyncError = sanitizeSyncErrorForAPI(metadata.SyncError)
	}

	return pb
}

func sanitizeSyncErrorForAPI(syncError *string) string {
	if syncError == nil {
		return ""
	}

	return "Showing cached catalog. Refresh failed."
}

func statusToProto(status catalogcache.CatalogSyncStatus) v1alpha1.CatalogSyncStatus {
	switch status {
	case catalogcache.CatalogSyncStatusNeverSynced:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_NEVER_SYNCED
	case catalogcache.CatalogSyncStatusSyncing:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCING
	case catalogcache.CatalogSyncStatusSynced:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCED
	case catalogcache.CatalogSyncStatusError:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_ERROR
	default:
		return v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_UNSPECIFIED
	}
}
