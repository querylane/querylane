package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

func TestInstanceConfig_SetDefaults(t *testing.T) {
	t.Parallel()

	t.Run("sets defaults when using individual fields", func(t *testing.T) {
		t.Parallel()

		cfg := &InstanceConfig{ID: "my-db", Host: "localhost"}
		cfg.SetDefaults()

		assert.Equal(t, "my-db", cfg.DisplayName)
		assert.Equal(t, 5432, cfg.Port)
		assert.Equal(t, "prefer", cfg.SSLMode)
		assert.Equal(t, "postgres", cfg.SSLNegotiation)
	})

	t.Run("preserves explicit values", func(t *testing.T) {
		t.Parallel()

		cfg := &InstanceConfig{
			ID:             "my-db",
			DisplayName:    "Custom Name",
			Host:           "localhost",
			Port:           5433,
			SSLMode:        "require",
			SSLNegotiation: "direct",
		}
		cfg.SetDefaults()

		assert.Equal(t, "Custom Name", cfg.DisplayName)
		assert.Equal(t, 5433, cfg.Port)
		assert.Equal(t, "require", cfg.SSLMode)
		assert.Equal(t, "direct", cfg.SSLNegotiation)
	})

	t.Run("skips connection defaults when dsn source is configured", func(t *testing.T) {
		t.Parallel()

		cfg := &InstanceConfig{ID: "my-db", DSN: "postgres://u:p@h:1234/d"}
		cfg.SetDefaults()

		assert.Equal(t, "my-db", cfg.DisplayName)
		assert.Zero(t, cfg.Port)
		assert.Empty(t, cfg.SSLMode)
	})
}

func TestInstanceConfig_Validate(t *testing.T) {
	t.Parallel()

	validConfig := func() *InstanceConfig {
		return &InstanceConfig{
			ID:             "my-db",
			Host:           "localhost",
			Port:           5432,
			Database:       "mydb",
			Username:       "admin",
			Password:       "secret",
			SSLMode:        "prefer",
			SSLNegotiation: "postgres",
		}
	}

	t.Run("valid config passes", func(t *testing.T) {
		t.Parallel()
		require.NoError(t, validConfig().Validate())
	})

	t.Run("missing host", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.Host = ""
		assert.ErrorContains(t, cfg.Validate(), "host is required")
	})

	t.Run("missing database", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.Database = ""
		assert.ErrorContains(t, cfg.Validate(), "database name is required")
	})

	t.Run("missing username", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.Username = ""
		assert.ErrorContains(t, cfg.Validate(), "username is required")
	})

	t.Run("missing password", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.Password = ""
		assert.ErrorContains(t, cfg.Validate(), "password is required")
	})

	t.Run("invalid ssl mode", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.SSLMode = "bogus"
		assert.ErrorContains(t, cfg.Validate(), "invalid ssl_mode")
	})

	t.Run("invalid ssl negotiation", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.SSLNegotiation = "bogus"
		assert.ErrorContains(t, cfg.Validate(), "invalid ssl_negotiation")
	})

	t.Run("direct ssl negotiation requires require or stronger ssl mode", func(t *testing.T) {
		t.Parallel()

		cfg := validConfig()
		cfg.SSLMode = "prefer"
		cfg.SSLNegotiation = "direct"
		assert.ErrorContains(t, cfg.Validate(), "requires ssl_mode require")
	})

	t.Run("valid dsn passes without individual fields", func(t *testing.T) {
		t.Parallel()

		cfg := &InstanceConfig{
			ID:  "my-db",
			DSN: "postgres://admin:secret@localhost:5432/mydb",
		}
		require.NoError(t, cfg.Validate())
	})
}

// Not t.Parallel because subtests mutate process env.
func TestInstanceConfig_ResolveSecrets(t *testing.T) {
	t.Run("password_env takes precedence over inline", func(t *testing.T) {
		t.Setenv("TEST_INSTANCE_PASSWORD", "from-env")

		cfg := &InstanceConfig{
			Password:    "inline",
			PasswordEnv: "TEST_INSTANCE_PASSWORD",
		}

		require.NoError(t, cfg.ResolveSecrets())
		assert.Equal(t, "from-env", cfg.EffectivePassword())
		assert.Equal(t, "inline", cfg.Password)
	})

	t.Run("inline password is used when no env is configured", func(t *testing.T) { //nolint:paralleltest // parent uses t.Setenv
		cfg := &InstanceConfig{Password: "inline"}
		require.NoError(t, cfg.ResolveSecrets())
		assert.Equal(t, "inline", cfg.EffectivePassword())
	})

	t.Run("errors when password env variable is not set", func(t *testing.T) { //nolint:paralleltest // parent uses t.Setenv
		cfg := &InstanceConfig{PasswordEnv: "SURELY_NOT_SET_ABCXYZ"}
		assert.ErrorContains(t, cfg.ResolveSecrets(), "environment variable")
	})

	t.Run("dsn_env resolves and populates effective fields", func(t *testing.T) {
		t.Setenv("TEST_INSTANCE_DSN", "postgres://admin:secret@remotehost:5432/prod?sslmode=require&sslnegotiation=direct")

		cfg := &InstanceConfig{DSNEnv: "TEST_INSTANCE_DSN"}
		require.NoError(t, cfg.ResolveSecrets())
		assert.Equal(t, "postgres://admin:secret@remotehost:5432/prod?sslmode=require&sslnegotiation=direct", cfg.EffectiveDSN())
		assert.Equal(t, "remotehost", cfg.EffectiveHost())
		assert.Equal(t, 5432, cfg.EffectivePort())
		assert.Equal(t, "prod", cfg.EffectiveDatabase())
		assert.Equal(t, "admin", cfg.EffectiveUsername())
		assert.Equal(t, "secret", cfg.EffectivePassword())
		assert.Equal(t, "require", cfg.EffectiveSSLMode())
		assert.Equal(t, "direct", cfg.EffectiveSSLNegotiation())
	})

	t.Run("empty dsn_env errors instead of falling back", func(t *testing.T) {
		t.Setenv("TEST_INSTANCE_DSN_EMPTY", "")

		cfg := &InstanceConfig{
			DSN:    "postgres://inline:inline@inline:5432/db",
			DSNEnv: "TEST_INSTANCE_DSN_EMPTY",
		}

		require.ErrorContains(t, cfg.ResolveSecrets(), "set but empty")
		assert.Empty(t, cfg.EffectiveDSN())
	})

	t.Run("password env is skipped when dsn is active", func(t *testing.T) { //nolint:paralleltest // parent uses t.Setenv
		cfg := &InstanceConfig{
			DSN:         "postgres://u:p@h:5432/d",
			PasswordEnv: "SURELY_NOT_SET_ABCXYZ",
		}

		require.NoError(t, cfg.ResolveSecrets())
		assert.Equal(t, "p", cfg.EffectivePassword())
	})
}

