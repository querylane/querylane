package embeddedpg

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"syscall"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	serverconfig "github.com/querylane/querylane/backend/config/server"
)

const (
	dbUsername = "querylane"
	dbPassword = "querylane-embedded" //nolint:gosec // G101: Internal credential for local-only embedded DB
	dbName     = "querylane"
)

var ErrAlreadyRunning = errors.New("embedded postgres is already running")

// syncBuffer is a mutex-guarded bytes.Buffer safe for concurrent use. The
// embedded-postgres library writes process logs to it from its own goroutine
// (via the Logger option) while Logs() reads it from API handlers, so every
// access must go through the buffer's own lock — m.mu does not cover the
// library's writer goroutine.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

func (b *syncBuffer) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.buf.Reset()
}

// HealthStatus represents the current health state of the embedded PostgreSQL instance.
type HealthStatus int32

const (
	// HealthUnknown is the initial state before any health check has run.
	HealthUnknown HealthStatus = iota
	// HealthHealthy means the last health check succeeded.
	HealthHealthy
	// HealthDegraded means one or more recent health checks have failed.
	HealthDegraded
	// HealthStopped means the manager has been stopped.
	HealthStopped
)

// String returns a human-readable representation of the health status.
func (h HealthStatus) String() string {
	switch h {
	case HealthUnknown:
		return "unknown"
	case HealthHealthy:
		return "healthy"
	case HealthDegraded:
		return "degraded"
	case HealthStopped:
		return "stopped"
	default:
		return "invalid"
	}
}

// Manager manages the lifecycle of an embedded PostgreSQL instance.
type Manager struct {
	cfg          Config
	postgres     *embeddedpostgres.EmbeddedPostgres
	logBuffer    *syncBuffer
	mu           sync.Mutex // guards postgres, started, adopted, adoptedPID
	started      bool
	adopted      bool // true when we adopted a pre-existing process instead of starting our own
	adoptedPID   int  // PID of the adopted process (only valid when adopted == true)
	health       atomic.Int32
	cancelHealth context.CancelFunc
}

// NewManager creates a new embedded PostgreSQL manager. It applies defaults
// to the provided config but does not start anything.
func NewManager(cfg Config) *Manager {
	cfg.SetDefaults()

	return &Manager{
		cfg:       cfg,
		logBuffer: &syncBuffer{},
	}
}

// ConfigFromServerConfig converts persisted server config into manager config.
func ConfigFromServerConfig(cfg *serverconfig.EmbeddedDatabase) Config {
	if cfg == nil {
		return Config{}
	}

	return Config{
		Mode:                Mode(cfg.Mode),
		DataPath:            cfg.DataPath,
		Port:                cfg.Port,
		HealthCheckInterval: cfg.HealthCheckInterval,
	}
}

// Configure replaces the manager config before PostgreSQL starts.
func (m *Manager) Configure(cfg Config) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.configureLocked(cfg)
}

// StartWithConfig configures then starts PostgreSQL as one lifecycle operation.
func (m *Manager) StartWithConfig(ctx context.Context, cfg Config) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.started {
		return ErrAlreadyRunning
	}

	if err := m.configureLocked(cfg); err != nil {
		return err
	}

	return m.startLockedFromReadyConfig(ctx)
}

// Start initializes and starts the embedded PostgreSQL instance.
// It cleans stale PID files, creates required directories, starts postgres,
// and launches a background health-monitoring goroutine.
func (m *Manager) Start(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.startLockedFromReadyConfig(ctx)
}

// Stop gracefully shuts down the embedded PostgreSQL instance and the health
// monitor. In ephemeral mode the data directory is removed afterward.
func (m *Manager) Stop(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.started {
		return nil
	}

	// Cancel health monitor first.
	if m.cancelHealth != nil {
		m.cancelHealth()
		m.cancelHealth = nil
	}

	if m.adopted {
		if err := killProcess(m.adoptedPID); err != nil {
			slog.ErrorContext(ctx, "error killing adopted postgres process",
				slog.Int("pid", m.adoptedPID), slog.Any("error", err))

			return fmt.Errorf("kill adopted postgres (PID %d): %w", m.adoptedPID, err)
		}

		m.adopted = false
		m.adoptedPID = 0
	} else if m.postgres != nil {
		if err := m.postgres.Stop(); err != nil {
			slog.ErrorContext(ctx, "error stopping embedded postgres", slog.Any("error", err))

			return fmt.Errorf("stop embedded postgres: %w", err)
		}

		m.postgres = nil
	}

	m.started = false
	m.health.Store(int32(HealthStopped))

	if m.cfg.Mode == ModeEphemeral {
		slog.InfoContext(ctx, "removing ephemeral data directory", slog.String("path", m.cfg.DataPath))

		if err := os.RemoveAll(m.cfg.DataPath); err != nil {
			return fmt.Errorf("remove ephemeral data directory: %w", err)
		}
	}

	slog.InfoContext(ctx, "embedded postgres stopped")

	return nil
}

