package engine

import (
	"database/sql"
	"time"
)

// PoolConfig defines configuration for cached instance connection pools.
type PoolConfig struct {
	// MaxOpenConns is the maximum number of open connections per instance pool.
	// Default: 10
	MaxOpenConns int

	// MaxIdleConns is the maximum number of idle connections per instance pool.
	// Kept equal to MaxOpenConns so bursts (for example the table-detail screen
	// fans out several concurrent RPCs) reuse warm connections instead of paying
	// fresh TCP + TLS + auth on every spike.
	// Default: 10
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
		MaxOpenConns:    10,
		MaxIdleConns:    10,
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
