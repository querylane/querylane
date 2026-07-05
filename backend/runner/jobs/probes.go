package jobs

import (
	"context"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// Stable lease-key names for the built-in probes. These must not change
// across restarts; they identify rows in runner_execution_state.
const (
	ConnectionsProbeName = "probe_connections"
	CacheProbeName       = "probe_cache"
	StorageProbeName     = "probe_storage"
	IOProbeName          = "probe_io"
	VacuumProbeName      = "probe_vacuum"
)

// pgStatIOMinVersion is the first server_version_num shipping pg_stat_io.
const pgStatIOMinVersion = 160000

// InstanceSessionOpener opens a session against a managed instance.
// Implemented by *engine.SessionResolver.
type InstanceSessionOpener interface {
	OpenInstance(ctx context.Context, instanceName resource.InstanceName) (engine.InstanceSession, error)
}

// sampleAppender appends one sample row inside the caller's transaction.
// Implemented by the storage.PG*SampleStore types.
type sampleAppender[M any] interface {
	InsertTx(ctx context.Context, exec storage.QueryExecutor, sample M) error
}

// databaseSizeSampleAppender appends one cycle of per-database size samples.
// Implemented by *storage.PGDatabaseSizeSampleStore.
type databaseSizeSampleAppender interface {
	InsertManyTx(ctx context.Context, exec storage.QueryExecutor, samples []model.DatabaseSizeSample) error
}

// insertCommit returns the Commit that appends sample via store.
func insertCommit[M any](store sampleAppender[M], sample M) runner.Commit {
	return func(ctx context.Context, exec storage.QueryExecutor) error {
		return store.InsertTx(ctx, exec, sample)
	}
}

// NewConnectionsProbe samples pg_stat_activity connection utilization for
// each instance.
func NewConnectionsProbe(cfg runner.Config, sessions InstanceSessionOpener, store sampleAppender[model.InstanceConnectionSample], source *InstanceTargetSource) runner.Job {
	probe := InstanceProbe{
		Config: cfg,
		Collect: func(ctx context.Context, prober engine.InstanceProber, instanceID string, observedAt time.Time) (runner.Commit, error) {
			metrics, err := prober.GetConnectionMetrics(ctx)
			if err != nil {
				return nil, err
			}

			return insertCommit(store, model.InstanceConnectionSample{
				InstanceID: instanceID,
				ObservedAt: observedAt,
				Active:     int64(metrics.Active),
				Idle:       int64(metrics.Idle),
				Total:      int64(metrics.Total),
				MaxConn:    int64(metrics.Max),
			}), nil
		},
	}

	return NewInstanceProbeJob(probe, sessions, source)
}

// NewCacheProbe samples cumulative buffer-cache counters for each
// instance.
func NewCacheProbe(cfg runner.Config, sessions InstanceSessionOpener, store sampleAppender[model.InstanceCacheSample], source *InstanceTargetSource) runner.Job {
	probe := InstanceProbe{
		Config: cfg,
		Collect: func(ctx context.Context, prober engine.InstanceProber, instanceID string, observedAt time.Time) (runner.Commit, error) {
			counters, err := prober.GetCacheCounters(ctx)
			if err != nil {
				return nil, err
			}

			return insertCommit(store, model.InstanceCacheSample{
				InstanceID:        instanceID,
				ObservedAt:        observedAt,
				BlocksHit:         counters.BlocksHit,
				BlocksRead:        counters.BlocksRead,
				StatsReset:        counters.StatsReset,
				XactCommit:        counters.XactCommit,
				XactRollback:      counters.XactRollback,
				TupReturned:       counters.TupReturned,
				TupFetched:        counters.TupFetched,
				TupInserted:       counters.TupInserted,
				TupUpdated:        counters.TupUpdated,
				TupDeleted:        counters.TupDeleted,
				Conflicts:         counters.Conflicts,
				Deadlocks:         counters.Deadlocks,
				TempFiles:         counters.TempFiles,
				TempBytes:         counters.TempBytes,
				Sessions:          counters.Sessions,
				SessionsAbandoned: counters.SessionsAbandoned,
				SessionsFatal:     counters.SessionsFatal,
				SessionsKilled:    counters.SessionsKilled,
			}), nil
		},
	}

	return NewInstanceProbeJob(probe, sessions, source)
}

// NewStorageProbe samples every database's on-disk size in one pass,
// recording the per-database sizes plus the instance total they sum to.
func NewStorageProbe(cfg runner.Config, sessions InstanceSessionOpener, instanceStore sampleAppender[model.InstanceStorageSample], databaseStore databaseSizeSampleAppender, source *InstanceTargetSource) runner.Job {
	probe := InstanceProbe{
		Config: cfg,
		Collect: func(ctx context.Context, prober engine.InstanceProber, instanceID string, observedAt time.Time) (runner.Commit, error) {
			sizes, err := prober.ListDatabaseSizes(ctx)
			if err != nil {
				return nil, err
			}

			var totalSizeBytes int64

			databaseSamples := make([]model.DatabaseSizeSample, len(sizes))
			for i, size := range sizes {
				totalSizeBytes += size.SizeBytes
				databaseSamples[i] = model.DatabaseSizeSample{
					InstanceID:   instanceID,
					DatabaseName: size.DatabaseName,
					ObservedAt:   observedAt,
					SizeBytes:    size.SizeBytes,
				}
			}

			instanceSample := model.InstanceStorageSample{
				InstanceID:     instanceID,
				ObservedAt:     observedAt,
				TotalSizeBytes: totalSizeBytes,
			}

			return func(ctx context.Context, exec storage.QueryExecutor) error {
				if err := instanceStore.InsertTx(ctx, exec, instanceSample); err != nil {
					return err
				}

				return databaseStore.InsertManyTx(ctx, exec, databaseSamples)
			}, nil
		},
	}

	return NewInstanceProbeJob(probe, sessions, source)
}

// NewIOProbe samples cumulative pg_stat_io totals for each instance
// running PostgreSQL 16 or newer.
func NewIOProbe(cfg runner.Config, sessions InstanceSessionOpener, store sampleAppender[model.InstanceIoSample], source *InstanceTargetSource) runner.Job {
	probe := InstanceProbe{
		Config:     cfg,
		MinVersion: pgStatIOMinVersion,
		Collect: func(ctx context.Context, prober engine.InstanceProber, instanceID string, observedAt time.Time) (runner.Commit, error) {
			counters, err := prober.GetIOCounters(ctx)
			if err != nil {
				return nil, err
			}

			return insertCommit(store, model.InstanceIoSample{
				InstanceID:  instanceID,
				ObservedAt:  observedAt,
				Reads:       counters.Reads,
				ReadBytes:   counters.ReadBytes,
				Writes:      counters.Writes,
				WriteBytes:  counters.WriteBytes,
				Extends:     counters.Extends,
				ExtendBytes: counters.ExtendBytes,
				Fsyncs:      counters.Fsyncs,
				StatsReset:  counters.StatsReset,
			}), nil
		},
	}

	return NewInstanceProbeJob(probe, sessions, source)
}

// NewVacuumProbe samples vacuum activity aggregated over each database's
// user tables.
func NewVacuumProbe(cfg runner.Config, sessions InstanceSessionOpener, store sampleAppender[model.DatabaseVacuumSample], source *DatabaseTargetSource) runner.Job {
	probe := DatabaseProbe{
		Config: cfg,
		Collect: func(ctx context.Context, prober engine.DatabaseProber, dbName resource.DatabaseName, observedAt time.Time) (runner.Commit, error) {
			counters, err := prober.GetVacuumCounters(ctx)
			if err != nil {
				return nil, err
			}

			return insertCommit(store, model.DatabaseVacuumSample{
				InstanceID:      dbName.InstanceID,
				DatabaseName:    dbName.DatabaseID,
				ObservedAt:      observedAt,
				LiveTuples:      counters.LiveTuples,
				DeadTuples:      counters.DeadTuples,
				VacuumCount:     counters.VacuumCount,
				AutovacuumCount: counters.AutovacuumCount,
				StatsReset:      counters.StatsReset,
			}), nil
		},
	}

	return NewDatabaseProbeJob(probe, sessions, source)
}
