package config_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

// TestConfigManagerIgnoresUnrelatedEnvVars verifies that reserved or unrelated
// QUERYLANE_* environment variables (consumed elsewhere via os.Getenv) do not
// abort startup, while genuine config env vars are still applied.
//
//nolint:paralleltest // mutates process environment via t.Setenv
func TestConfigManagerIgnoresUnrelatedEnvVars(t *testing.T) {
	// Isolate from any real ~/.querylane/config.yaml on the host.
	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_NAME":                "env-app",      // real field -> applied
		"QUERYLANE_INSTANCE_SECRET_KEY": "deadbeefcafe", // reserved -> must be ignored
		"QUERYLANE_CONFIG":              "/etc/x.yaml",  // CLI var -> must be ignored
	})

	cm, err := config.NewConfigManager(
		context.Background(),
		config.NewTestConfig(),
		config.WithConfigFile(configFile),
	)
	require.NoError(t, err) // before the fix this failed: "invalid keys: instance" / "config"

	t.Cleanup(cm.Stop)

	assert.Equal(t, "env-app", cm.CurrentConfig().Name, "known env var should still override")
}

// TestConfigManagerSupportsDoubleUnderscoreEnvNesting verifies that
// snake_case config fields are reachable via environment variables: a double
// underscore separates nesting levels while a single underscore stays part of
// the field name (QUERYLANE_DATABASE__MAX_CONNECTIONS → database.max_connections).
// Legacy single-underscore nesting (QUERYLANE_DATABASE_HOST → database.host)
// keeps working.
//
//nolint:paralleltest // mutates process environment via t.Setenv
func TestConfigManagerSupportsDoubleUnderscoreEnvNesting(t *testing.T) {
	configFile, cleanup := config.CreateTempConfigFile(t, "", "config.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_DATABASE__MAX_CONNECTIONS": "42",        // multi-word leaf, only reachable via __ nesting
		"QUERYLANE_FEATURES__ENABLE_TRACING":  "true",      // multi-word leaf under a nested struct
		"QUERYLANE_DATABASE_HOST":             "env-host",  // legacy single-underscore nesting keeps working
		"QUERYLANE_NAME":                      "env-app",   // top-level leaf
		"QUERYLANE_INSTANCE_SECRET_KEY":       "cafebabe1", // reserved -> still ignored
	})

	cm, err := config.NewConfigManager(
		context.Background(),
		config.NewTestConfig(),
		config.WithConfigFile(configFile),
	)
	require.NoError(t, err)

	t.Cleanup(cm.Stop)

	cfg := cm.CurrentConfig()
	assert.Equal(t, 42, cfg.Database.MaxConnections,
		"QUERYLANE_DATABASE__MAX_CONNECTIONS must map to database.max_connections")
	assert.True(t, cfg.Features.EnableTracing,
		"QUERYLANE_FEATURES__ENABLE_TRACING must map to features.enable_tracing")
	assert.Equal(t, "env-host", cfg.Database.Host, "legacy mapping must keep working")
	assert.Equal(t, "env-app", cfg.Name)
}