func TestConfig_InstanceValidation(t *testing.T) {
	t.Parallel()

	newInstance := func(id, password string) *InstanceConfig {
		return &InstanceConfig{
			ID:       id,
			Host:     "localhost",
			Port:     5432,
			Database: "db",
			Username: "u",
			Password: password,
		}
	}

	t.Run("rejects invalid instance IDs", func(t *testing.T) {
		t.Parallel()

		invalid := []string{"foo/bar", "prod.db", "1starts-with-digit", "has space", "", "-leading-dash"}
		for _, id := range invalid {
			cfg := &Config{Instances: []*InstanceConfig{newInstance(id, "p")}}
			cfg.SetDefaults()
			assert.Error(t, cfg.Validate(), "instance ID %q should be rejected", id)
		}
	})

	t.Run("accepts valid instance IDs", func(t *testing.T) {
		t.Parallel()

		valid := []string{"prod", "my-db", "staging_01", "a", "myDB"}
		for _, id := range valid {
			cfg := &Config{Instances: []*InstanceConfig{newInstance(id, "p")}}
			cfg.SetDefaults()
			assert.NoError(t, cfg.Validate(), "instance ID %q should be accepted", id)
		}
	})

	t.Run("rejects duplicate instance IDs", func(t *testing.T) {
		t.Parallel()

		cfg := &Config{
			Instances: []*InstanceConfig{
				newInstance("prod", "p"),
				newInstance("prod", "p"),
			},
		}
		cfg.SetDefaults()
		assert.ErrorContains(t, cfg.Validate(), "duplicate instance ID")
	})

	t.Run("applies instance defaults during validation", func(t *testing.T) {
		t.Parallel()

		cfg := &Config{}
		cfg.SetDefaults()
		cfg.Instances = []*InstanceConfig{{
			ID:       "my-db",
			Host:     "localhost",
			Database: "mydb",
			Username: "admin",
			Password: "secret",
		}}

		require.NoError(t, cfg.Validate())
		assert.Equal(t, 5432, cfg.Instances[0].Port)
		assert.Equal(t, "prefer", cfg.Instances[0].SSLMode)
	})
}

func TestConfig_MarshalYAMLRoundTripWithInstances(t *testing.T) {
	t.Setenv("TEST_INSTANCE_PASSWORD", "from-env")

	cfg := &Config{
		Instances: []*InstanceConfig{{
			ID:          "prod",
			DisplayName: "Production",
			Host:        "prod.example.com",
			Port:        5432,
			Database:    "myapp",
			Username:    "admin",
			PasswordEnv: "TEST_INSTANCE_PASSWORD",
			Labels:      map[string]string{"env": "production"},
		}},
	}
	cfg.SetDefaults()

	data, err := config.MarshalYAML(cfg)
	require.NoError(t, err)

	yamlStr := string(data)
	assert.Contains(t, yamlStr, "display_name: Production")
	assert.Contains(t, yamlStr, "password_env: TEST_INSTANCE_PASSWORD")
	assert.NotContains(t, yamlStr, "postgresconnection")
	assert.NotContains(t, yamlStr, "displayname")

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, data, 0o600))

	defaults := &Config{}
	defaults.SetDefaults()

	manager, err := config.NewConfigManager(context.Background(), defaults, config.WithConfigFile(configPath))
	require.NoError(t, err)

	defer manager.Stop()

	loaded := manager.CurrentConfig()
	require.Len(t, loaded.Instances, 1)
	assert.Equal(t, "Production", loaded.Instances[0].DisplayName)
	assert.Equal(t, "prod.example.com", loaded.Instances[0].Host)
	assert.Equal(t, "from-env", loaded.Instances[0].EffectivePassword())
}
