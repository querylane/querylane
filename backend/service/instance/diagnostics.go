package instance

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/service/internal/pgconv"
)

func lockStatisticsToProto(statistics *engine.LockStatistics) *api.LockStatistics {
	if statistics == nil {
		return nil
	}
	result := &api.LockStatistics{Status: healthStatusToProto(statistics.Status), Summary: statistics.Summary, Availability: pgconv.ObservationAvailabilityToProto(string(statistics.Availability))}
	for _, row := range statistics.ByType {
		sample := &api.LockTypeStatistics{LockType: row.LockType, Waits: row.Waits, WaitTimeMs: row.WaitTimeMs, FastpathExceeded: row.FastpathExceeded}
		if row.StatsResetAt != nil {
			sample.StatsResetAt = timestamppb.New(*row.StatsResetAt)
		}
		result.ByType = append(result.ByType, sample)
	}
	return result
}

func recoveryHealthToProto(recovery *engine.RecoveryHealth) *api.RecoveryHealth {
	if recovery == nil {
		return nil
	}
	return &api.RecoveryHealth{Availability: pgconv.ObservationAvailabilityToProto(string(recovery.Availability)), PauseState: recovery.PauseState, PromotionTriggered: recovery.PromotionTriggered, ReplayEndLsn: recovery.ReplayEndLSN, ReplayTimeline: recovery.ReplayTimeline}
}
