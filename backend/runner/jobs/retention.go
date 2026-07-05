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

// sampleRetentionBatchSize bounds each retention DELETE. Sized so a batch
// finishes in well under a second on modest hardware: the sweep stays
// responsive to cancellation and never holds long row locks, while still
// clearing millions of backlogged rows within one lease window.
const sampleRetentionBatchSize = 10_000

// samplePruner deletes sample rows older than age in batches, returning
// deleted counts per table. Implemented by storage.PruneSamplesOlderThan.
type samplePruner func(ctx context.Context, db storage.QueryExecutor, age time.Duration, batchSize int64) (map[string]int64, error)

// leasePruner deletes departed-target lease rows older than age. Implemented
// by storage.PruneStaleRunnerExecutionStateTx.
type leasePruner func(ctx context.Context, exec storage.QueryExecutor, age time.Duration) (int64, error)

// SampleRetentionJob deletes sample rows older than the sample age and
// runner-execution rows for targets that stopped running (departed instances
// or databases). It runs on the lease infrastructure, so multi-replica setups
// never run two retention sweeps at the same time.
type SampleRetentionJob struct {
	config        runner.Config
	db            storage.QueryExecutor
	sampleAge     time.Duration
	staleLeaseAge time.Duration
	pruneSamples  samplePruner
	pruneLeases   leasePruner
}

// NewSampleRetention returns a retention job that prunes samples older
// than sampleAge and departed-target lease rows older than staleLeaseAge on
// each cycle. db must be the raw meta-DB handle (not a transaction): the
// sample sweep commits each delete batch independently.
func NewSampleRetention(cfg runner.Config, db storage.QueryExecutor, sampleAge time.Duration, staleLeaseAge time.Duration) *SampleRetentionJob {
	return &SampleRetentionJob{
		config:        cfg,
		db:            db,
		sampleAge:     sampleAge,
		staleLeaseAge: staleLeaseAge,
		pruneSamples:  storage.PruneSamplesOlderThan,
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

// Run prunes expired samples in batches directly against the meta DB instead
// of deferring them to Commit: the deletes are idempotent, so they don't need
// the lease-shared transaction, and batching them outside it keeps an
// arbitrarily large backlog from becoming one unbounded DELETE that cannot
// finish inside the lease window. A sweep cut short by cancellation keeps the
// batches already committed and reports the error; the next cycle continues
// where it stopped. Only the cheap lease pruning and the summary log ride in
// Commit with the success bookkeeping.
func (j *SampleRetentionJob) Run(ctx context.Context, _ string) (runner.RunResult, error) {
	prunedSamples, err := j.pruneSamples(ctx, j.db, j.sampleAge, sampleRetentionBatchSize)
	if err != nil {
		return runner.RunResult{}, err
	}

	return runner.RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		prunedLeases, err := j.pruneLeases(ctx, exec, j.staleLeaseAge)
		if err != nil {
			return err
		}

		var totalSamples int64
		for _, rows := range prunedSamples {
			totalSamples += rows
		}

		// Logged before the surrounding transaction commits; the lease count
		// can overstate reality only in the rare lease-lost rollback, which
		// logs its own warning right after.
		slog.InfoContext(ctx, "retention sweep",
			slog.Int64("samples_pruned", totalSamples),
			slog.Int64("stale_leases_pruned", prunedLeases),
			slog.Any("samples_pruned_by_table", prunedSamples),
			slog.Duration("sample_age", j.sampleAge),
			slog.Duration("stale_lease_age", j.staleLeaseAge))

		return nil
	}}, nil
}
