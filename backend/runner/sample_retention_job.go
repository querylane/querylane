package runner

import (
	"context"
	"time"

	"github.com/querylane/querylane/backend/storage"
)

// SampleRetentionJobName is the stable name used for lease coordination.
const SampleRetentionJobName = "sample_retention"

// retentionTarget is the synthetic target used for the retention job. The job
// operates on the meta-DB (not per-instance), so the runner-execution row
// just needs a single, stable key.
const retentionTarget = "meta"

// samplePruner deletes sample rows older than age. Implemented by
// storage.PruneSamplesOlderThanTx (see backend/storage/sample_query.go).
type samplePruner func(ctx context.Context, exec storage.QueryExecutor, age time.Duration) error

// SampleRetentionJob deletes rows from instance_*_sample tables older than
// the configured age. It runs on the lease infrastructure, so multi-replica
// setups never run two retention sweeps at the same time.
type SampleRetentionJob struct {
	config Config
	age    time.Duration
	prune  samplePruner
}

// NewSampleRetentionJob returns a retention job that prunes samples older
// than age on each cycle.
func NewSampleRetentionJob(cfg Config, age time.Duration) *SampleRetentionJob {
	return &SampleRetentionJob{config: cfg, age: age, prune: storage.PruneSamplesOlderThanTx}
}

// Config implements [Job].
func (j *SampleRetentionJob) Config() Config { return j.config }

// ListTargets implements [Job]; returns a single synthetic target because
// retention runs against the meta DB, not per-instance.
func (j *SampleRetentionJob) ListTargets(_ context.Context) ([]string, error) {
	return []string{retentionTarget}, nil
}

// Run defers the actual DELETE to Commit so it runs in the same transaction
// as the lease bookkeeping — no risk of "marked done but rows still there.".
func (j *SampleRetentionJob) Run(_ context.Context, _ string) (RunResult, error) {
	return RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		return j.prune(ctx, exec, j.age)
	}}, nil
}
