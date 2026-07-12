package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
)

func TestIntegrationReplicaStore_UpsertHeartbeat(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()
	store := NewReplicaStore(testDB.DB())

	hb := ReplicaHeartbeat{ID: "replica-a", Hostname: "host-1", PID: 1234}
	require.NoError(t, store.UpsertHeartbeat(ctx, hb))

	first, err := store.GetReplicasByIDs(ctx, []string{"replica-a"})
	require.NoError(t, err)
	require.Len(t, first, 1)
	assert.Equal(t, "host-1", first[0].Hostname)
	assert.Equal(t, int64(1234), first[0].Pid)

	// Ensure the second beat lands on a later DB timestamp.
	_, err = testDB.DB().ExecContext(ctx,
		`UPDATE replica SET last_seen_at = last_seen_at - interval '1 minute',
		                    started_at   = started_at   - interval '1 minute'
		 WHERE id = $1`, "replica-a")
	require.NoError(t, err)

	aged, err := store.GetReplicasByIDs(ctx, []string{"replica-a"})
	require.NoError(t, err)
	require.Len(t, aged, 1)

	require.NoError(t, store.UpsertHeartbeat(ctx, hb))

	refreshed, err := store.GetReplicasByIDs(ctx, []string{"replica-a"})
	require.NoError(t, err)
	require.Len(t, refreshed, 1)

	// A repeat beat advances last_seen_at but preserves started_at.
	assert.True(t, refreshed[0].LastSeenAt.After(aged[0].LastSeenAt))
	assert.True(t, refreshed[0].StartedAt.Equal(aged[0].StartedAt))
}

func TestIntegrationReplicaStore_ListReplicas(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()
	store := NewReplicaStore(testDB.DB())

	for _, hb := range []ReplicaHeartbeat{
		{ID: "replica-a", Hostname: "host-1", PID: 1},
		{ID: "replica-b", Hostname: "host-2", PID: 2},
		{ID: "replica-c", Hostname: "host-1", PID: 3},
	} {
		require.NoError(t, store.UpsertHeartbeat(ctx, hb))
	}

	// Default order is replica_id; keyset pagination walks it.
	firstPage, nextPageToken, err := store.ListReplicas(ctx, aip.Params{PageSize: 2})
	require.NoError(t, err)
	require.Len(t, firstPage, 2)
	require.NotEmpty(t, nextPageToken)
	assert.Equal(t, "replica-a", firstPage[0].ID)
	assert.Equal(t, "replica-b", firstPage[1].ID)

	secondPage, lastPageToken, err := store.ListReplicas(ctx, aip.Params{PageSize: 2, PageToken: nextPageToken})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, lastPageToken)
	assert.Equal(t, "replica-c", secondPage[0].ID)

	filtered, _, err := store.ListReplicas(ctx, aip.Params{Filter: `hostname = "host-1"`})
	require.NoError(t, err)
	require.Len(t, filtered, 2)

	_, _, err = store.ListReplicas(ctx, aip.Params{Filter: `nonsense = "x"`})
	require.ErrorIs(t, err, ErrInvalidFilter)
}

func TestIntegrationReplicaStore_GetReplicasByIDs(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()
	store := NewReplicaStore(testDB.DB())

	require.NoError(t, store.UpsertHeartbeat(ctx, ReplicaHeartbeat{ID: "replica-a", Hostname: "host-1", PID: 1}))

	empty, err := store.GetReplicasByIDs(ctx, nil)
	require.NoError(t, err)
	assert.Empty(t, empty)

	// Unknown ids are absent, not an error.
	rows, err := store.GetReplicasByIDs(ctx, []string{"replica-a", "replica-gone"})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "replica-a", rows[0].ID)
}

func TestIntegrationReplicaStore_PruneStaleReplicas(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()
	store := NewReplicaStore(testDB.DB())

	require.NoError(t, store.UpsertHeartbeat(ctx, ReplicaHeartbeat{ID: "replica-live", Hostname: "host-1", PID: 1}))
	require.NoError(t, store.UpsertHeartbeat(ctx, ReplicaHeartbeat{ID: "replica-dead", Hostname: "host-2", PID: 2}))

	_, err := testDB.DB().ExecContext(ctx,
		`UPDATE replica SET last_seen_at = now() - interval '25 hours' WHERE id = $1`, "replica-dead")
	require.NoError(t, err)

	pruned, err := store.PruneStaleReplicas(ctx, ReplicaPruneAge)
	require.NoError(t, err)
	assert.Equal(t, int64(1), pruned)

	remaining, _, err := store.ListReplicas(ctx, aip.Params{})
	require.NoError(t, err)
	require.Len(t, remaining, 1)
	assert.Equal(t, "replica-live", remaining[0].ID)
}

func TestIntegrationReplicaStore_DatabaseNow(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewReplicaStore(testDB.DB())

	now, err := store.DatabaseNow(t.Context())
	require.NoError(t, err)
	// Loose sanity bound: the test DB clock and the host clock are the same
	// machine here, so a wide window guards against flakes, not skew.
	assert.WithinDuration(t, time.Now(), now, time.Minute)
}
