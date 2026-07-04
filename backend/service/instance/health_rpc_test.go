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
	require.Len(t, resp.Msg.GetPartialErrors(), 4)

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
