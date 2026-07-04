package runner

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

// InstanceSessionOpener opens a session against a managed instance.
// Implemented by *engine.SessionResolver.
type InstanceSessionOpener interface {
	OpenInstance(ctx context.Context, instanceName resource.InstanceName) (engine.InstanceSession, error)
}

// instanceConnectionSampleAppender appends one connection-utilization sample.
// Implemented by *storage.PGInstanceConnectionSampleStore.
type instanceConnectionSampleAppender interface {
	InsertTx(ctx context.Context, exec storage.QueryExecutor, sample storage.InstanceConnectionSample) error
}

// instanceStorageSampleAppender appends one storage sample.
// Implemented by *storage.PGInstanceStorageSampleStore.
type instanceStorageSampleAppender interface {
	InsertTx(ctx context.Context, exec storage.QueryExecutor, sample storage.InstanceStorageSample) error
}

// instanceCacheSampleAppender appends one buffer-cache sample.
// Implemented by *storage.PGInstanceCacheSampleStore.
type instanceCacheSampleAppender interface {
	InsertTx(ctx context.Context, exec storage.QueryExecutor, sample storage.InstanceCacheSample) error
}

// InstanceMetricsJob collects connection / storage / cache utilization for
// each instance per cycle and appends one row per succeeding subsystem to
// its typed sample table. A failed subsystem contributes no row — its
// absence in the table is the "no data" signal a chart needs.
//
// last_success_at on runner_execution_state reflects "the job ran its
// policy", not "data was collected": a session-open failure or a hard
// overview-query failure returns a zero RunResult and the execution is still
// marked successful. Connectivity is owned by InstanceConnectivityJob.
type InstanceMetricsJob struct {
	config       Config
	sessions     InstanceSessionOpener
	connStore    instanceConnectionSampleAppender
	storageStore instanceStorageSampleAppender
	cacheStore   instanceCacheSampleAppender
	listTargets  func(ctx context.Context) ([]string, error)
}

// NewInstanceMetricsJob creates a job that appends typed metric samples for
// each known instance.
func NewInstanceMetricsJob(
	cfg Config,
	sessions InstanceSessionOpener,
	connStore instanceConnectionSampleAppender,
	storageStore instanceStorageSampleAppender,
	cacheStore instanceCacheSampleAppender,
	source *InstanceTargetSource,
) *InstanceMetricsJob {
	return &InstanceMetricsJob{
		config:       cfg,
		sessions:     sessions,
		connStore:    connStore,
		storageStore: storageStore,
		cacheStore:   cacheStore,
		listTargets:  source.ListTargets,
	}
}

// Config implements Job.
func (j *InstanceMetricsJob) Config() Config { return j.config }

// ListTargets implements [Job]; one target per managed instance.
func (j *InstanceMetricsJob) ListTargets(ctx context.Context) ([]string, error) {
	return j.listTargets(ctx)
}

// Run samples connection / storage / cache metrics for the target instance.
// Individual sample failures degrade gracefully — they're logged and skipped
// so a single permission denial doesn't abort the other metric categories.
func (j *InstanceMetricsJob) Run(ctx context.Context, target string) (RunResult, error) {
	instanceName, err := resource.ParseInstanceName(target)
	if err != nil {
		return RunResult{}, fmt.Errorf("parse instance target: %w", err)
	}

	session, err := j.sessions.OpenInstance(ctx, instanceName)
	if err != nil {
		// Connectivity is owned by InstanceConnectivityJob — record nothing and exit
		// gracefully so this isn't reported as an infrastructure failure.
		slog.DebugContext(ctx, "instance metrics: session open failed",
			slog.String("instance", instanceName.InstanceID),
			slog.String("error", err.Error()))

		return RunResult{}, nil
	}
	defer session.Close()

	overview, err := session.GetInstanceOverview(ctx)
	if err != nil {
		// Engine layer already swallows per-subsystem errors and returns nil
		// pointers, so a hard error here means the request itself failed.
		// That's not a runner-infrastructure failure either — log and exit.
		slog.WarnContext(ctx, "instance metrics: overview query failed",
			slog.String("instance", instanceName.InstanceID),
			slog.String("error", err.Error()))

		return RunResult{}, nil
	}

	id := instanceName.InstanceID
	observedAt := time.Now()
	commits := make([]Commit, 0, 3)

	if c := overview.Connections; c != nil {
		sample := storage.InstanceConnectionSample{
			InstanceID: id,
			ObservedAt: observedAt,
			Active:     int64(c.Active),
			Idle:       int64(c.Idle),
			Total:      int64(c.Total),
			MaxConn:    int64(c.Max),
		}

		commits = append(commits, func(ctx context.Context, exec storage.QueryExecutor) error {
			return j.connStore.InsertTx(ctx, exec, sample)
		})
	}

	if s := overview.Storage; s != nil {
		sample := storage.InstanceStorageSample{
			InstanceID:     id,
			ObservedAt:     observedAt,
			TotalSizeBytes: s.TotalSizeBytes,
		}

		commits = append(commits, func(ctx context.Context, exec storage.QueryExecutor) error {
			return j.storageStore.InsertTx(ctx, exec, sample)
		})
	}

	if c := overview.Cache; c != nil {
		sample := storage.InstanceCacheSample{
			InstanceID: id,
			ObservedAt: observedAt,
			BlocksHit:  c.BlocksHit,
			BlocksRead: c.BlocksRead,
		}

		commits = append(commits, func(ctx context.Context, exec storage.QueryExecutor) error {
			return j.cacheStore.InsertTx(ctx, exec, sample)
		})
	}

	if len(commits) == 0 {
		return RunResult{}, nil
	}

	return RunResult{Commit: func(ctx context.Context, exec storage.QueryExecutor) error {
		for _, commit := range commits {
			if err := commit(ctx, exec); err != nil {
				return err
			}
		}

		return nil
	}}, nil
}
