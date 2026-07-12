package admin

import (
	"context"
	"errors"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

type fakeReplicaStore struct {
	params        aip.Params
	rows          []model.Replica
	nextPageToken string
	listErr       error

	byIDsRequest []string
	byIDsRows    []model.Replica
	byIDsErr     error

	dbNow time.Time
}

func (f *fakeReplicaStore) ListReplicas(_ context.Context, params aip.Params) ([]model.Replica, string, error) {
	f.params = params
	return f.rows, f.nextPageToken, f.listErr
}

func (f *fakeReplicaStore) GetReplicasByIDs(_ context.Context, ids []string) ([]model.Replica, error) {
	f.byIDsRequest = ids
	return f.byIDsRows, f.byIDsErr
}

func (f *fakeReplicaStore) DatabaseNow(_ context.Context) (time.Time, error) {
	return f.dbNow, nil
}

type fakeExecutionLister struct {
	params        aip.Params
	rows          []model.RunnerExecutionState
	nextPageToken string
	err           error
}

func (f *fakeExecutionLister) ListRunnerExecutions(_ context.Context, params aip.Params) ([]model.RunnerExecutionState, string, error) {
	f.params = params
	return f.rows, f.nextPageToken, f.err
}

type fakeSyncStateLister struct {
	params        aip.Params
	rows          []model.CatalogSyncState
	nextPageToken string
	err           error
}

func (f *fakeSyncStateLister) ListSyncStates(_ context.Context, params aip.Params) ([]model.CatalogSyncState, string, error) {
	f.params = params
	return f.rows, f.nextPageToken, f.err
}

func noSampleStats(_ context.Context) ([]storage.SampleTableStats, error) {
	return nil, nil
}

func newTestService(replicas *fakeReplicaStore, executions *fakeExecutionLister, syncStates *fakeSyncStateLister, sampleStats sampleStatsLister) *Service {
	if replicas == nil {
		replicas = &fakeReplicaStore{}
	}

	if executions == nil {
		executions = &fakeExecutionLister{}
	}

	if syncStates == nil {
		syncStates = &fakeSyncStateLister{}
	}

	if sampleStats == nil {
		sampleStats = noSampleStats
	}

	return NewService(replicas, executions, syncStates, sampleStats, 30*24*time.Hour)
}

func TestListReplicas(t *testing.T) {
	t.Parallel()

	dbNow := time.Now()
	fresh := dbNow.Add(-10 * time.Second)
	stale := dbNow.Add(-storage.ReplicaLivenessWindow - time.Second)

	store := &fakeReplicaStore{
		rows: []model.Replica{
			{ID: "replica-a", Hostname: "host-1", Pid: 10, StartedAt: dbNow.Add(-time.Hour), LastSeenAt: fresh},
			{ID: "replica-b", Hostname: "host-2", Pid: 20, StartedAt: dbNow.Add(-time.Hour), LastSeenAt: stale},
		},
		nextPageToken: "next",
		dbNow:         dbNow,
	}

	svc := newTestService(store, nil, nil, nil)

	res, err := svc.ListReplicas(t.Context(), connect.NewRequest(&v1alpha1.ListReplicasRequest{
		PageSize: 10,
		Filter:   `hostname = "host-1"`,
	}))
	require.NoError(t, err)

	assert.Equal(t, aip.Params{PageSize: 10, Filter: `hostname = "host-1"`}, store.params)
	assert.Equal(t, "next", res.Msg.GetNextPageToken())

	replicas := res.Msg.GetReplicas()
	require.Len(t, replicas, 2)

	assert.Equal(t, "replica-a", replicas[0].GetReplicaId())
	assert.Equal(t, "host-1", replicas[0].GetHostname())
	assert.Equal(t, int64(10), replicas[0].GetPid())
	assert.True(t, replicas[0].GetActive(), "heartbeat within liveness window")

	assert.False(t, replicas[1].GetActive(), "heartbeat older than liveness window")
}

func TestListReplicas_MapsListErrors(t *testing.T) {
	t.Parallel()

	store := &fakeReplicaStore{listErr: storage.ErrInvalidFilter}
	svc := newTestService(store, nil, nil, nil)

	_, err := svc.ListReplicas(t.Context(), connect.NewRequest(&v1alpha1.ListReplicasRequest{Filter: "bogus ==="}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestListAdminRunnerExecutions(t *testing.T) {
	t.Parallel()

	now := time.Now()
	past := now.Add(-time.Minute)
	future := now.Add(time.Minute)
	ownerKnown := "replica-a"
	ownerPruned := "replica-gone"
	lastErr := "context deadline exceeded"

	executions := &fakeExecutionLister{
		rows: []model.RunnerExecutionState{
			{
				RunnerName:     "probe_cache",
				TargetName:     "instances/prod",
				LeaseOwner:     &ownerKnown,
				LeaseExpiresAt: &future,
				LastStartedAt:  &past,
				LastSuccessAt:  &past,
			},
			{
				RunnerName:     "probe_connections",
				TargetName:     "instances/prod",
				LeaseOwner:     &ownerPruned,
				LeaseExpiresAt: &future,
				LastStartedAt:  &past,
			},
			{
				RunnerName:     "probe_vacuum",
				TargetName:     "instances/prod/databases/appdb",
				LeaseOwner:     &ownerKnown,
				LeaseExpiresAt: &past, // expired: dead replica, not a held lease
				LastStartedAt:  &past,
				LastFinishedAt: &past,
				LastError:      &lastErr,
			},
		},
		nextPageToken: "next",
	}
	replicas := &fakeReplicaStore{
		dbNow:     now,
		byIDsRows: []model.Replica{{ID: ownerKnown, Hostname: "host-1"}},
	}

	svc := newTestService(replicas, executions, nil, nil)

	res, err := svc.ListAdminRunnerExecutions(t.Context(), connect.NewRequest(&v1alpha1.ListAdminRunnerExecutionsRequest{
		PageSize: 25,
		Filter:   `runner_name = "probe_cache"`,
	}))
	require.NoError(t, err)

	assert.Equal(t, aip.Params{PageSize: 25, Filter: `runner_name = "probe_cache"`}, executions.params)
	assert.Equal(t, "next", res.Msg.GetNextPageToken())

	// Only distinct live lease owners hit the registry lookup: the expired
	// third row's owner must not be re-requested (it equals ownerKnown, so
	// dedup covers it) and dead leases resolve no identity.
	assert.ElementsMatch(t, []string{ownerKnown, ownerPruned}, replicas.byIDsRequest)

	rows := res.Msg.GetRunnerExecutions()
	require.Len(t, rows, 3)

	held := rows[0]
	assert.True(t, held.GetLeaseHeld())
	require.NotNil(t, held.GetLeaseOwner())
	assert.Equal(t, ownerKnown, held.GetLeaseOwner().GetReplicaId())
	assert.Equal(t, "host-1", held.GetLeaseOwner().GetHostname(), "owner enriched with hostname")
	assert.NotNil(t, held.GetLeaseExpiresAt())

	pruned := rows[1]
	assert.True(t, pruned.GetLeaseHeld())
	require.NotNil(t, pruned.GetLeaseOwner())
	assert.Equal(t, ownerPruned, pruned.GetLeaseOwner().GetReplicaId())
	assert.Empty(t, pruned.GetLeaseOwner().GetHostname(), "pruned replica has no hostname")

	expired := rows[2]
	assert.False(t, expired.GetLeaseHeld())
	assert.Nil(t, expired.GetLeaseOwner(), "expired lease exposes no owner")
	assert.Nil(t, expired.GetLeaseExpiresAt())
	assert.Equal(t, lastErr, expired.GetLastError())
}

func TestListAdminRunnerExecutions_MapsListErrors(t *testing.T) {
	t.Parallel()

	executions := &fakeExecutionLister{err: storage.ErrInvalidFilter}
	svc := newTestService(nil, executions, nil, nil)

	_, err := svc.ListAdminRunnerExecutions(t.Context(), connect.NewRequest(&v1alpha1.ListAdminRunnerExecutionsRequest{
		Filter: "bogus ===",
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestListCatalogSyncStates(t *testing.T) {
	t.Parallel()

	syncedAt := time.Now().Add(-time.Minute)
	updatedAt := time.Now()
	rawErr := `connect: password authentication failed for user "app"`

	lister := &fakeSyncStateLister{
		rows: []model.CatalogSyncState{
			{Scope: "instances/a/databases", Status: catalog.SyncStatusSynced, LastSyncedAt: &syncedAt, UpdatedAt: updatedAt},
			{Scope: "instances/b/databases", Status: catalog.SyncStatusError, Error: &rawErr, UpdatedAt: updatedAt},
			{Scope: "instances/c/databases", Status: catalog.SyncStatusPending, UpdatedAt: updatedAt},
			{Scope: "instances/d/databases", Status: catalog.SyncStatusSyncing, UpdatedAt: updatedAt},
		},
		nextPageToken: "next",
	}

	svc := newTestService(nil, nil, lister, nil)

	res, err := svc.ListCatalogSyncStates(t.Context(), connect.NewRequest(&v1alpha1.ListCatalogSyncStatesRequest{PageSize: 100}))
	require.NoError(t, err)
	assert.Equal(t, "next", res.Msg.GetNextPageToken())

	states := res.Msg.GetCatalogSyncStates()
	require.Len(t, states, 4)

	assert.Equal(t, v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCED, states[0].GetStatus())
	assert.Equal(t, syncedAt.Unix(), states[0].GetLastSyncedAt().AsTime().Unix())
	assert.Empty(t, states[0].GetSyncError())

	// The raw error passes through verbatim — this is the admin surface,
	// deliberately unlike the sanitized user-facing sync metadata.
	assert.Equal(t, v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_ERROR, states[1].GetStatus())
	assert.Equal(t, rawErr, states[1].GetSyncError())

	assert.Equal(t, v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_NEVER_SYNCED, states[2].GetStatus())
	assert.Equal(t, v1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCING, states[3].GetStatus())
}

func TestListCatalogSyncStates_MapsListErrors(t *testing.T) {
	t.Parallel()

	lister := &fakeSyncStateLister{err: storage.ErrInvalidFilter}
	svc := newTestService(nil, nil, lister, nil)

	_, err := svc.ListCatalogSyncStates(t.Context(), connect.NewRequest(&v1alpha1.ListCatalogSyncStatesRequest{Filter: "bogus ==="}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func TestGetMetricsStorageStats(t *testing.T) {
	t.Parallel()

	oldest := time.Now().Add(-24 * time.Hour)
	newest := time.Now()

	stats := func(_ context.Context) ([]storage.SampleTableStats, error) {
		return []storage.SampleTableStats{
			{
				TableName:         "instance_connection_sample",
				EstimatedRowCount: 12345,
				TotalBytes:        1 << 20,
				OldestObservedAt:  &oldest,
				NewestObservedAt:  &newest,
			},
			{
				TableName:         "database_vacuum_sample",
				EstimatedRowCount: -1, // never analyzed
				TotalBytes:        8192,
			},
		}, nil
	}

	svc := newTestService(nil, nil, nil, stats)

	res, err := svc.GetMetricsStorageStats(t.Context(), connect.NewRequest(&v1alpha1.GetMetricsStorageStatsRequest{}))
	require.NoError(t, err)

	assert.Equal(t, 30*24*time.Hour, res.Msg.GetRetentionPeriod().AsDuration())

	tables := res.Msg.GetSampleTables()
	require.Len(t, tables, 2)

	assert.Equal(t, "instance_connection_sample", tables[0].GetTableName())
	assert.Equal(t, int64(12345), tables[0].GetEstimatedRowCount())
	assert.Equal(t, int64(1<<20), tables[0].GetTotalBytes())
	assert.Equal(t, oldest.Unix(), tables[0].GetOldestSampleAt().AsTime().Unix())

	assert.Equal(t, int64(-1), tables[1].GetEstimatedRowCount())
	assert.Nil(t, tables[1].GetOldestSampleAt(), "empty table has no sample range")
	assert.Nil(t, tables[1].GetNewestSampleAt())
}

func TestGetMetricsStorageStats_MapsErrors(t *testing.T) {
	t.Parallel()

	stats := func(_ context.Context) ([]storage.SampleTableStats, error) {
		return nil, errors.New("boom")
	}

	svc := newTestService(nil, nil, nil, stats)

	_, err := svc.GetMetricsStorageStats(t.Context(), connect.NewRequest(&v1alpha1.GetMetricsStorageStatsRequest{}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInternal, connect.CodeOf(err))
}
