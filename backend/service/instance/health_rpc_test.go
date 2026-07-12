package instance

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type healthFetcherFunc func(context.Context, resource.InstanceName) (*engine.InstanceHealth, error)

func (f healthFetcherFunc) GetInstanceOverview(context.Context, resource.InstanceName) (*engine.InstanceOverview, error) {
	return &engine.InstanceOverview{}, nil
}

func (f healthFetcherFunc) CheckInstanceHealth(ctx context.Context, instance resource.InstanceName) (*engine.InstanceHealth, error) {
	return f(ctx, instance)
}

type activityFetcherStub struct {
	activity *engine.ConnectionActivityHealth
}

func (f *activityFetcherStub) GetInstanceOverview(context.Context, resource.InstanceName) (*engine.InstanceOverview, error) {
	return &engine.InstanceOverview{}, nil
}

func (f *activityFetcherStub) CheckInstanceActivity(context.Context, resource.InstanceName) (*engine.InstanceHealth, error) {
	return &engine.InstanceHealth{ConnectionActivity: f.activity}, nil
}

func TestCheckInstanceActivityReturnsOnlyConnectionActivity(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, nil, nil, nil, nil, &activityFetcherStub{
		activity: &engine.ConnectionActivityHealth{
			Active:           2,
			Idle:             3,
			Total:            5,
			WaitingForLocks:  1,
			LongestTxSeconds: 90,
			Sessions: []engine.ConnectionActivitySession{
				{PID: 4211, ApplicationName: "worker-pool", State: "active"},
			},
		},
	}, false)

	resp, err := service.CheckInstanceActivity(context.Background(), connect.NewRequest(&v1alpha1.CheckInstanceActivityRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)
	require.NotNil(t, resp.Msg.GetActivity())
	assert.Equal(t, int32(2), resp.Msg.GetActivity().GetActiveConnections())
	require.Len(t, resp.Msg.GetActivity().GetSessions(), 1)
	assert.Equal(t, int32(4211), resp.Msg.GetActivity().GetSessions()[0].GetPid())
}

