package server

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"connectrpc.com/validate"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/embeddedpg"
	"github.com/querylane/querylane/backend/frontend"
	"github.com/querylane/querylane/backend/interceptor"
	"github.com/querylane/querylane/backend/middleware"
	v1alpha1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/service/console"
	"github.com/querylane/querylane/backend/service/database"
	"github.com/querylane/querylane/backend/service/extension"
	"github.com/querylane/querylane/backend/service/instance"
	metricsvc "github.com/querylane/querylane/backend/service/metrics"
	"github.com/querylane/querylane/backend/service/onboarding"
	"github.com/querylane/querylane/backend/service/role"
	runnersvc "github.com/querylane/querylane/backend/service/runner"
	"github.com/querylane/querylane/backend/service/schema"
	"github.com/querylane/querylane/backend/service/sqlsvc"
	"github.com/querylane/querylane/backend/service/table"
	"github.com/querylane/querylane/backend/service/tabledata"
	"github.com/querylane/querylane/backend/service/view"
	"github.com/querylane/querylane/backend/service/workflow"
)

// App is the single application — it implements onboarding.DatabaseInitializer
// and serves the full RPC surface in whatever lifecycle stage it is currently
// in. Three observable stages, all driven by (config presence, state presence):
//
//   - bootstrap (no config, no state): OnboardingService is live; every other
//     service returns "database not configured" so the frontend shows the wizard.
//   - degraded (config exists, no state): OnboardingService reports already-set-up;
//     DB-dependent services return Unavailable while the retry loop runs.
//   - ready (state present): all services live, behind a metaDB ping gate.
//
// Routes() reads the current stage from configManager + state on each call,
// so transitioning between stages is just "set state → ask App for new Routes
// → swap into DelegatingHandler".
type App struct {
	configManager         *config.Manager[*serverconfig.Config]
	validationInterceptor *validate.Interceptor
	embeddedManager       *embeddedpg.Manager
	progressBroadcaster   *dbsetup.Broadcaster

	dbInitMu  sync.Mutex
	state     atomic.Pointer[dbState]
	dbInitErr atomic.Pointer[string]

	// onReady, when set, is invoked after a successful state transition so the
	// caller (the Controller) can rebuild routes and atomically swap them in.
	onReady func(ctx context.Context, state *dbState)

	buildDatabaseFunc func(ctx context.Context, cfg *serverconfig.Config, bc *dbsetup.Broadcaster) (*dbState, error)
}

// NewApp creates a new app. validationInterceptor must be non-nil.
func NewApp(
	cfgMgr *config.Manager[*serverconfig.Config],
	validationInterceptor *validate.Interceptor,
	embeddedMgr *embeddedpg.Manager,
	broadcaster *dbsetup.Broadcaster,
	onReady func(ctx context.Context, state *dbState),
) *App {
	return &App{
		configManager:         cfgMgr,
		validationInterceptor: validationInterceptor,
		embeddedManager:       embeddedMgr,
		progressBroadcaster:   broadcaster,
		onReady:               onReady,
	}
}

// Close releases any resources owned by the current state.
func (a *App) Close() {
	if state := a.state.Load(); state != nil {
		state.close()
	}
}

// onboarding.DatabaseInitializer

// InitializeDatabaseWithConfig builds the database from the given config and
// installs it as the App's state. Idempotent: if state already exists (e.g.
// the YAML watcher fired after the wizard already completed), the freshly
// built state is closed and nil is returned.
func (a *App) InitializeDatabaseWithConfig(ctx context.Context, cfg *serverconfig.Config) error {
	a.dbInitMu.Lock()
	defer a.dbInitMu.Unlock()

	if a.state.Load() != nil {
		return nil
	}

	state, err := a.buildDatabase(ctx, cfg, a.progressBroadcaster)
	if err != nil {
		errMsg := err.Error()
		a.dbInitErr.Store(&errMsg)

		return err
	}

	if a.state.Load() != nil {
		state.close()

		return nil
	}

	a.setState(state)
	a.dbInitErr.Store(nil)

	if a.onReady != nil {
		a.onReady(ctx, state)
	}

	slog.InfoContext(ctx, "database initialization succeeded")

	return nil
}

