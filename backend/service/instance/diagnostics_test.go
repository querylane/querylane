package instance

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestDiagnosticMappingsPreserveObservationMeaning(t *testing.T) {
	t.Parallel()
	reset := time.Date(2026, time.November, 10, 0, 0, 0, 0, time.UTC)
	locks := lockStatisticsToProto(&engine.LockStatistics{Availability: engine.LockStatisticsAvailable, Status: engine.HealthStatusOK, ByType: []engine.LockTypeStatistics{{LockType: "relation", Waits: 3, WaitTimeMs: 12.5, FastpathExceeded: 9, StatsResetAt: &reset}}})
	require.Len(t, locks.GetByType(), 1)
	assert.Equal(t, api.ObservationAvailability_OBSERVATION_AVAILABILITY_AVAILABLE, locks.GetAvailability())
	row := locks.GetByType()[0]
	assert.Equal(t, int64(3), row.GetWaits())
	assert.InDelta(t, 12.5, row.GetWaitTimeMs(), 0.0001)
	assert.Equal(t, int64(9), row.GetFastpathExceeded())
	assert.Equal(t, reset, row.GetStatsResetAt().AsTime())
	replication := replicationHealthToProto(&engine.ReplicationHealth{Role: engine.ReplicationRoleReplica, StatisticsVisible: true, ReplayLagKnown: false, Recovery: &engine.RecoveryHealth{Availability: engine.RecoveryAvailable, PauseState: "paused", PromotionTriggered: false, ReplayEndLSN: "0/1234", ReplayTimeline: 2}})
	assert.True(t, replication.GetStatisticsVisible())
	assert.False(t, replication.GetReplayLagKnown(), "no timestamp is not zero lag")
	require.NotNil(t, replication.GetRecovery())
	assert.Equal(t, "paused", replication.GetRecovery().GetPauseState())
	assert.Equal(t, "0/1234", replication.GetRecovery().GetReplayEndLsn())
	assert.Equal(t, int32(2), replication.GetRecovery().GetReplayTimeline())
	assert.Nil(t, lockStatisticsToProto(nil))
	assert.Nil(t, recoveryHealthToProto(nil))
}
