package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"connectrpc.com/validate"
	"golang.org/x/sync/errgroup"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/embeddedpg"
	"github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

// DelegatingHandler is an http.Handler whose underlying handler can be
// atomically swapped at runtime. Used to switch route trees after the database
// transitions from "not configured" or "unreachable" to "ready" without
// restarting the server.
type DelegatingHandler struct {
	handler atomic.Pointer[http.Handler]
}

// ServeHTTP dispatches to the currently-installed handler. Before the first
// Set, it returns 503 so early requests during boot don't appear as panics.
func (d *DelegatingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := d.handler.Load()
	if h == nil {
		http.Error(w, "server initializing", http.StatusServiceUnavailable)
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == consolev1alpha1connect.TableDataServiceStreamRowsProcedure {
		if err := http.NewResponseController(w).SetWriteDeadline(time.Time{}); err != nil {
			slog.ErrorContext(r.Context(), "disabling StreamRows write deadline failed", slog.Any("error", err))
			http.Error(w, "streaming response unavailable", http.StatusInternalServerError)

			return
		}
	}

	(*h).ServeHTTP(w, r)
}

// Set atomically replaces the underlying handler.
func (d *DelegatingHandler) Set(h http.Handler) {
	d.handler.Store(&h)
}

// Controller owns the HTTP server lifecycle. It constructs the single App,
// installs its initial Routes, and rebuilds + swaps Routes whenever App's
// state transitions (after onboarding or a successful retry).
type Controller struct {
	configManager         *config.Manager[*serverconfig.Config]
	embeddedManager       *embeddedpg.Manager
	validationInterceptor *validate.Interceptor
	progressBroadcaster   *dbsetup.Broadcaster

	delegatingHandler *DelegatingHandler
	server            *http.Server

	// CLI flag overrides for the listen address (`server start --host/--port`).
	// Zero values mean "use the configured value".
	listenHostOverride string
	listenPortOverride int

	mu  sync.Mutex
	app *App

	retryDatabaseInitInterval  time.Duration
	currentConfigFunc          func() *serverconfig.Config
	resolveEffectiveConfigFunc func(context.Context, *serverconfig.Config) *serverconfig.Config
	buildDatabaseFunc          func(context.Context, *serverconfig.Config, *dbsetup.Broadcaster) (*dbState, error)
	installReadyStateFunc      func(context.Context, *dbState)
}

type embeddedEffectiveConfigManager interface {
	StartWithConfig(ctx context.Context, cfg embeddedpg.Config) error
	DatabaseConfig() *serverconfig.Database
}

// NewController creates a new controller.
func NewController(configManager *config.Manager[*serverconfig.Config]) *Controller {
	return &Controller{
		configManager:             configManager,
		embeddedManager:           embeddedpg.NewManager(embeddedpg.Config{}),
		progressBroadcaster:       dbsetup.NewBroadcaster(),
		delegatingHandler:         &DelegatingHandler{},
		retryDatabaseInitInterval: 5 * time.Second,
		buildDatabaseFunc:         buildDatabase,
	}
}

// SetListenOverrides applies CLI flag overrides (`server start --host/--port`)
// that take precedence over the configured HTTP listen address. Empty host or
// zero port mean "use the configured value". Must be called before Run.
func (c *Controller) SetListenOverrides(host string, port int) {
	c.listenHostOverride = host
	c.listenPortOverride = port
}

// Run is a blocking call that runs the server, and exits when it is stopped.
// The given context cancels when the application receives a signal.

func newHTTPServerProtocols() *http.Protocols {
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetUnencryptedHTTP2(true)

	return protocols
}

func (c *Controller) Run(ctx context.Context) error {
	c.validationInterceptor = validate.NewInterceptor()

	cfg := c.configManager.CurrentConfig()

	c.app = NewApp(
		c.configManager,
		c.validationInterceptor,
		c.embeddedManager,
		c.progressBroadcaster,
		c.onAppReady,
	)

	if cfg.Database != nil || cfg.Embedded != nil {
		c.bootMainStage(ctx, cfg)
	} else {
		c.bootBootstrapStage(ctx)
	}

	c.server = &http.Server{
		Addr:              c.listenAddr(cfg),
		Handler:           c.delegatingHandler,
		Protocols:         newHTTPServerProtocols(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Minute,
		WriteTimeout:      5 * time.Minute,
		MaxHeaderBytes:    8 * 1024, // 8KiB
	}

	// Setup err group. If any of the go routines return an error, it will also
	// cancel the context that is passed to all the other go routines.
	grp, groupCtx := errgroup.WithContext(ctx)
	grp.Go(func() error { return c.runServer(groupCtx) })
	grp.Go(func() error {
		<-groupCtx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(groupCtx), 15*time.Second)
		defer cancel()

		c.stop(shutdownCtx)

		return nil
	})

	if err := grp.Wait(); err != nil {
		return fmt.Errorf("running the server returned an error: %w", err)
	}

	return nil
}

// listenAddr computes the address the HTTP server binds to, applying any CLI
// flag overrides over the configured values.
func (c *Controller) listenAddr(cfg *serverconfig.Config) string {
	host := cfg.HTTP.Host
	if c.listenHostOverride != "" {
		host = c.listenHostOverride
	}

	port := cfg.HTTP.Port
	if c.listenPortOverride != 0 {
		port = c.listenPortOverride
	}

	return net.JoinHostPort(host, strconv.Itoa(port))
}

// bootBootstrapStage mounts the bootstrap routes (OnboardingService live,
// every DB-dependent service stubbed) and wires a config-file watcher so a
// manual YAML edit during onboarding also triggers initialization.
func (c *Controller) bootBootstrapStage(ctx context.Context) {
	c.delegatingHandler.Set(c.app.Routes(ctx))

	c.configManager.Subscribe(func(_, newCfg *serverconfig.Config) {
		// Short-circuit once dbState is installed (NOT just once config has
		// Database — that flips true at the START of init, not the end).
		// The embedded manager's Start is single-shot (returns "already
		// running" on a second call), and once state is up the wizard's
		// success path has already done the work — any later YAML edit during
		// the same boot just produces a noisy warning otherwise.
		if c.app.state.Load() != nil {
			return
		}

		// Route through resolveEffectiveConfig so an `embedded:` YAML edit also
		// starts the embedded server and produces a Database config before
		// init. A bare config (neither Database nor Embedded) is ignored.
		effectiveCfg := c.resolveEffectiveConfig(ctx, newCfg)
		if effectiveCfg == nil {
			return
		}

		if err := c.app.InitializeDatabaseWithConfig(ctx, effectiveCfg); err != nil {
			slog.WarnContext(ctx, "database initialization after config change failed",
				slog.Any("error", err))
		}
	})

	slog.InfoContext(ctx, "server started, waiting for initial setup")
}

// bootMainStage resolves the effective config (handling embedded PG), builds
// the database, and mounts the main routes. If the DB is unreachable, the App
// is mounted in degraded mode and retries happen in the background.
func (c *Controller) bootMainStage(ctx context.Context, cfg *serverconfig.Config) {
	effectiveCfg := c.resolveEffectiveConfig(ctx, cfg)
	if effectiveCfg == nil {
		// Embedded PG failed to start or no usable config — mount degraded.
		slog.WarnContext(ctx, "no usable database configuration, starting in degraded mode")
		c.app.markDatabaseInitError("database configuration is present but not currently usable")
		c.delegatingHandler.Set(c.app.Routes(ctx))

		go c.retryDatabaseInit(ctx)

		return
	}

	state, err := c.buildDatabase(ctx, effectiveCfg, c.progressBroadcaster)
	if err != nil {
		slog.WarnContext(ctx, "database initialization failed, starting in degraded mode",
			slog.Any("error", err))
		c.app.markDatabaseInitFailure(err)
		c.delegatingHandler.Set(c.app.Routes(ctx))

		go c.retryDatabaseInit(ctx)

		return
	}

	c.app.setState(state)
	c.delegatingHandler.Set(c.app.Routes(ctx))

	slog.InfoContext(ctx, "server ready, database connected")
}

// resolveEffectiveConfig returns a config with a non-nil Database field. For
// embedded configs, it starts the embedded manager and derives the connection
// details. Returns nil if no usable config could be resolved.
// currentConfig returns the latest configuration. It reads through the config
// manager so changes (e.g. a corrected YAML reloaded by the file watcher) are
// picked up, rather than a stale snapshot captured at boot.
func (c *Controller) currentConfig() *serverconfig.Config {
	if c.currentConfigFunc != nil {
		return c.currentConfigFunc()
	}

	return c.configManager.CurrentConfig()
}

func (c *Controller) resolveEffectiveConfig(ctx context.Context, cfg *serverconfig.Config) *serverconfig.Config {
	if c.resolveEffectiveConfigFunc != nil {
		return c.resolveEffectiveConfigFunc(ctx, cfg)
	}

	if cfg.Database != nil {
		return cfg
	}

	if cfg.Embedded != nil {
		return resolveEmbeddedEffectiveConfig(ctx, cfg, c.embeddedManager)
	}

	return nil
}

func resolveEmbeddedEffectiveConfig(
	ctx context.Context,
	cfg *serverconfig.Config,
	manager embeddedEffectiveConfigManager,
) *serverconfig.Config {
	slog.InfoContext(ctx, "starting embedded PostgreSQL from config")

	if err := manager.StartWithConfig(ctx, embeddedpg.ConfigFromServerConfig(cfg.Embedded)); err != nil {
		if !errors.Is(err, embeddedpg.ErrAlreadyRunning) {
			slog.WarnContext(ctx, "embedded postgres startup failed",
				slog.Any("error", err))

			return nil
		}

		slog.InfoContext(ctx, "embedded PostgreSQL already running, reusing connection config")
	}

	return &serverconfig.Config{
		HTTP:      cfg.HTTP,
		Database:  manager.DatabaseConfig(),
		Instances: cfg.Instances,
	}
}

func (c *Controller) buildDatabase(ctx context.Context, cfg *serverconfig.Config, bc *dbsetup.Broadcaster) (*dbState, error) {
	if c.buildDatabaseFunc != nil {
		return c.buildDatabaseFunc(ctx, cfg, bc)
	}

	return buildDatabase(ctx, cfg, bc)
}

func (c *Controller) installReadyState(ctx context.Context, state *dbState) {
	if c.installReadyStateFunc != nil {
		c.installReadyStateFunc(ctx, state)

		return
	}

	c.app.setState(state)
	c.app.clearDatabaseInitError()
	c.delegatingHandler.Set(c.app.Routes(ctx))
}

// onAppReady is invoked by App after a successful state transition (the
// onboarding wizard finished or a retry succeeded). It rebuilds and swaps in
// the now-ready route tree.
func (c *Controller) onAppReady(ctx context.Context, _ *dbState) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.delegatingHandler.Set(c.app.Routes(ctx))

	slog.InfoContext(ctx, "initial setup complete, all services available")
}