// IsDatabaseInitialized reports whether the application has an available meta
// database. True once state has been installed; otherwise true when a config
// exists on disk and no initialization error is currently known. Boot and retry
// failures store dbInitErr so onboarding reports an error instead of claiming
// READY while DB-backed services are still mounted as unavailable stubs.
func (a *App) IsDatabaseInitialized() bool {
	if a.state.Load() != nil {
		return true
	}

	if a.dbInitErr.Load() != nil {
		return false
	}

	cfg := a.configManager.CurrentConfig()

	return cfg.Database != nil || cfg.Embedded != nil
}

// DatabaseInitError returns the error message from the last failed init
// attempt, or "" if none. Lock-free so it can be polled by onboarding while
// SetupAppDatabase is in progress.
func (a *App) DatabaseInitError() string {
	if errMsg := a.dbInitErr.Load(); errMsg != nil {
		return *errMsg
	}

	return ""
}

// ProgressBroadcaster returns the broadcaster that buildDatabase reports to.
func (a *App) ProgressBroadcaster() *dbsetup.Broadcaster {
	return a.progressBroadcaster
}

// Routes builds the HTTP handler tree for the current stage. Re-call after
// each state transition to obtain a fresh handler — the previous handler
// remains valid until it's swapped out (the DelegatingHandler does the swap).
func (a *App) Routes(ctx context.Context) http.Handler {
	cfg := a.configManager.CurrentConfig()
	state := a.state.Load()
	hasConfig := cfg.Database != nil || cfg.Embedded != nil

	mux := http.NewServeMux()

	reflector := grpcreflect.NewStaticReflector(
		v1alpha1connect.OnboardingServiceName,
		v1alpha1connect.ConsoleServiceName,
		v1alpha1connect.InstanceServiceName,
		v1alpha1connect.DatabaseServiceName,
		v1alpha1connect.RoleServiceName,
		v1alpha1connect.SchemaServiceName,
		v1alpha1connect.ExtensionServiceName,
		v1alpha1connect.WorkflowServiceName,
		v1alpha1connect.TableServiceName,
		v1alpha1connect.ViewServiceName,
		v1alpha1connect.TableDataServiceName,
		v1alpha1connect.SQLServiceName,
	)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	var accessLogger *interceptor.AccessLogger
	if cfg.HTTP.AccessLogEnabled() {
		accessLogger = interceptor.NewAccessLoggerInterceptor(slog.With())
	}

	commonOpts := handlerOptions(withOptionalAccessLog(accessLogger, a.validationInterceptor)...)

	// OnboardingService is live in every stage; it is how the wizard reaches
	// IsDatabaseInitialized/SetupAppDatabase on this App.
	mux.Handle(v1alpha1connect.NewOnboardingServiceHandler(onboarding.NewService(a.configManager, a, a.embeddedManager), commonOpts...))

	// DB-dependent services: real handlers when state exists, stubs otherwise.
	// ConsoleService is special — once config exists it is live (the service
	// itself handles a nil meta DB internally), but in the no-config stage it
	// must still return CodeFailedPrecondition so the frontend shows the
	// setup wizard.
	switch {
	case state != nil:
		mux.Handle(v1alpha1connect.NewConsoleServiceHandler(a.newConsoleService(ctx, state), commonOpts...))
		a.mountDBServices(mux, state, accessLogger)
	case hasConfig:
		mux.Handle(v1alpha1connect.NewConsoleServiceHandler(a.newConsoleService(ctx, nil), commonOpts...))
		a.mountStubs(mux, accessLogger, dbUnavailableInterceptor())
	default:
		stubOpts := handlerOptions(withOptionalAccessLog(accessLogger, dbNotConfiguredInterceptor())...)
		mux.Handle(v1alpha1connect.NewConsoleServiceHandler(&v1alpha1connect.UnimplementedConsoleServiceHandler{}, stubOpts...))
		a.mountStubs(mux, accessLogger, dbNotConfiguredInterceptor())
	}

	// Serve embedded frontend assets with SPA fallback when compiled in.
	if frontend.DistFS != nil {
		mux.Handle("/", middleware.NewSPA(frontend.DistFS))
	}

	return middleware.Chain(mux, middleware.NewCORS(*cfg))
}

