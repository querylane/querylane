package jobs

import (
	"context"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
)

// SampleRetentionJobName is the stable name used for lease coordination.
const SampleRetentionJobName = "sample_retention"

// retentionTarget is the synthetic target used for the retention job. The job
// operates on the meta-DB (not per-instance), so the runner-execution row
// just needs a single, stable key.
const retentionTarget = "meta"

// samplePruner deletes sample rows older than age, returning deleted counts
// per table. Implemented by storage.PruneSamplesOlderThanTx.
type samplePruner func(ctx context.Context, exec storage.QueryExecutor, age time.Duration) (map[string]int64, error)

// leasePruner deletes departed-target lease rows older than age. Implemented
// by storage.PruneStaleRunnerExecutionStateTx.
type leasePruner func(ctx context.Context, exec storage.QueryExecutor, age time.Duration) (int64, error)

// SampleRetentionJob deletes sample rows older than the sample age and
// runner-execution rows for targets that stopped running (departed instances
// or databases). It runs on the lease infrastructure, so multi-replica setups
// never run two retention sweeps at the same time.
type SampleRetentionJob struct {
	config        runner.Config
	sampleAge     time.Duration
	staleLeaseAge time.Duration
	pruneSamples  samplePruner
	pruneLeases   leasePruner
}

// NewSampleRetention returns a retention job that prunes samples older
// than sampleAge and departed-target lease rows older than staleLeaseAge on
// each cycle.
func NewSampleRetention(cfg runner.Config, sampleAge time.Duration, staleLeaseAge time.Duration) *SampleRetentionJob {
	return &SampleRetentionJob{
		config:        cfg,
		sampleAge:     sampleAge,
		staleLeaseAge: staleLeaseAge,
		pruneSamples:  storage.PruneSamplesOlderThanTx,
		pruneLeases:   storage.PruneStaleRunnerExecutionStateTx,
	}
}

// Config implements [runner.Job].
func (j *SampleRetentionJob) Config() runner.Config { return j.config }

// ListTargets implements [runner.Job]; returns a single synthetic target because
// retention runs against the meta DB, not per-instance.
func (j *SampleRetentionJob) ListTargets(_ context.Context) ([]string, error) {
	return []string{retentionTarget}, nil
}

// Run defers the actual DELETEs to Commit so they run in the same transaction
// as the lease bookkeeping — no risk of "marked done but rows still there".
func (j *SampleRetentionJob) Run(_ context.Context, _ string) (runner.RunResult, error) {
	return runner.RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		prunedSamples, err := j.pruneSamples(ctx, exec, j.sampleAge)
		if err != nil {
			return err
		}

		prunedLeases, err := j.pruneLeases(ctx, exec, j.staleLeaseAge)
		if err != nil {
			return err
		}

		var totalSamples int64
		for _, rows := range prunedSamples {
			totalSamples += rows
		}

		// Logged before the surrounding transaction commits; the counts can
		// overstate reality only in the rare lease-lost rollback, which logs
		// its own warning right after.
		slog.InfoContext(ctx, "retention sweep",
			slog.Int64("samples_pruned", totalSamples),
			slog.Int64("stale_leases_pruned", prunedLeases),
			slog.Any("samples_pruned_by_table", prunedSamples),
			slog.Duration("sample_age", j.sampleAge),
			slog.Duration("stale_lease_age", j.staleLeaseAge))

		return nil
	}}, nil
}
