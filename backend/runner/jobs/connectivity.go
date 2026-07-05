package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
)

// InstanceConnectivityJobName is the stable lease-key name for the
// connectivity job. It must not change across restarts; it identifies rows in
// runner_execution_state. Probe names live in probes.go.
const InstanceConnectivityJobName = "instance_connectivity"

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
	config   runner.Config
	checker  InstanceConnectionChecker
	recorder instanceConnectionRecorder
	source   *InstanceTargetSource
}

// NewInstanceConnectivity returns a job that probes connectivity for every known
// instance on each cycle.
func NewInstanceConnectivity(
	cfg runner.Config,
	checker InstanceConnectionChecker,
	recorder instanceConnectionRecorder,
	source *InstanceTargetSource,
) *InstanceConnectivityJob {
	return &InstanceConnectivityJob{
		config:   cfg,
		checker:  checker,
		recorder: recorder,
		source:   source,
	}
}

// Config implements [runner.Job].
func (j *InstanceConnectivityJob) Config() runner.Config { return j.config }

// ListTargets implements [runner.Job]; one target per managed instance.
func (j *InstanceConnectivityJob) ListTargets(ctx context.Context) ([]string, error) {
	return j.source.ListTargets(ctx)
}

// Run probes the target instance and returns a RunResult whose Commit records
// the observed state. Probe failures are NOT returned as Go errors — they are
// the normal "instance unreachable" outcome and must commit as a recorded
// state so the UI can show it.
func (j *InstanceConnectivityJob) Run(ctx context.Context, target string) (runner.RunResult, error) {
	instanceName, err := resource.ParseInstanceName(target)
	if err != nil {
		return runner.RunResult{}, fmt.Errorf("parse instance target: %w", err)
	}

	checkedAt := time.Now()

	probeErr := j.checker.CheckInstanceConnection(ctx, instanceName)
	if probeErr != nil {
		slog.DebugContext(ctx, "instance probe failed",
			slog.String("instance", instanceName.InstanceID),
			slog.String("error", probeErr.Error()))
	}

	return runner.RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		if probeErr != nil {
			return j.recorder.RecordErrorTx(ctx, exec, instanceName.InstanceID, checkedAt, probeErr)
		}

		return j.recorder.RecordActiveTx(ctx, exec, instanceName.InstanceID, checkedAt)
	}}, nil
}
