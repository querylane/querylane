package server

import (
	"errors"
	"time"
)

// Limits bounds user-driven work against managed PostgreSQL instances and the
// connection pools used to reach them.
type Limits struct {
	LiveQueries     LiveQueryLimits      `koanf:"live_queries"`
	ConnectionTests ConnectionTestLimits `koanf:"connection_tests"`
	PostgresPool    PostgresPoolLimits   `koanf:"postgres_pool"`
}

// LiveQueryLimits controls non-queuing admission for live-query RPCs. Global
// applies to one Querylane process; PerInstance spans every database in one
// managed PostgreSQL instance.
type LiveQueryLimits struct {
	Global      int `koanf:"global"`
	PerInstance int `koanf:"per_instance"`
}

// ConnectionTestLimits bounds caller-driven PostgreSQL connection probes.
// PerCallerPerMinute is keyed by the direct socket peer address; forwarding
// headers are deliberately ignored because no trusted-proxy boundary exists.
type ConnectionTestLimits struct {
	PerCallerPerMinute int `koanf:"per_caller_per_minute"`
	Burst              int `koanf:"burst"`
}

// PostgresPoolLimits bounds physical connections across every pool targeting
// one PostgreSQL endpoint. Database-specific pools retain one idle connection
// for a short, fixed reuse window.
type PostgresPoolLimits struct {
	MaxOpenConnections    int           `koanf:"max_open_connections"`
	MaxIdleConnections    int           `koanf:"max_idle_connections"`
	IdleTimeout           time.Duration `koanf:"idle_timeout"`
	ConnectionMaxLifetime time.Duration `koanf:"connection_max_lifetime"`
}

// SetDefaults fills in conservative limits that still accommodate normal UI
// fan-out.
func (l *Limits) SetDefaults() {
	if l.LiveQueries.Global == 0 {
		l.LiveQueries.Global = 32
	}

	if l.LiveQueries.PerInstance == 0 {
		l.LiveQueries.PerInstance = 6
	}

	if l.ConnectionTests.PerCallerPerMinute == 0 {
		l.ConnectionTests.PerCallerPerMinute = 10
	}

	if l.ConnectionTests.Burst == 0 {
		l.ConnectionTests.Burst = 5
	}

	if l.PostgresPool.MaxOpenConnections == 0 {
		l.PostgresPool.MaxOpenConnections = 8
	}

	if l.PostgresPool.MaxIdleConnections == 0 {
		l.PostgresPool.MaxIdleConnections = 2
	}

	if l.PostgresPool.IdleTimeout == 0 {
		l.PostgresPool.IdleTimeout = 5 * time.Minute
	}

	if l.PostgresPool.ConnectionMaxLifetime == 0 {
		l.PostgresPool.ConnectionMaxLifetime = 30 * time.Minute
	}
}

// Validate rejects configurations that could disable admission control or
// create an internally inconsistent database pool.
func (l *Limits) Validate() error {
	if l.LiveQueries.Global <= 0 {
		return errors.New("live_queries.global must be positive")
	}

	if l.LiveQueries.PerInstance <= 0 {
		return errors.New("live_queries.per_instance must be positive")
	}

	if l.LiveQueries.PerInstance > l.LiveQueries.Global {
		return errors.New("live_queries.per_instance must not exceed live_queries.global")
	}

	if l.ConnectionTests.PerCallerPerMinute <= 0 {
		return errors.New("connection_tests.per_caller_per_minute must be positive")
	}

	if l.ConnectionTests.Burst <= 0 {
		return errors.New("connection_tests.burst must be positive")
	}

	if l.ConnectionTests.Burst > l.ConnectionTests.PerCallerPerMinute {
		return errors.New("connection_tests.burst must not exceed per_caller_per_minute")
	}

	if l.PostgresPool.MaxOpenConnections <= 0 {
		return errors.New("postgres_pool.max_open_connections must be positive")
	}

	if l.PostgresPool.MaxIdleConnections < 0 {
		return errors.New("postgres_pool.max_idle_connections must be non-negative")
	}

	if l.PostgresPool.MaxIdleConnections > l.PostgresPool.MaxOpenConnections {
		return errors.New("postgres_pool.max_idle_connections must not exceed postgres_pool.max_open_connections")
	}

	if l.LiveQueries.PerInstance+l.PostgresPool.MaxIdleConnections > l.PostgresPool.MaxOpenConnections {
		return errors.New("live_queries.per_instance plus postgres_pool.max_idle_connections must not exceed postgres_pool.max_open_connections")
	}

	if l.PostgresPool.IdleTimeout < 0 {
		return errors.New("postgres_pool.idle_timeout must be non-negative")
	}

	if l.PostgresPool.ConnectionMaxLifetime < 0 {
		return errors.New("postgres_pool.connection_max_lifetime must be non-negative")
	}

	return nil
}
