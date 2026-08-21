package storage

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

func TestIntegrationInstanceRuntimeStateStore_UpdateAndList(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)
	store := NewInstanceRuntimeStateStore(testDB.DB())
	recorder := NewInstanceConnectionRecorder(testDB.DB())
	checkedAt := time.Now().UTC().Truncate(time.Second)

	err := recorder.RecordErrorTx(t.Context(), testDB.DB(), "prod", checkedAt, errors.New("connection refused"))
	require.NoError(t, err)

	err = recorder.RecordActiveTx(t.Context(), testDB.DB(), "staging", checkedAt)
	require.NoError(t, err)

	states, err := store.ListInstanceRuntimeStates(t.Context(), []string{"prod", "staging", "missing"})
	require.NoError(t, err)
	require.Len(t, states, 2)

	assert.Equal(t, model.ConnectionState_ConnectionStateError, states["prod"].ConnectionState)
	require.NotNil(t, states["prod"].ConnectionError)
	assert.Equal(t, "PostgreSQL instance is unreachable", *states["prod"].ConnectionError)
	require.NotNil(t, states["prod"].ConnectionCheckedAt)
	assert.WithinDuration(t, checkedAt, *states["prod"].ConnectionCheckedAt, time.Second)

	assert.Equal(t, model.ConnectionState_ConnectionStateActive, states["staging"].ConnectionState)
	assert.Nil(t, states["staging"].ConnectionError)
}

func TestIntegrationInstanceRuntimeStateStore_RedactsConnectionFailure(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)
	store := NewInstanceRuntimeStateStore(testDB.DB())
	recorder := NewInstanceConnectionRecorder(testDB.DB())
	checkedAt := time.Now().UTC().Truncate(time.Second)
	rawError := fmt.Errorf("connect host=10.0.0.8 user=admin: %w", &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: `password authentication failed for user "admin"`,
	})

	require.NoError(t, recorder.RecordErrorTx(t.Context(), testDB.DB(), "prod", checkedAt, rawError))

	states, err := store.ListInstanceRuntimeStates(t.Context(), []string{"prod"})
	require.NoError(t, err)
	require.NotNil(t, states["prod"].ConnectionError)
	assert.Equal(t, "PostgreSQL authentication failed", *states["prod"].ConnectionError)
	assert.NotContains(t, *states["prod"].ConnectionError, "10.0.0.8")
	assert.NotContains(t, *states["prod"].ConnectionError, "admin")
}

func TestIntegrationInstanceRuntimeStateStore_UpdateOverwritesExisting(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)
	store := NewInstanceRuntimeStateStore(testDB.DB())
	recorder := NewInstanceConnectionRecorder(testDB.DB())
	now := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, recorder.RecordErrorTx(t.Context(), testDB.DB(), "x", now, errors.New("boom")))
	require.NoError(t, recorder.RecordActiveTx(t.Context(), testDB.DB(), "x", now.Add(time.Second)))

	states, err := store.ListInstanceRuntimeStates(t.Context(), []string{"x"})
	require.NoError(t, err)
	require.Len(t, states, 1)
	assert.Equal(t, model.ConnectionState_ConnectionStateActive, states["x"].ConnectionState)
	assert.Nil(t, states["x"].ConnectionError)
}

func TestIntegrationRunnerExecutionStore_ClaimAndLifecycle(t *testing.T) {
	t.Parallel()

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
	assert.True(t, claimed)

	claimed, err = store.TryClaimExecution(t.Context(), RunnerExecutionClaim{
		Key:           key,
		LeaseOwner:    "worker-b",
		LeaseDuration: 30 * time.Second,
		RunInterval:   time.Minute,
	})
	require.NoError(t, err)
	assert.False(t, claimed)

	err = store.MarkExecutionSuccess(t.Context(), testDB.DB(), key, "worker-a")
	require.NoError(t, err)

	claimed, err = store.TryClaimExecution(t.Context(), RunnerExecutionClaim{
		Key:           key,
		LeaseOwner:    "worker-c",
		LeaseDuration: 30 * time.Second,
		RunInterval:   time.Minute,
		Force:         true,
	})
	require.NoError(t, err)
	assert.True(t, claimed)
}