// retryDatabaseInit periodically re-resolves the effective database config and
// retries buildDatabase until it succeeds or the context is cancelled. On
// success it installs the state on the App and swaps in the ready route tree.
//
// It re-reads the current configuration on every attempt so a corrected config
// file (reloaded by the watcher) is picked up — a snapshot captured at boot
// would keep retrying with the broken config forever.
func (c *Controller) retryDatabaseInit(ctx context.Context) {
	interval := c.retryDatabaseInitInterval
	if interval <= 0 {
		interval = 5 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// In degraded mode the onboarding wizard stays reachable and can
			// install state itself. Once state exists this loop is done —
			// building and installing a second dbState would leak the loser's
			// runner goroutines and meta-DB pool, and could flip serving to
			// the wrong database.
			if c.app.state.Load() != nil {
				slog.InfoContext(ctx, "database state already installed, stopping retry loop")

				return
			}

			effectiveCfg := c.resolveEffectiveConfig(ctx, c.currentConfig())
			if effectiveCfg == nil {
				slog.WarnContext(ctx, "database retry could not resolve usable configuration")

				c.app.markDatabaseInitError("database configuration is present but not currently usable")

				continue
			}

			state, err := c.buildDatabase(ctx, effectiveCfg, nil)
			if err != nil {
				slog.WarnContext(ctx, "database retry failed", slog.Any("error", err))

				c.app.markDatabaseInitFailure(err)

				continue
			}

			// Success. Check context under lock to avoid leaking state if
			// stop() already ran between buildDatabase returning and now.
			c.mu.Lock()
			if ctx.Err() != nil {
				c.mu.Unlock()
				state.close()

				return
			}

			// Re-check after the (slow) build: if the wizard installed state
			// while buildDatabase was in flight, this loop lost the race —
			// close the freshly built state instead of installing over it.
			if c.app.state.Load() != nil {
				c.mu.Unlock()
				state.close()

				slog.InfoContext(ctx, "database state installed during retry build, discarding retry state")

				return
			}

			c.installReadyState(ctx, state)
			c.mu.Unlock()

			slog.InfoContext(ctx, "database connected after retry, all services available")

			return
		}
	}
}

// stop performs graceful shutdown in the correct order:
//  1. Stop accepting new HTTP connections and drain in-flight requests.
//  2. Close the App (releases dbState resources).
//  3. Stop embedded PG if running.
func (c *Controller) stop(ctx context.Context) {
	slog.InfoContext(ctx, "initiated graceful shutdown")
	defer slog.InfoContext(ctx, "graceful shutdown completed")

	if err := c.server.Shutdown(ctx); err != nil {
		slog.ErrorContext(ctx, "failed to shutdown HTTP server", slog.Any("error", err))
	}

	c.mu.Lock()
	if c.app != nil {
		c.app.Close()
	}
	c.mu.Unlock()

	if err := c.embeddedManager.Stop(ctx); err != nil {
		slog.ErrorContext(ctx, "failed to stop embedded postgres", slog.Any("error", err))
	}
}

func (c *Controller) runServer(ctx context.Context) error {
	slog.InfoContext(ctx, "started HTTP server", slog.String("address", c.server.Addr))

	err := c.server.ListenAndServe()

	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}

	slog.ErrorContext(ctx, "HTTP server stopped unexpectedly", slog.Any("error", err))

	return err
}
