package server

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/rs/xid"

	"github.com/querylane/querylane/backend/catalogcache"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/livequery"
	"github.com/querylane/querylane/backend/postgreserrors"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/runner/jobs"
	instancesvc "github.com/querylane/querylane/backend/service/instance"
	metricsvc "github.com/querylane/querylane/backend/service/metrics"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
)

// probeJobConfig derives a probe's scheduling config from its cadence. Slow
// probes get a longer lease: their collection may spend a first-touch pool
// dial plus a long statement timeout before the meta-DB commit, and the lease
// deadline covers both.
func probeJobConfig(name string, interval time.Duration) runner.Config {
	leaseDuration := 30 * time.Second
	if interval >= 5*time.Minute {
		leaseDuration = 2 * time.Minute
	}

	return runner.Config{
		Name:          name,
		Interval:      interval,
		LeaseDuration: leaseDuration,
		Concurrency:   4,
	}
}

var (
	connectivityJobConfig = runner.Config{
		Name:          jobs.InstanceConnectivityJobName,
		Interval:      10 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   4,
	}

	// Probe cadences follow what mature collectors converged on: fast-moving
	// activity every 30s, cumulative counters every 60s, expensive size and
	// per-table aggregation walks every 5 minutes.
	connectionsProbeConfig = probeJobConfig(jobs.ConnectionsProbeName, 30*time.Second)
	cacheProbeConfig       = probeJobConfig(jobs.CacheProbeName, time.Minute)
	storageProbeConfig     = probeJobConfig(jobs.StorageProbeName, 5*time.Minute)
	ioProbeConfig          = probeJobConfig(jobs.IOProbeName, time.Minute)
	vacuumProbeConfig      = probeJobConfig(jobs.VacuumProbeName, 5*time.Minute)

	sampleRetentionJobConfig = runner.Config{
		Name:          jobs.SampleRetentionJobName,
		Interval:      time.Hour,
		LeaseDuration: 5 * time.Minute,
		Concurrency:   1,
	}

	// sampleRetentionAge is the maximum age of rows kept in the sample
	// tables. Conservative default; not yet configurable.
	sampleRetentionAge = 30 * 24 * time.Hour

	// staleLeaseRetentionAge is how long a departed target's
	// runner_execution_state row survives after its last run. Deliberately a
	// separate knob from sampleRetentionAge: it must always comfortably
	// exceed every job's run interval, no matter how short sample retention
	// is ever configured.
	staleLeaseRetentionAge = 30 * 24 * time.Hour
)

type dbState struct {
	postgresCl             *sql.DB
	instanceRepo           storage.InstanceRepository
	instanceReader         storage.InstanceReader
	instanceRuntimeStore   *storage.PGInstanceRuntimeStateStore
	connectionRecorder     *storage.PGInstanceConnectionRecorder
	connManager            *engine.SessionResolver
	liveQueryLimiter       *livequery.Limiter
	connectionTestGuard    *instancesvc.ConnectionTestGuard
	catalog                *catalogcache.Catalog
	runnerExecutionStore   *storage.PGRunnerExecutionStore
	replicaStore           *storage.PGReplicaStore
	catalogSyncStore       *catalog.PGSyncStore
	tokenCodec             *engine.TokenCodec
	configManagedInstances bool
	metaDBGate             *metaDBGate
	runnerManager          *runner.Manager
	heartbeater            *runner.Heartbeater
	sampleStores           metricsvc.Stores
}

func databaseSetupErrorEvent(step dbsetup.StepID, err error) dbsetup.ProgressEvent {
	return dbsetup.NewErrorEvent(step, postgreserrors.RedactedMessage(err, string(step)))
}

func (d *dbState) close() {
	if d == nil {
		return
	}

	if d.heartbeater != nil {
		d.heartbeater.Close()
	}

	if d.runnerManager != nil {
		d.runnerManager.Close()
	}

	if d.connManager != nil {
		_ = d.connManager.Close()
	}

	if d.postgresCl != nil {
		_ = d.postgresCl.Close()
	}
}

