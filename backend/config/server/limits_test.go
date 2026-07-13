package server

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

func TestLimitsDefaults(t *testing.T) {
	t.Parallel()

	var limits Limits
	limits.SetDefaults()

	assert.Equal(t, 32, limits.LiveQueries.Global)
	assert.Equal(t, 6, limits.LiveQueries.PerInstance)
	assert.Equal(t, 8, limits.PostgresPool.MaxOpenConnections)
	assert.Equal(t, 2, limits.PostgresPool.MaxIdleConnections)
	assert.Equal(t, 5*time.Minute, limits.PostgresPool.IdleTimeout)
	assert.Equal(t, 30*time.Minute, limits.PostgresPool.ConnectionMaxLifetime)
}

func TestLimitsValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(*Limits)
		want   string
	}{
		{
			name: "global live query limit must be positive",
			mutate: func(limits *Limits) {
				limits.LiveQueries.Global = 0
			},
			want: "live_queries.global must be positive",
		},
		{
			name: "per-instance live query limit must be positive",
			mutate: func(limits *Limits) {
				limits.LiveQueries.PerInstance = 0
			},
			want: "live_queries.per_instance must be positive",
		},
		{
			name: "per-instance limit cannot exceed global limit",
			mutate: func(limits *Limits) {
				limits.LiveQueries.PerInstance = limits.LiveQueries.Global + 1
			},
			want: "live_queries.per_instance must not exceed live_queries.global",
		},
		{
			name: "pool max open must be positive",
			mutate: func(limits *Limits) {
				limits.PostgresPool.MaxOpenConnections = 0
			},
			want: "postgres_pool.max_open_connections must be positive",
		},
		{
			name: "pool max idle cannot be negative",
			mutate: func(limits *Limits) {
				limits.PostgresPool.MaxIdleConnections = -1
			},
			want: "postgres_pool.max_idle_connections must be non-negative",
		},
		{
			name: "pool max idle cannot exceed max open",
			mutate: func(limits *Limits) {
				limits.PostgresPool.MaxIdleConnections = limits.PostgresPool.MaxOpenConnections + 1
			},
			want: "postgres_pool.max_idle_connections must not exceed postgres_pool.max_open_connections",
		},
		{
			name: "live queries and retained idle connections must fit the instance budget",
			mutate: func(limits *Limits) {
				limits.LiveQueries.PerInstance = 7
			},
			want: "live_queries.per_instance plus postgres_pool.max_idle_connections must not exceed postgres_pool.max_open_connections",
		},
		{
			name: "pool idle timeout cannot be negative",
			mutate: func(limits *Limits) {
				limits.PostgresPool.IdleTimeout = -time.Second
			},
			want: "postgres_pool.idle_timeout must be non-negative",
		},
		{
			name: "pool connection lifetime cannot be negative",
			mutate: func(limits *Limits) {
				limits.PostgresPool.ConnectionMaxLifetime = -time.Second
			},
			want: "postgres_pool.connection_max_lifetime must be non-negative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var limits Limits
			limits.SetDefaults()
			tt.mutate(&limits)

			assert.EqualError(t, limits.Validate(), tt.want)
		})
	}
}

func TestLimitsValidateAllowsDisabledPoolExpiry(t *testing.T) {
	t.Parallel()

	var limits Limits
	limits.SetDefaults()
	limits.PostgresPool.IdleTimeout = 0
	limits.PostgresPool.ConnectionMaxLifetime = 0

	assert.NoError(t, limits.Validate())
}

func TestLimitsLoadFromConfigFile(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `limits:
  live_queries:
    global: 12
    per_instance: 4
  postgres_pool:
    max_open_connections: 5
    max_idle_connections: 0
    idle_timeout: 0s
    connection_max_lifetime: 0s
`, "config.yaml")
	defer cleanup()

	manager, err := config.NewConfigManager(context.Background(), &Config{}, config.WithConfigFile(configFile))
	require.NoError(t, err)
	t.Cleanup(manager.Stop)

	limits := manager.CurrentConfig().Limits
	assert.Equal(t, 12, limits.LiveQueries.Global)
	assert.Equal(t, 4, limits.LiveQueries.PerInstance)
	assert.Equal(t, 5, limits.PostgresPool.MaxOpenConnections)
	assert.Equal(t, 0, limits.PostgresPool.MaxIdleConnections)
	assert.Equal(t, time.Duration(0), limits.PostgresPool.IdleTimeout)
	assert.Equal(t, time.Duration(0), limits.PostgresPool.ConnectionMaxLifetime)
}
