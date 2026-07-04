package server

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

// A partial database section (e.g. from a hand-written config file) omits
// "optional-looking" fields like port. Config.Validate must apply defaults so
// such a config is usable rather than rejected at first run.
func TestConfigValidateAppliesDatabaseDefaults(t *testing.T) {
	t.Parallel()

	cfg := &Config{
		Database: &Database{
			Host:     "db.example.com",
			Database: "querylane",
			Username: "querylane",
			Password: "secret",
		},
	}
	cfg.HTTP.SetDefaults() // HTTP is defaulted by the loader before Validate runs

	require.NoError(t, cfg.Validate())
	assert.Equal(t, 5432, cfg.Database.Port, "default port should be applied")
	assert.Equal(t, "prefer", cfg.Database.SSLMode, "default ssl_mode should be applied")
}

// A bare `embedded:` section (or one that only sets mode) must boot via the
// embedded defaults rather than failing validation.
func TestConfigValidateAppliesEmbeddedDefaults(t *testing.T) {
	t.Parallel()

	cfg := &Config{
		Embedded: &EmbeddedDatabase{Mode: "persistent"},
	}
	cfg.HTTP.SetDefaults()

	require.NoError(t, cfg.Validate())
	assert.NotEmpty(t, cfg.Embedded.DataPath, "default data_path should be applied")
	assert.Equal(t, 5433, cfg.Embedded.Port, "default port should be applied")
	assert.Positive(t, cfg.Embedded.HealthCheckInterval, "default health_check_interval should be applied")
}

func TestConfigValidateEmptyEmbeddedUsesDefaults(t *testing.T) {
	t.Parallel()

	cfg := &Config{Embedded: &EmbeddedDatabase{}}
	cfg.HTTP.SetDefaults()

	require.NoError(t, cfg.Validate())
	assert.Equal(t, "persistent", cfg.Embedded.Mode, "default mode should be applied")
}

// Snake_case config fields must be reachable via environment variables: with
// legacy single-underscore mapping QUERYLANE_DATABASE_SSL_MODE became
// database.ssl.mode (unknown, skipped). A double underscore separates nesting
// levels so multi-word leaves like ssl_mode and access_log are addressable.
//
//nolint:paralleltest // mutates process environment via t.Setenv
func TestConfigEnvDoubleUnderscoreReachesSnakeCaseFields(t *testing.T) {
	configFile, cleanup := config.CreateTempConfigFile(t, `database:
  host: db.example.com
  database: querylane
  username: querylane
`, "config.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_DATABASE__SSL_MODE": "require",
		"QUERYLANE_HTTP__ACCESS_LOG":   "false",
		"QUERYLANE_HTTP_PORT":          "9090", // legacy nesting keeps working
	})

	cm, err := config.NewConfigManager(context.Background(), &Config{}, config.WithConfigFile(configFile))
	require.NoError(t, err)

	t.Cleanup(cm.Stop)

	cfg := cm.CurrentConfig()
	require.NotNil(t, cfg.Database)
	assert.Equal(t, "require", cfg.Database.SSLMode,
		"QUERYLANE_DATABASE__SSL_MODE must map to database.ssl_mode")
	assert.False(t, cfg.HTTP.AccessLogEnabled(),
		"QUERYLANE_HTTP__ACCESS_LOG must map to http.access_log")
	assert.Equal(t, 9090, cfg.HTTP.Port)
}
