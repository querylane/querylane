package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/runner/jobs"
)

func (s *RPCSuite) TestAdmin_ListReplicas() {
	t := s.T()

	res, err := s.adminClient.ListReplicas(context.Background(), connect.NewRequest(&consolev1alpha1.ListReplicasRequest{}))
	require.NoError(t, err)

	replicas := res.Msg.GetReplicas()
	require.NotEmpty(t, replicas, "the booted server registers itself via heartbeat")

	self := replicas[0]
	assert.NotEmpty(t, self.GetReplicaId())
	assert.NotEmpty(t, self.GetHostname())
	assert.Positive(t, self.GetPid())
	assert.True(t, self.GetActive(), "a freshly heartbeating replica is active")
	require.NotNil(t, self.GetLastSeenAt())
	require.NotNil(t, self.GetStartedAt())
}

func (s *RPCSuite) TestAdmin_ListAdminRunnerExecutions() {
	t := s.T()
	ctx := context.Background()

	// The connectivity runner (30s cadence, first cycle immediate) is the
	// fastest to produce a row for the registered instance; sample_retention
	// writes its "meta" target on the same first cycle. Poll briefly: suite
	// boot and first cycle race.
	var executions []*consolev1alpha1.AdminRunnerExecution

	require.Eventually(t, func() bool {
		res, err := s.adminClient.ListAdminRunnerExecutions(ctx, connect.NewRequest(&consolev1alpha1.ListAdminRunnerExecutionsRequest{
			PageSize: 1000,
		}))
		if err != nil {
			return false
		}

		executions = res.Msg.GetRunnerExecutions()

		return hasExecution(executions, jobs.InstanceConnectivityJobName, s.instanceName()) &&
			hasExecution(executions, jobs.SampleRetentionJobName, "meta")
	}, 60*time.Second, time.Second, "connectivity and retention runners produce execution rows")

	for _, execution := range executions {
		if !execution.GetLeaseHeld() {
			assert.Nil(t, execution.GetLeaseOwner(), "no owner exposed without a live lease")
			assert.Nil(t, execution.GetLeaseExpiresAt())

			continue
		}

		// A held lease carries the owner's replica identity; the only
		// replica in this suite is the booted server itself.
		require.NotNil(t, execution.GetLeaseOwner())
		assert.NotEmpty(t, execution.GetLeaseOwner().GetReplicaId())
		assert.NotEmpty(t, execution.GetLeaseOwner().GetHostname())
		assert.NotNil(t, execution.GetLeaseExpiresAt())
	}

	// AIP-160 filter narrows by runner name.
	filtered, err := s.adminClient.ListAdminRunnerExecutions(ctx, connect.NewRequest(&consolev1alpha1.ListAdminRunnerExecutionsRequest{
		Filter: `runner_name = "` + jobs.SampleRetentionJobName + `"`,
	}))
	require.NoError(t, err)
	require.NotEmpty(t, filtered.Msg.GetRunnerExecutions())

	for _, execution := range filtered.Msg.GetRunnerExecutions() {
		assert.Equal(t, jobs.SampleRetentionJobName, execution.GetRunnerName())
	}

	_, err = s.adminClient.ListAdminRunnerExecutions(ctx, connect.NewRequest(&consolev1alpha1.ListAdminRunnerExecutionsRequest{
		Filter: `nonsense = "x"`,
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *RPCSuite) TestAdmin_ListCatalogSyncStates() {
	t := s.T()
	ctx := context.Background()

	// ListDatabases triggers the read-through catalog sync that populates
	// the databases scope for the registered instance.
	_, err := s.databaseClient.ListDatabases(ctx, connect.NewRequest(&consolev1alpha1.ListDatabasesRequest{
		Parent: s.instanceName(),
	}))
	require.NoError(t, err)

	res, err := s.adminClient.ListCatalogSyncStates(ctx, connect.NewRequest(&consolev1alpha1.ListCatalogSyncStatesRequest{
		PageSize: 1000,
	}))
	require.NoError(t, err)

	states := res.Msg.GetCatalogSyncStates()
	require.NotEmpty(t, states)

	wantScope := s.instanceName() + "/databases"

	var found *consolev1alpha1.CatalogSyncState

	for _, state := range states {
		if state.GetScope() == wantScope {
			found = state

			break
		}
	}

	require.NotNil(t, found, "databases scope tracked after read-through sync")
	assert.Equal(t, consolev1alpha1.CatalogSyncStatus_CATALOG_SYNC_STATUS_SYNCED, found.GetStatus())
	assert.NotNil(t, found.GetLastSyncedAt())
	assert.Empty(t, found.GetSyncError())
	require.NotNil(t, found.GetUpdatedAt())
}

func (s *RPCSuite) TestAdmin_GetMetricsStorageStats() {
	t := s.T()

	res, err := s.adminClient.GetMetricsStorageStats(context.Background(), connect.NewRequest(&consolev1alpha1.GetMetricsStorageStatsRequest{}))
	require.NoError(t, err)

	tables := res.Msg.GetSampleTables()
	require.Len(t, tables, 6, "one entry per sample table")

	names := make([]string, 0, len(tables))
	for _, table := range tables {
		names = append(names, table.GetTableName())
		assert.Positive(t, table.GetTotalBytes(), "table %s reports on-disk size", table.GetTableName())
	}

	assert.ElementsMatch(t, []string{
		"instance_connection_sample",
		"instance_storage_sample",
		"instance_cache_sample",
		"instance_io_sample",
		"database_size_sample",
		"database_vacuum_sample",
	}, names)

	assert.Equal(t, 30*24*time.Hour, res.Msg.GetRetentionPeriod().AsDuration())
}

func hasExecution(executions []*consolev1alpha1.AdminRunnerExecution, runnerName, target string) bool {
	for _, execution := range executions {
		if execution.GetRunnerName() == runnerName && execution.GetTarget() == target {
			return true
		}
	}

	return false
}
