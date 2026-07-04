package runner

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

// InstanceConnectionChecker probes live connectivity for an instance.
// Implemented by *engine.SessionResolver.
type InstanceConnectionChecker interface {
	CheckInstanceConnection(ctx context.Context, instanceName resource.InstanceName) error
}

// instanceConnectionRecorder folds a connection observation into a caller
// transaction so the manager can pair it with execution-success bookkeeping.
// Implemented by *storage.PGInstanceConnectionRecorder.
type instanceConnectionRecorder interface {
	RecordActiveTx(ctx context.Context, exec storage.QueryExecutor, instanceID string, checkedAt time.Time) error
	RecordErrorTx(ctx context.Context, exec storage.QueryExecutor, instanceID string, checkedAt time.Time, err error) error
}

// InstanceConnectivityJob probes each instance and records the result through the
// shared connection-state recorder. Probe failures are recorded as
// CONNECTION_STATE_ERROR and do not propagate as job errors.
type InstanceConnectivityJob struct {
	config      Config
	checker     InstanceConnectionChecker
	recorder    instanceConnectionRecorder
	listTargets func(ctx context.Context) ([]string, error)
}

// NewInstanceConnectivityJob returns a job that probes connectivity for every known
// instance on each cycle.
func NewInstanceConnectivityJob(
	cfg Config,
	checker InstanceConnectionChecker,
	recorder instanceConnectionRecorder,
	source *InstanceTargetSource,
) *InstanceConnectivityJob {
	return &InstanceConnectivityJob{
		config:      cfg,
		checker:     checker,
		recorder:    recorder,
		listTargets: source.ListTargets,
	}
}

// Config implements [Job].
func (j *InstanceConnectivityJob) Config() Config { return j.config }

// ListTargets implements [Job]; one target per managed instance.
func (j *InstanceConnectivityJob) ListTargets(ctx context.Context) ([]string, error) {
	return j.listTargets(ctx)
}

// Run probes the target instance and returns a RunResult whose Commit records
// the observed state. Probe failures are NOT returned as Go errors — they are
// the normal "instance unreachable" outcome and must commit as a recorded
// state so the UI can show it.
func (j *InstanceConnectivityJob) Run(ctx context.Context, target string) (RunResult, error) {
	instanceName, err := resource.ParseInstanceName(target)
	if err != nil {
		return RunResult{}, fmt.Errorf("parse instance target: %w", err)
	}

	checkedAt := time.Now()

	probeErr := j.checker.CheckInstanceConnection(ctx, instanceName)
	if probeErr != nil {
		slog.DebugContext(ctx, "instance probe failed",
			slog.String("instance", instanceName.InstanceID),
			slog.String("error", probeErr.Error()))
	}

	return RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		if probeErr != nil {
			return j.recorder.RecordErrorTx(ctx, exec, instanceName.InstanceID, checkedAt, probeErr)
		}

		return j.recorder.RecordActiveTx(ctx, exec, instanceName.InstanceID, checkedAt)
	}}, nil
}
