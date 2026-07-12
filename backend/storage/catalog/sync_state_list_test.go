package catalog

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/storage"
)

func TestIntegrationSyncStore_ListSyncStates(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := storage.NewTestDB(t)
	ctx := t.Context()
	store := NewSyncStore(testDB.DB(), time.Minute)

	seedScope := func(scope string) {
		claimed, err := store.ClaimSync(ctx, scope, SyncClaimOptions{Force: true})
		require.NoError(t, err)
		require.True(t, claimed)
	}

	seedScope("instances/a/databases")
	require.NoError(t, store.MarkSynced(ctx, "instances/a/databases"))

	seedScope("instances/b/databases")
	require.NoError(t, store.MarkSyncError(ctx, "instances/b/databases",
		errors.New(`connect: password authentication failed for user "app"`)))

	seedScope("instances/c/databases")

	// Default order is scope; keyset pagination walks it.
	firstPage, nextPageToken, err := store.ListSyncStates(ctx, aip.Params{PageSize: 2})
	require.NoError(t, err)
	require.Len(t, firstPage, 2)
	require.NotEmpty(t, nextPageToken)
	assert.Equal(t, "instances/a/databases", firstPage[0].Scope)
	assert.Equal(t, "instances/b/databases", firstPage[1].Scope)

	secondPage, lastPageToken, err := store.ListSyncStates(ctx, aip.Params{PageSize: 2, PageToken: nextPageToken})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, lastPageToken)
	assert.Equal(t, "instances/c/databases", secondPage[0].Scope)

	// The raw error is surfaced verbatim — this list feeds the admin
	// surface, unlike the sanitized user-facing sync metadata.
	failed := firstPage[1]
	assert.Equal(t, SyncStatusError, failed.Status)
	require.NotNil(t, failed.Error)
	assert.Contains(t, *failed.Error, "password authentication failed")

	filtered, _, err := store.ListSyncStates(ctx, aip.Params{Filter: `status = "error"`})
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	assert.Equal(t, "instances/b/databases", filtered[0].Scope)

	_, _, err = store.ListSyncStates(ctx, aip.Params{Filter: `nonsense = "x"`})
	require.ErrorIs(t, err, storage.ErrInvalidFilter)
}