func (a *App) newConsoleService(ctx context.Context, state *dbState) *console.Service {
	var (
		db                     *sql.DB
		configManagedInstances bool
	)

	if state != nil {
		db = state.postgresCl
		configManagedInstances = state.configManagedInstances
	}

	return console.NewService(
		ctx,
		db,
		configManagedInstances,
		a.configManager.ConfigFilePath(),
	)
}

// mountDBServices wires the real DB-backed services. The metaDB availability
// interceptor short-circuits with Unavailable if the meta DB ping fails so an
// outage surfaces before each handler runs its own queries.
func (a *App) mountDBServices(mux *http.ServeMux, state *dbState, accessLogger *interceptor.AccessLogger) {
	opts := handlerOptions(
		withOptionalAccessLog(
			accessLogger,
			a.validationInterceptor,
			newMetaDBAvailabilityInterceptor(state.metaDBGate),
		)...,
	)

	// The catalog cache is shared with the background runner (see
	// buildDatabase) so probes and RPCs work from one synced view.
	cat := state.catalog

	overviewProvider := instance.NewOverviewProvider(state.connManager)
	instanceSvc := instance.NewService(state.instanceReader, state.instanceRepo, state.connectionRecorder, state.connManager, cat, overviewProvider, state.configManagedInstances)

	mux.Handle(v1alpha1connect.NewInstanceServiceHandler(instanceSvc, opts...))
	mux.Handle(v1alpha1connect.NewDatabaseServiceHandler(database.NewService(cat, database.NewQueryInsightsProvider(state.connManager)), opts...))
	mux.Handle(v1alpha1connect.NewRoleServiceHandler(role.NewService(state.connManager), opts...))
	mux.Handle(v1alpha1connect.NewRunnerServiceHandler(runnersvc.NewService(state.runnerExecutionStore), opts...))
	mux.Handle(v1alpha1connect.NewMetricsServiceHandler(metricsvc.NewService(state.sampleStores, state.instanceReader), opts...))
	mux.Handle(v1alpha1connect.NewSchemaServiceHandler(schema.NewService(cat), opts...))
	mux.Handle(v1alpha1connect.NewExtensionServiceHandler(extension.NewService(state.connManager), opts...))
	mux.Handle(v1alpha1connect.NewWorkflowServiceHandler(workflow.NewService(state.connManager), opts...))
	mux.Handle(v1alpha1connect.NewTableServiceHandler(table.NewService(cat), opts...))
	mux.Handle(v1alpha1connect.NewViewServiceHandler(view.NewService(cat), opts...))
	mux.Handle(v1alpha1connect.NewTableDataServiceHandler(tabledata.NewService(cat, state.connManager, state.tokenCodec), opts...))
	mux.Handle(v1alpha1connect.NewSQLServiceHandler(sqlsvc.NewService(state.connManager), opts...))
}

