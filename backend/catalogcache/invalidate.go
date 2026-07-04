package catalogcache

import (
	"context"

	"github.com/querylane/querylane/backend/resource"
)

// InvalidateInstance removes all catalog data and sync state for an instance.
// Called after instance update or delete.
//
// Concurrent in-flight syncs (coalesced via singleflight) will complete and
// hand their result to current waiters; the next caller after that does a
// fresh staleness check, sees the catalog rows are gone, and triggers a
// new sync — so consistency is restored within one cycle.
func (c *Catalog) InvalidateInstance(ctx context.Context, instance resource.InstanceName) error {
	return c.repo.InvalidateInstance(ctx, instance.InstanceID)
}

// InvalidateDatabase removes catalog data for a database and its children.
// Called after database mutations.
func (c *Catalog) InvalidateDatabase(ctx context.Context, db resource.DatabaseName) error {
	return c.repo.InvalidateDatabase(ctx, db.InstanceID, db.DatabaseID)
}
