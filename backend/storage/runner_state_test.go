package storage

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
)

func TestCadenceGate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		runInterval time.Duration
		want        time.Duration
	}{
		{name: "zero interval clamps to zero", runInterval: 0, want: 0},
		{name: "sub-slop interval clamps to zero instead of going negative", runInterval: 100 * time.Millisecond, want: 0},
		{name: "interval equal to slop clamps to zero", runInterval: claimSlop, want: 0},
		{name: "just above slop keeps remainder", runInterval: claimSlop + time.Millisecond, want: time.Millisecond},
		{name: "one second", runInterval: time.Second, want: time.Second - claimSlop},
		{name: "one minute", runInterval: time.Minute, want: time.Minute - claimSlop},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, cadenceGate(tt.runInterval))
		})
	}
}

func TestIntegrationRunnerExecutionStore_ListRunnerExecutions(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()

	_, err := testDB.DB().ExecContext(ctx,
		`INSERT INTO runner_execution_state (runner_name, target_name, last_started_at)
		 VALUES
		   ('probe_cache', 'instances/a', now() - interval '1 minute'),
		   ('probe_cache', 'instances/b', now() - interval '2 minutes'),
		   ('probe_vacuum', 'instances/a/databases/appdb', now() - interval '3 minutes')`)
	require.NoError(t, err)

	store := NewRunnerExecutionStore(testDB.DB())

	// Default order is (runner_name, target); keyset pagination walks it.
	firstPage, nextPageToken, err := store.ListRunnerExecutions(ctx, aip.Params{PageSize: 2})
	require.NoError(t, err)
	require.Len(t, firstPage, 2)
	require.NotEmpty(t, nextPageToken)
	assert.Equal(t, "instances/a", firstPage[0].TargetName)
	assert.Equal(t, "instances/b", firstPage[1].TargetName)

	secondPage, lastPageToken, err := store.ListRunnerExecutions(ctx, aip.Params{PageSize: 2, PageToken: nextPageToken})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, lastPageToken)
	assert.Equal(t, "probe_vacuum", secondPage[0].RunnerName)

	filtered, _, err := store.ListRunnerExecutions(ctx, aip.Params{Filter: `target = "instances/b"`})
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	assert.Equal(t, "instances/b", filtered[0].TargetName)

	_, _, err = store.ListRunnerExecutions(ctx, aip.Params{Filter: `nonsense = "x"`})
	require.ErrorIs(t, err, ErrInvalidFilter)
}

func TestIntegrationRunnerExecutionStore_MarkSuccessByNonOwnerReturnsLeaseLost(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewRunnerExecutionStore(testDB.DB())
	key := RunnerExecutionKey{
		RunnerName: "instance_connectivity",
		TargetName: "instances/prod",
	}

	claimed, err := store.TryClaimExecution(t.Context(), RunnerExecutionClaim{
		Key:           key,
		LeaseOwner:    "worker-a",
		LeaseDuration: 30 * time.Second,
		RunInterval:   time.Minute,
	})
	require.NoError(t, err)
	require.True(t, claimed)

	// A worker that no longer holds the lease must not record success.
	err = store.MarkExecutionSuccess(t.Context(), testDB.DB(), key, "worker-b")
	require.ErrorIs(t, err, ErrLeaseLost)

	// The actual lease owner still succeeds.
	err = store.MarkExecutionSuccess(t.Context(), testDB.DB(), key, "worker-a")
	require.NoError(t, err)
}

func TestIntegrationRunnerExecutionStore_MarkFailureByNonOwnerReturnsLeaseLost(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	store := NewRunnerExecutionStore(testDB.DB())
	key := RunnerExecutionKey{
		RunnerName: "instance_metrics",
		TargetName: "instances/staging",
	}

	claimed, err := store.TryClaimExecution(t.Context(), RunnerExecutionClaim{
		Key:           key,
		LeaseOwner:    "worker-a",
		LeaseDuration: 30 * time.Second,
		RunInterval:   time.Minute,
	})
	require.NoError(t, err)
	require.True(t, claimed)

	err = store.MarkExecutionFailure(t.Context(), testDB.DB(), key, "worker-b", errors.New("boom"))
	require.ErrorIs(t, err, ErrLeaseLost)

	err = store.MarkExecutionFailure(t.Context(), testDB.DB(), key, "worker-a", errors.New("boom"))
	require.NoError(t, err)
}
