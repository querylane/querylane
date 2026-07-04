package catalogcache

import (
	"errors"
	"time"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
)

type CatalogSyncStatus string

const (
	CatalogSyncStatusNeverSynced CatalogSyncStatus = "never_synced"
	CatalogSyncStatusSyncing     CatalogSyncStatus = "syncing"
	CatalogSyncStatusSynced      CatalogSyncStatus = "synced"
	CatalogSyncStatusError       CatalogSyncStatus = "error"
)

type CatalogSyncMetadata struct {
	Status       CatalogSyncStatus
	LastSyncedAt *time.Time
	IsStale      bool
	SyncError    *string
}

func syncMetadataFromState(state *catalog.SyncState, err error, stalenessThreshold time.Duration) CatalogSyncMetadata {
	if state == nil || errors.Is(err, storage.ErrNotFound) {
		return CatalogSyncMetadata{
			Status:  CatalogSyncStatusNeverSynced,
			IsStale: true,
		}
	}

	status := CatalogSyncStatusNeverSynced

	switch state.Status {
	case catalog.SyncStatusSynced:
		status = CatalogSyncStatusSynced
	case catalog.SyncStatusSyncing:
		status = CatalogSyncStatusSyncing
	case catalog.SyncStatusError:
		status = CatalogSyncStatusError
	}

	isStale := status != CatalogSyncStatusSynced || state.LastSyncedAt == nil
	if state.LastSyncedAt != nil && time.Since(*state.LastSyncedAt) >= stalenessThreshold {
		isStale = true
	}

	return CatalogSyncMetadata{
		Status:       status,
		LastSyncedAt: state.LastSyncedAt,
		IsStale:      isStale,
		SyncError:    state.SyncError,
	}
}

func (c *Catalog) syncMetadata(ctxScope syncStateResult) (CatalogSyncMetadata, error) {
	if ctxScope.err != nil && !errors.Is(ctxScope.err, storage.ErrNotFound) {
		return CatalogSyncMetadata{}, ctxScope.err
	}

	return syncMetadataFromState(ctxScope.state, ctxScope.err, c.config.StalenessThreshold), nil
}

type syncStateResult struct {
	state *catalog.SyncState
	err   error
}