// buildDatabase creates a new dbState from the given config. On failure all
// partially-created resources are closed before returning the error.
// If bc is non-nil, progress events are reported at each step.
func buildDatabase(ctx context.Context, cfg *serverconfig.Config, bc *dbsetup.Broadcaster) (*dbState, error) {
	report := func(e dbsetup.ProgressEvent) {
		if bc != nil {
			bc.Send(e)
		}
	}

	report(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateInProgress))

	limits := cfg.Limits
	if limits == (serverconfig.Limits{}) {
		limits.SetDefaults()
	}

	liveQueryLimiter, err := livequery.NewLimiter(
		limits.LiveQueries.Global,
		limits.LiveQueries.PerInstance,
	)
	if err != nil {
		return nil, fmt.Errorf("configure live query limiter: %w", err)
	}

	targetPolicy, err := engine.NewTargetPolicy(
		cfg.InstanceTargets.AllowedCIDRs,
		cfg.InstanceTargets.DeniedCIDRs,
	)
	if err != nil {
		return nil, fmt.Errorf("configure instance target policy: %w", err)
	}

	connectionTestGuard, err := instancesvc.NewConnectionTestGuard(
		limits.ConnectionTests.PerCallerPerMinute,
		limits.ConnectionTests.Burst,
		targetPolicy.HasExplicitAllowlist(),
	)
	if err != nil {
		return nil, fmt.Errorf("configure connection test guard: %w", err)
	}

	cl, err := storage.NewPostgresDB(ctx, cfg)
	if err != nil {
		report(databaseSetupErrorEvent(dbsetup.StepConnecting, err))
		return nil, err
	}

	report(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateSucceeded))

	report(dbsetup.NewEvent(dbsetup.StepMigrating, dbsetup.StateInProgress))

	if _, err := storage.MigrateDB(ctx, cl); err != nil {
		report(databaseSetupErrorEvent(dbsetup.StepMigrating, err))

		_ = cl.Close()

		return nil, fmt.Errorf("failed to apply database migrations: %w", err)
	}

	report(dbsetup.NewEvent(dbsetup.StepMigrating, dbsetup.StateSucceeded))

	report(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateInProgress))

	configManaged := len(cfg.Instances) > 0

	var instanceRepo storage.InstanceRepository
	if configManaged {
		instanceRepo = storage.NewConfigInstanceRepository(cfg.Instances)
	} else {
		pgInstanceRepo, err := storage.NewInstanceRepository(ctx, cl)
		if err != nil {
			report(databaseSetupErrorEvent(dbsetup.StepInitializingServices, err))

			_ = cl.Close()

			return nil, fmt.Errorf("failed to initialize instance repository: %w", err)
		}

		instanceRepo = pgInstanceRepo
	}

	connConfig := poolConfigFromLimits(limits.PostgresPool)

	tokenSigningKey, err := storage.LoadOrCreateTokenSigningKey(ctx, cl)
	if err != nil {
		report(databaseSetupErrorEvent(dbsetup.StepInitializingServices, err))

		_ = cl.Close()

		return nil, fmt.Errorf("failed to initialize token signing key: %w", err)
	}

	tokenCodec := engine.NewTokenCodec(tokenSigningKey)

	engineImpl := postgres.New(tokenCodec)
	poolManager := engine.NewManager(connConfig, engineImpl, targetPolicy)
	connManager := engine.NewSessionResolver(instanceRepo, poolManager)
	instanceRuntimeStore := storage.NewInstanceRuntimeStateStore(cl)
	connectionRecorder := storage.NewInstanceConnectionRecorder(cl)
	runnerExecutionStore := storage.NewRunnerExecutionStore(cl)
	connectionSampleStore := storage.NewInstanceConnectionSampleStore(cl)
	storageSampleStore := storage.NewInstanceStorageSampleStore(cl)
	cacheSampleStore := storage.NewInstanceCacheSampleStore(cl)
	ioSampleStore := storage.NewInstanceIOSampleStore(cl)
	databaseSizeSampleStore := storage.NewDatabaseSizeSampleStore(cl)
	databaseVacuumSampleStore := storage.NewDatabaseVacuumSampleStore(cl)
	instanceReader := storage.NewOverlayInstanceReader(instanceRepo, instanceRuntimeStore)

	// The runner and the RPC services share one catalog cache so database
	// targets exist even on deployments where no user browses the catalog:
	// the read-through sync populates it from live instances on demand.
	catalogCfg := catalogcache.DefaultConfig()
	catalogSyncStore := catalog.NewSyncStore(cl, catalogCfg.SyncLockTimeout)
	catalogCache := catalogcache.New(catalogCfg, catalog.New(cl), catalogSyncStore, connManager)

	instanceTargetSource := jobs.NewInstanceTargetSource(instanceRepo)
	databaseTargetSource := jobs.NewDatabaseTargetSource(instanceTargetSource, catalogCache)
	backgroundJobs := []runner.Job{
		jobs.NewInstanceConnectivity(connectivityJobConfig, connManager, connectionRecorder, instanceTargetSource),
		jobs.NewConnectionsProbe(connectionsProbeConfig, connManager, connectionSampleStore, instanceTargetSource),
		jobs.NewCacheProbe(cacheProbeConfig, connManager, cacheSampleStore, instanceTargetSource),
		jobs.NewStorageProbe(storageProbeConfig, connManager, storageSampleStore, databaseSizeSampleStore, instanceTargetSource),
		jobs.NewIOProbe(ioProbeConfig, connManager, ioSampleStore, instanceTargetSource),
		jobs.NewVacuumProbe(vacuumProbeConfig, connManager, databaseVacuumSampleStore, databaseTargetSource),
		jobs.NewSampleRetention(sampleRetentionJobConfig, cl, sampleRetentionAge, staleLeaseRetentionAge),
	}

	leaseOwner := xid.New().String()
	runnerManager := runner.NewManager(leaseOwner, cl, runnerExecutionStore)
	slog.InfoContext(ctx, "runner manager started",
		slog.String("lease_owner", leaseOwner),
		slog.Int("jobs", len(backgroundJobs)))
	// ctx may be a streaming-RPC ctx (onboarding wizard); detach so runners
	// outlive the stream. Shutdown goes through dbState.close().
	runnerManager.Start(context.WithoutCancel(ctx), backgroundJobs...)

	// Every replica heartbeats (not lease-gated), so the replica registry
	// lists the whole fleet — including replicas holding zero leases.
	replicaStore := storage.NewReplicaStore(cl)
	heartbeater := runner.NewHeartbeater(leaseOwner, replicaStore, storage.ReplicaHeartbeatInterval, storage.ReplicaPruneAge)
	heartbeater.Start(context.WithoutCancel(ctx))

	report(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))

	return &dbState{
		postgresCl:             cl,
		instanceRepo:           instanceRepo,
		instanceReader:         instanceReader,
		instanceRuntimeStore:   instanceRuntimeStore,
		connectionRecorder:     connectionRecorder,
		connManager:            connManager,
		liveQueryLimiter:       liveQueryLimiter,
		connectionTestGuard:    connectionTestGuard,
		catalog:                catalogCache,
		runnerExecutionStore:   runnerExecutionStore,
		replicaStore:           replicaStore,
		catalogSyncStore:       catalogSyncStore,
		tokenCodec:             tokenCodec,
		configManagedInstances: configManaged,
		metaDBGate:             newMetaDBGate(cl),
		runnerManager:          runnerManager,
		heartbeater:            heartbeater,
		sampleStores: metricsvc.Stores{
			Connection:     connectionSampleStore,
			Cache:          cacheSampleStore,
			IO:             ioSampleStore,
			Storage:        storageSampleStore,
			DatabaseSize:   databaseSizeSampleStore,
			DatabaseVacuum: databaseVacuumSampleStore,
		},
	}, nil
}

func poolConfigFromLimits(limits serverconfig.PostgresPoolLimits) engine.PoolConfig {
	return engine.PoolConfig{
		MaxOpenConns:    limits.MaxOpenConnections,
		MaxIdleConns:    limits.MaxIdleConnections,
		IdleTimeout:     limits.IdleTimeout,
		ConnMaxLifetime: limits.ConnectionMaxLifetime,
	}
}