func TestCheckInstanceHealthReturnsActionableDatabaseBackedChecks(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	statsReset := time.Date(2026, 7, 3, 12, 30, 0, 0, time.UTC)
	service := NewService(nil, nil, nil, nil, nil, healthFetcherFunc(
		func(_ context.Context, _ resource.InstanceName) (*engine.InstanceHealth, error) {
			return &engine.InstanceHealth{
				ConnectionActivity: &engine.ConnectionActivityHealth{
					Active:            2,
					Idle:              3,
					IdleInTransaction: 1,
					Total:             5,
					Max:               100,
					UtilizationRatio:  0.05,
					WaitingForLocks:   1,
					LongRunningTxs:    1,
					LongestTxSeconds:  720,
					Status:            engine.HealthStatusWarning,
					Summary:           "1 connection is idle in transaction; 1 connection is waiting on locks",
					ByApplication: []engine.ApplicationConnections{
						{ApplicationName: "api-server", Active: 2, Idle: 1, IdleInTransaction: 1, Total: 4},
						{ApplicationName: "(unnamed)", Active: 0, Idle: 2, IdleInTransaction: 0, Total: 2},
					},
					Sessions: []engine.ConnectionActivitySession{
						{
							PID:             4211,
							Username:        "app_readwrite",
							ApplicationName: "worker-pool",
							DatabaseName:    "logistics",
							State:           "idle in transaction",
							DurationSeconds: 252,
							Query:           "UPDATE shipping.shipments SET status = 'in_transit'",
						},
						{
							PID:             4302,
							Username:        "app_readwrite",
							ApplicationName: "api-gateway",
							DatabaseName:    "logistics",
							State:           "active",
							DurationSeconds: 38,
							Query:           "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
							WaitEventType:   "Lock",
							WaitEvent:       "transactionid",
							BlockedByPID:    4211,
						},
					},
				},
				Replication: &engine.ReplicationHealth{
					Role:                   engine.ReplicationRolePrimary,
					AttachedReplicas:       2,
					StreamingReplicas:      1,
					SynchronousReplicas:    1,
					MaxReplicationLagBytes: 4096,
					Status:                 engine.HealthStatusOK,
					Summary:                "primary with 2 attached replicas",
				},
				StatsAccess: &engine.StatsAccessHealth{
					CurrentUser:           "querylane",
					Superuser:             false,
					PGMonitorMember:       true,
					PGReadAllStatsMember:  true,
					CanReadPGStatActivity: true,
					CanReadPGStatDatabase: true,
					Status:                engine.HealthStatusOK,
					Summary:               "querylane can inspect PostgreSQL statistics",
				},
				PGStatStatements: &engine.PGStatStatementsHealth{
					ExtensionInstalled:      true,
					ExtensionSchema:         "public",
					ExtensionVersion:        "1.10",
					SharedPreloadConfigured: true,
					TrackMode:               "top",
					ViewQueryable:           true,
					StatementCount:          42,
					StatsResetAt:            &statsReset,
					Status:                  engine.HealthStatusOK,
					Summary:                 "pg_stat_statements is tracking 42 statements",
				},
				Autovacuum: &engine.AutovacuumHealth{
					RunningWorkers:   1,
					MaxWorkers:       3,
					LastAutovacuumAt: &statsReset,
					Status:           engine.HealthStatusOK,
					Summary:          "1 of 3 workers active; last ran 18m ago",
				},
			}, nil
		},
	), false)

	resp, err := service.CheckInstanceHealth(context.Background(), connect.NewRequest(&v1alpha1.CheckInstanceHealthRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)

	health := resp.Msg.GetHealth()
	require.NotNil(t, health)

	activity := health.GetConnectionActivity()
	require.NotNil(t, activity)
	assert.Equal(t, v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_WARNING, activity.GetStatus())
	assert.Equal(t, int32(1), activity.GetIdleInTransactionConnections())
	assert.Equal(t, int32(1), activity.GetWaitingForLockConnections())
	assert.Equal(t, int64(720), activity.GetLongestTransactionSeconds())

	byApplication := activity.GetByApplication()
	require.Len(t, byApplication, 2)
	assert.Equal(t, "api-server", byApplication[0].GetApplicationName())
	assert.Equal(t, int32(2), byApplication[0].GetActiveConnections())
	assert.Equal(t, int32(4), byApplication[0].GetTotalConnections())
	assert.Equal(t, "(unnamed)", byApplication[1].GetApplicationName())
	assert.Equal(t, int32(2), byApplication[1].GetIdleConnections())

	sessions := activity.GetSessions()
	require.Len(t, sessions, 2)
	assert.Equal(t, int32(4211), sessions[0].GetPid())
	assert.Equal(t, "worker-pool", sessions[0].GetApplicationName())
	assert.Equal(t, int64(252), sessions[0].GetDurationSeconds())
	assert.Equal(t, int32(4302), sessions[1].GetPid())
	assert.Equal(t, int32(4211), sessions[1].GetBlockedByPid())
	assert.Equal(t, "Lock", sessions[1].GetWaitEventType())

	replication := health.GetReplication()
	require.NotNil(t, replication)
	assert.Equal(t, v1alpha1.ServerInfo_REPLICATION_ROLE_PRIMARY, replication.GetRole())
	assert.Equal(t, int32(2), replication.GetAttachedReplicas())
	assert.Equal(t, int64(4096), replication.GetMaxReplicationLagBytes())

	statsAccess := health.GetStatsAccess()
	require.NotNil(t, statsAccess)
	assert.Equal(t, "querylane", statsAccess.GetCurrentUser())
	assert.True(t, statsAccess.GetPgMonitorMember())
	assert.True(t, statsAccess.GetCanReadPgStatActivity())

	pgss := health.GetPgStatStatements()
	require.NotNil(t, pgss)
	assert.True(t, pgss.GetExtensionInstalled())
	assert.True(t, pgss.GetSharedPreloadConfigured())
	assert.True(t, pgss.GetViewQueryable())
	assert.Equal(t, int64(42), pgss.GetStatementCount())
	assert.Equal(t, statsReset, pgss.GetStatsResetAt().AsTime())

	autovacuum := health.GetAutovacuum()
	require.NotNil(t, autovacuum)
	assert.Equal(t, v1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_OK, autovacuum.GetStatus())
	assert.Equal(t, int32(1), autovacuum.GetRunningWorkers())
	assert.Equal(t, int32(3), autovacuum.GetMaxWorkers())
	assert.Equal(t, statsReset, autovacuum.GetLastAutovacuumAt().AsTime())
}

func TestCheckInstanceHealthPartialErrorsUseCheckMetadata(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	service := NewService(nil, nil, nil, nil, nil, healthFetcherFunc(
		func(_ context.Context, _ resource.InstanceName) (*engine.InstanceHealth, error) {
			return &engine.InstanceHealth{
				PGStatStatements: &engine.PGStatStatementsHealth{
					ExtensionInstalled: true,
					Status:             engine.HealthStatusWarning,
					Summary:            "pg_stat_statements is installed but not queryable",
				},
				PartialErrors: []engine.OverviewMetricError{
					{
						Metric: "pg_stat_statements",
						Err: &engine.PostgresSQLError{
							Kind:      engine.PostgresSQLKindUnavailable,
							Operation: "query pg_stat_statements stats",
							Sentinel:  engine.ErrQueryUnavailable,
						},
					},
				},
			}, nil
		},
	), false)

	resp, err := service.CheckInstanceHealth(context.Background(), connect.NewRequest(&v1alpha1.CheckInstanceHealthRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)
	require.Len(t, resp.Msg.GetPartialErrors(), 5)

	pgStatStatementsError := requireCheckPartialError(t, resp.Msg.GetPartialErrors(), "pg_stat_statements")
	info := requireStatusErrorInfo(t, pgStatStatementsError)
	assert.Equal(t, "CHECK_UNAVAILABLE", info.GetReason())
	assert.Equal(t, "pg_stat_statements", info.GetMetadata()["check"])
	assert.NotContains(t, info.GetMetadata(), "metric")
}

func requireCheckPartialError(t *testing.T, partialErrors []*rpcstatus.Status, check string) *rpcstatus.Status {
	t.Helper()

	for _, partialError := range partialErrors {
		info := statusErrorInfo(partialError)
		if info != nil && info.GetMetadata()["check"] == check {
			return partialError
		}
	}

	require.Failf(t, "missing partial error", "check %q not found in %#v", check, partialErrors)

	return nil
}