// DatabaseConfig returns a serverconfig.Database that can be passed directly
// to the existing buildDatabase() / storage.NewPostgresDB() pipeline.
func (m *Manager) DatabaseConfig() *serverconfig.Database {
	return &serverconfig.Database{
		Host:     "127.0.0.1",
		Port:     m.cfg.Port,
		Database: dbName,
		Username: dbUsername,
		Password: dbPassword,
		SSLMode:  "disable",
	}
}

// Health returns the current health status of the embedded PostgreSQL instance.
func (m *Manager) Health() HealthStatus {
	return HealthStatus(m.health.Load())
}

// Logs returns the captured PostgreSQL stderr output for diagnostics.
// logBuffer is never reassigned after construction and synchronizes
// internally, so no Manager-level locking is needed here.
func (m *Manager) Logs() string {
	return m.logBuffer.String()
}

func (m *Manager) configureLocked(cfg Config) error {
	if m.started {
		return errors.New("cannot configure embedded postgres after start")
	}

	cfg.SetDefaults()

	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid embedded config: %w", err)
	}

	m.cfg = cfg

	return nil
}

func (m *Manager) startLockedFromReadyConfig(ctx context.Context) error {
	if m.started {
		return ErrAlreadyRunning
	}

	if err := m.cfg.Validate(); err != nil {
		return fmt.Errorf("invalid embedded config: %w", err)
	}

	result, err := cleanStalePID(ctx, m.cfg.DataPath)
	if err != nil {
		return fmt.Errorf("stale PID check: %w", err)
	}

	if result.LivePID != 0 {
		if err := m.handleLivePID(ctx, result.LivePID); err != nil {
			return err
		}
	} else {
		if err := m.startLocked(ctx); err != nil {
			return err
		}
	}

	m.started = true

	// Start health monitor with its own context (independent of the caller's
	// request context so it stays alive for the entire server lifetime).
	healthCtx, cancel := context.WithCancel(context.Background())
	m.cancelHealth = cancel

	go m.healthLoop(healthCtx) //nolint:contextcheck // intentionally detached from request context

	slog.InfoContext(ctx, "embedded postgres started",
		slog.Int("port", m.cfg.Port), slog.String("data_path", m.cfg.DataPath), slog.String("mode", string(m.cfg.Mode)))

	return nil
}

// startLocked creates and starts the embedded postgres process. The caller
// must hold m.mu.
func (m *Manager) startLocked(ctx context.Context) error {
	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp4", fmt.Sprintf("127.0.0.1:%d", m.cfg.Port))
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			return fmt.Errorf(
				"embedded postgres port %d is already in use; stop the process using it or set embedded.port to another available port",
				m.cfg.Port,
			)
		}

		return fmt.Errorf("check embedded postgres port %d availability: %w", m.cfg.Port, err)
	}

	if err := listener.Close(); err != nil {
		return fmt.Errorf("release embedded postgres port %d after availability check: %w", m.cfg.Port, err)
	}

	if err := os.MkdirAll(m.cfg.DataPath, 0o755); err != nil {
		return fmt.Errorf("create data directory: %w", err)
	}

	rtDir, err := runtimeDir(m.cfg.DataPath)
	if err != nil {
		return err
	}

	m.logBuffer.Reset()

	pg := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Port(uint32(m.cfg.Port)). //nolint:gosec // G115: Port is validated to 1-65535
			DataPath(m.cfg.DataPath).
			RuntimePath(rtDir).
			Username(dbUsername).
			Password(dbPassword).
			Database(dbName).
			StartParameters(map[string]string{
				"listen_addresses": "127.0.0.1",
			}).
			Logger(m.logBuffer),
	)

	if err := pg.Start(); err != nil {
		return fmt.Errorf("start embedded postgres: %w", err)
	}

	m.postgres = pg

	slog.DebugContext(ctx, "embedded postgres process started", slog.Int("port", m.cfg.Port))

	return nil
}

// handleLivePID decides what to do when a postmaster.pid references a
// still-running process. If postgres responds on the configured port we adopt
// the running instance (crash-recovery). Otherwise the PID was recycled by an
// unrelated process and we remove the stale PID file to start fresh.
// The caller must hold m.mu.
func (m *Manager) handleLivePID(ctx context.Context, pid int) error {
	if err := m.ping(ctx); err == nil {
		slog.InfoContext(ctx, "found running postgres on configured port, adopting",
			slog.Int("pid", pid), slog.Int("port", m.cfg.Port))

		m.adoptLocked(pid)

		return nil
	}

	// Postgres is not reachable — the PID belongs to an unrelated process.
	pidFile := filepath.Join(m.cfg.DataPath, "postmaster.pid")

	slog.InfoContext(ctx, "PID file references a non-postgres process (recycled PID), removing",
		slog.Int("pid", pid), slog.String("path", pidFile))

	if err := os.Remove(pidFile); err != nil {
		return fmt.Errorf("remove recycled PID file: %w", err)
	}

	return m.startLocked(ctx)
}

// adoptLocked marks the manager as having adopted a pre-existing postgres
// process instead of starting its own. The caller must hold m.mu.
func (m *Manager) adoptLocked(pid int) {
	m.adopted = true
	m.adoptedPID = pid
	m.postgres = nil
}
