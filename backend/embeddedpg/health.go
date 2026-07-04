package embeddedpg

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register PostgreSQL driver.
)

const (
	healthCheckTimeout     = 5 * time.Second
	maxConsecutiveFailures = 3
)

// healthLoop runs periodic health checks against the embedded PostgreSQL
// instance. After maxConsecutiveFailures consecutive failures it attempts
// an automatic restart.
func (m *Manager) healthLoop(ctx context.Context) {
	ticker := time.NewTicker(m.cfg.HealthCheckInterval)
	defer ticker.Stop()

	var failures int

	for {
		select {
		case <-ctx.Done():
			m.health.Store(int32(HealthStopped))

			return
		case <-ticker.C:
			failures = m.runHealthCheck(ctx, failures)
		}
	}
}

// runHealthCheck performs a single health check iteration and returns the
// updated consecutive failure count.
func (m *Manager) runHealthCheck(ctx context.Context, failures int) int {
	if err := m.ping(ctx); err == nil {
		if failures > 0 {
			slog.InfoContext(ctx, "embedded postgres recovered")
		}

		m.health.Store(int32(HealthHealthy))

		return 0
	}

	failures++
	slog.WarnContext(ctx, "embedded postgres health check failed",
		slog.Int("consecutive_failures", failures))

	m.health.Store(int32(HealthDegraded))

	if failures < maxConsecutiveFailures {
		return failures
	}

	slog.ErrorContext(ctx, "embedded postgres unresponsive, attempting restart",
		slog.Int("consecutive_failures", failures))

	if err := m.attemptRestart(ctx); err != nil {
		slog.ErrorContext(ctx, "embedded postgres restart failed", slog.Any("error", err))

		return failures
	}

	return 0
}

// ping performs a single health check query against the embedded database.
func (m *Manager) ping(ctx context.Context) error {
	dsn := fmt.Sprintf(
		"host=127.0.0.1 port=%d user=%s password=%s dbname=%s sslmode=disable",
		m.cfg.Port, dbUsername, dbPassword, dbName,
	)

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open health check connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(ctx, healthCheckTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}

	return nil
}

// attemptRestart stops and restarts the embedded PostgreSQL process.
// The caller's health loop continues running on the same context afterward.
// If the manager had adopted a pre-existing process, it kills that process
// first and then starts a library-managed instance.
func (m *Manager) attemptRestart(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.adopted {
		slog.InfoContext(ctx, "killing adopted postgres process before restart",
			slog.Int("pid", m.adoptedPID))

		if err := killProcess(m.adoptedPID); err != nil {
			slog.WarnContext(ctx, "error killing adopted postgres during restart", slog.Any("error", err))
		}

		m.adopted = false
		m.adoptedPID = 0
	} else if m.postgres != nil {
		if err := m.postgres.Stop(); err != nil {
			slog.WarnContext(ctx, "error stopping postgres during restart", slog.Any("error", err))
		}

		m.postgres = nil
	}

	return m.startLocked(ctx)
}
