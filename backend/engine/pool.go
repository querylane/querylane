package engine

import (
	"database/sql"
	"time"
)

const databasePoolIdleTimeout = time.Second

// PoolConfig defines connection limits for a managed endpoint's cached sql.DB
// pools. Database-specific pools retain one connection briefly for paged reads,
// then release it so many databases cannot accumulate standing backends.
type PoolConfig struct {
	// MaxOpenConns is the aggregate maximum across every sql.DB pool targeting
	// one PostgreSQL endpoint. It is also applied to each pool as a local ceiling.
	// Default: 8
	MaxOpenConns int

	// MaxIdleConns is the aggregate maximum of idle connections for one endpoint.
	// Database-specific pools retain at most one locally for one second.
	// Default: 2
	MaxIdleConns int

	// IdleTimeout is how long an individual connection can remain idle before being closed.
	// This configures sql.DB's ConnMaxIdleTime.
	// Default: 5 minutes
	IdleTimeout time.Duration

	// ConnMaxLifetime caps the total lifetime of a connection regardless of activity.
	// This configures sql.DB's ConnMaxLifetime so connections rotate periodically,
	// which lets the pool recover after failovers and pick up DNS changes instead of
	// holding stale connections forever.
	// Default: 30 minutes
	ConnMaxLifetime time.Duration
}

// DefaultPoolConfig returns a PoolConfig with sensible defaults.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxOpenConns:    8,
		MaxIdleConns:    2,
		IdleTimeout:     5 * time.Minute,
		ConnMaxLifetime: 30 * time.Minute,
	}
}

// apply configures the provided sql.DB with this pool's connection settings.
// It is the single place that maps PoolConfig onto sql.DB so instance-level and
// database-level pools stay consistent.
func (c PoolConfig) apply(db *sql.DB) {
	db.SetMaxOpenConns(c.MaxOpenConns)
	db.SetMaxIdleConns(c.MaxIdleConns)
	db.SetConnMaxIdleTime(c.IdleTimeout)
	db.SetConnMaxLifetime(c.ConnMaxLifetime)
}

// applyDatabase keeps one connection warm between adjacent pages in a stream,
// but expires it quickly so cached pools cannot hoard the aggregate budget.
func (c PoolConfig) applyDatabase(db *sql.DB) {
	c.apply(db)
	db.SetMaxIdleConns(min(c.MaxIdleConns, 1))
	db.SetConnMaxIdleTime(databasePoolIdleTimeout)
}
