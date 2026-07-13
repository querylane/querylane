package engine

import (
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestDefaultPoolConfig(t *testing.T) {
	t.Parallel()

	cfg := DefaultPoolConfig()

	assert.Equal(t, 8, cfg.MaxOpenConns, "default max open connections")
	assert.Equal(t, 2, cfg.MaxIdleConns, "default max idle connections")
	assert.Equal(t, 5*time.Minute, cfg.IdleTimeout, "default idle timeout")
	assert.Equal(t, 30*time.Minute, cfg.ConnMaxLifetime,
		"default connection max lifetime enables rotation across failovers and DNS changes")
}

func TestPoolConfig_apply(t *testing.T) {
	t.Parallel()

	// A closed driverless DB is sufficient to verify the settings that sql.DB
	// exposes through Stats without opening a real connection.
	db, err := sql.Open("pgx", "postgres://user:pass@127.0.0.1:1/db")
	if err != nil {
		t.Fatalf("open sql.DB: %v", err)
	}

	t.Cleanup(func() { _ = db.Close() })

	cfg := PoolConfig{
		MaxOpenConns:    10,
		MaxIdleConns:    10,
		IdleTimeout:     5 * time.Minute,
		ConnMaxLifetime: 30 * time.Minute,
	}

	cfg.apply(db)

	assert.Equal(t, 10, db.Stats().MaxOpenConnections,
		"apply should configure the underlying sql.DB max open connections")
}