// mountStubs wires Unimplemented handlers for all DB-dependent services. The
// provided gate interceptor decides the error returned (NotConfigured for the
// bootstrap stage, Unavailable for the degraded stage).
func (a *App) mountStubs(mux *http.ServeMux, accessLogger *interceptor.AccessLogger, gate connect.Interceptor) {
	opts := handlerOptions(withOptionalAccessLog(accessLogger, gate)...)

	mux.Handle(v1alpha1connect.NewInstanceServiceHandler(&v1alpha1connect.UnimplementedInstanceServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewDatabaseServiceHandler(&v1alpha1connect.UnimplementedDatabaseServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewRoleServiceHandler(&v1alpha1connect.UnimplementedRoleServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewRunnerServiceHandler(&v1alpha1connect.UnimplementedRunnerServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewMetricsServiceHandler(&v1alpha1connect.UnimplementedMetricsServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewSchemaServiceHandler(&v1alpha1connect.UnimplementedSchemaServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewExtensionServiceHandler(&v1alpha1connect.UnimplementedExtensionServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewWorkflowServiceHandler(&v1alpha1connect.UnimplementedWorkflowServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewTableServiceHandler(&v1alpha1connect.UnimplementedTableServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewViewServiceHandler(&v1alpha1connect.UnimplementedViewServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewTableDataServiceHandler(&v1alpha1connect.UnimplementedTableDataServiceHandler{}, opts...))
	mux.Handle(v1alpha1connect.NewSQLServiceHandler(&v1alpha1connect.UnimplementedSQLServiceHandler{}, opts...))
}

// dbStubInterceptor short-circuits both unary and streaming calls with a fixed
// error. Used for DB-dependent services before the database is initialized.
type dbStubInterceptor struct {
	err error
}

func (i *dbStubInterceptor) WrapUnary(_ connect.UnaryFunc) connect.UnaryFunc {
	return func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		return nil, i.err
	}
}

func (i *dbStubInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *dbStubInterceptor) WrapStreamingHandler(_ connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(_ context.Context, _ connect.StreamingHandlerConn) error {
		return i.err
	}
}

// dbNotConfiguredInterceptor returns a typed "database not configured" error.
// The frontend catches this and shows the setup wizard.
func dbNotConfiguredInterceptor() connect.Interceptor {
	return &dbStubInterceptor{err: apierrors.NewDatabaseRequired()}
}

// dbUnavailableInterceptor returns Unavailable. The frontend shows the main
// app and treats this as a normal transient error.
func dbUnavailableInterceptor() connect.Interceptor {
	return &dbStubInterceptor{
		err: connect.NewError(
			connect.CodeUnavailable,
			errors.New("database is currently unavailable — the server is still initializing"),
		),
	}
}

// rpcCompressMinBytes is the minimum response size (in bytes) eligible for
// gzip compression. Connect-go registers gzip on handlers by default and
// compresses whenever the client advertises it, but its default minimum is 0,
// so even tiny responses pay the CPU cost of compression. Requiring 1 KiB
// avoids that overhead while still compressing the large catalog and table
// payloads that dominate page weight.
const rpcCompressMinBytes = 1024

// handlerOptions builds the shared Connect handler options applied to every
// service: the given interceptors plus the response compression threshold.
// Centralizing this keeps the compression policy consistent across all
// handlers (live, stub, and onboarding).
func handlerOptions(interceptors ...connect.Interceptor) []connect.HandlerOption {
	return []connect.HandlerOption{
		connect.WithInterceptors(interceptors...),
		connect.WithCompressMinBytes(rpcCompressMinBytes),
	}
}

// withOptionalAccessLog prepends the access logger to the given interceptors
// when it is non-nil.
func withOptionalAccessLog(al *interceptor.AccessLogger, rest ...connect.Interceptor) []connect.Interceptor {
	if al == nil {
		return rest
	}

	return append([]connect.Interceptor{al}, rest...)
}

func (a *App) buildDatabase(ctx context.Context, cfg *serverconfig.Config, bc *dbsetup.Broadcaster) (*dbState, error) {
	if a.buildDatabaseFunc != nil {
		return a.buildDatabaseFunc(ctx, cfg, bc)
	}

	return buildDatabase(ctx, cfg, bc)
}

func (a *App) markDatabaseInitError(errMsg string) {
	// Intentionally lock-free: onboarding polls this field and retry/setup
	// paths may update it independently. The App state pointer remains the
	// source of truth for readiness; this error only explains non-ready states.
	a.dbInitErr.Store(&errMsg)
}

func (a *App) clearDatabaseInitError() {
	a.dbInitErr.Store(nil)
}

// setState directly installs a pre-built dbState (used when buildDatabase
// succeeds at startup, before the App is publicly reachable). The onReady
// callback is NOT invoked here — the caller mounts the initial Routes itself.
// Package-private because only the same-package Controller transitions state.
// Panics on nil to keep IsDatabaseInitialized honest.
//
// If a state was already installed (a degraded-mode retry racing the
// onboarding wizard), the previous state is closed: App.Close only releases
// the current pointer, so an overwritten state would otherwise leak its
// runner goroutines and meta-DB pool forever.
func (a *App) setState(state *dbState) {
	if state == nil {
		panic("app.setState: nil state") //nolint:forbidigo // programmer error: nil state would silently make IsDatabaseInitialized lie
	}

	if prev := a.state.Swap(state); prev != nil && prev != state {
		prev.close()
	}
}
