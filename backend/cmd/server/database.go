package server

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/rs/xid"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
)

var (
	connectivityJobConfig = runner.Config{
		Name:          runner.InstanceConnectivityJobName,
		Interval:      10 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   4,
	}

	instanceMetricsJobConfig = runner.Config{
		Name:          runner.InstanceMetricsJobName,
		Interval:      30 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   4,
	}

	sampleRetentionJobConfig = runner.Config{
		Name:          runner.SampleRetentionJobName,
		Interval:      time.Hour,
		LeaseDuration: 5 * time.Minute,
		Concurrency:   1,
	}

	// sampleRetentionAge is the maximum age of rows kept in instance_*_sample
	// tables. Conservative default; not yet configurable.
	sampleRetentionAge = 30 * 24 * time.Hour
)

type dbState struct {
	postgresCl             *sql.DB
	instanceRepo           storage.InstanceRepository
	instanceReader         storage.InstanceReader
	instanceRuntimeStore   *storage.PGInstanceRuntimeStateStore
	connectionRecorder     *storage.PGInstanceConnectionRecorder
	connManager            *engine.SessionResolver
	tokenCodec             *engine.TokenCodec
	configManagedInstances bool
	metaDBGate             *metaDBGate
	runnerManager          *runner.Manager
}

func (d *dbState) close() {
	if d == nil {
		return
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

	cl, err := storage.NewPostgresDB(ctx, cfg)
	if err != nil {
		report(dbsetup.NewErrorEvent(dbsetup.StepConnecting, err.Error()))
		return nil, err
	}

	report(dbsetup.NewEvent(dbsetup.StepConnecting, dbsetup.StateSucceeded))

	report(dbsetup.NewEvent(dbsetup.StepMigrating, dbsetup.StateInProgress))

	if _, err := storage.MigrateDB(ctx, cl); err != nil {
		report(dbsetup.NewErrorEvent(dbsetup.StepMigrating, err.Error()))

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
		pgInstanceRepo, err := storage.NewInstanceRepository(cl)
		if err != nil {
			report(dbsetup.NewErrorEvent(dbsetup.StepInitializingServices, err.Error()))

			_ = cl.Close()

			return nil, fmt.Errorf("failed to initialize instance repository: %w", err)
		}

		instanceRepo = pgInstanceRepo
	}

	connConfig := engine.DefaultPoolConfig()

	tokenCodec, err := engine.NewRandomTokenCodec()
	if err != nil {
		report(dbsetup.NewErrorEvent(dbsetup.StepInitializingServices, err.Error()))

		_ = cl.Close()

		return nil, fmt.Errorf("failed to initialize token codec: %w", err)
	}

	engineImpl := postgres.New(tokenCodec)
	poolManager := engine.NewManager(connConfig, engineImpl)
	connManager := engine.NewSessionResolver(instanceRepo, poolManager)
	instanceRuntimeStore := storage.NewInstanceRuntimeStateStore(cl)
	connectionRecorder := storage.NewInstanceConnectionRecorder(cl)
	runnerExecutionStore := storage.NewRunnerExecutionStore(cl)
	connectionSampleStore := storage.NewInstanceConnectionSampleStore(cl)
	storageSampleStore := storage.NewInstanceStorageSampleStore(cl)
	cacheSampleStore := storage.NewInstanceCacheSampleStore(cl)
	instanceReader := storage.NewOverlayInstanceReader(instanceRepo, instanceRuntimeStore)

	instanceTargetSource := runner.NewInstanceTargetSource(instanceRepo)
	connectivityJob := runner.NewInstanceConnectivityJob(connectivityJobConfig, connManager, connectionRecorder, instanceTargetSource)
	metricsJob := runner.NewInstanceMetricsJob(instanceMetricsJobConfig, connManager, connectionSampleStore, storageSampleStore, cacheSampleStore, instanceTargetSource)
	retentionJob := runner.NewSampleRetentionJob(sampleRetentionJobConfig, sampleRetentionAge)

	leaseOwner := xid.New().String()
	runnerManager := runner.NewManager(leaseOwner, cl, runnerExecutionStore)
	slog.InfoContext(ctx, "runner manager started",
		slog.String("lease_owner", leaseOwner),
		slog.Int("jobs", 3))
	// ctx may be a streaming-RPC ctx (onboarding wizard); detach so runners
	// outlive the stream. Shutdown goes through dbState.close().
	runnerManager.Start(context.WithoutCancel(ctx), connectivityJob, metricsJob, retentionJob)

	report(dbsetup.NewEvent(dbsetup.StepInitializingServices, dbsetup.StateSucceeded))

	return &dbState{
		postgresCl:             cl,
		instanceRepo:           instanceRepo,
		instanceReader:         instanceReader,
		instanceRuntimeStore:   instanceRuntimeStore,
		connectionRecorder:     connectionRecorder,
		connManager:            connManager,
		tokenCodec:             tokenCodec,
		configManagedInstances: configManaged,
		metaDBGate:             newMetaDBGate(cl),
		runnerManager:          runnerManager,
	}, nil
}
