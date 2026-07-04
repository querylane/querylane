package embeddedpg

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfig_SetDefaults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    Config
		validate func(t *testing.T, c Config)
	}{
		{
			name:  "all zero values get defaults",
			input: Config{},
			validate: func(t *testing.T, c Config) {
				t.Helper()
				assert.Equal(t, ModePersistent, c.Mode)
				assert.Equal(t, 5433, c.Port)
				assert.Equal(t, 10*time.Second, c.HealthCheckInterval)

				home, err := os.UserHomeDir()
				require.NoError(t, err)
				assert.Equal(t, filepath.Join(home, ".querylane", "pgdata"), c.DataPath)
			},
		},
		{
			name: "explicit values are preserved",
			input: Config{
				Mode:                ModeEphemeral,
				DataPath:            "/custom/path",
				Port:                9999,
				HealthCheckInterval: 30 * time.Second,
			},
			validate: func(t *testing.T, c Config) {
				t.Helper()
				assert.Equal(t, ModeEphemeral, c.Mode)
				assert.Equal(t, "/custom/path", c.DataPath)
				assert.Equal(t, 9999, c.Port)
				assert.Equal(t, 30*time.Second, c.HealthCheckInterval)
			},
		},
		{
			name: "partial values only fill gaps",
			input: Config{
				Mode: ModeEphemeral,
				Port: 5555,
			},
			validate: func(t *testing.T, c Config) {
				t.Helper()
				assert.Equal(t, ModeEphemeral, c.Mode)
				assert.Equal(t, 5555, c.Port)
				assert.Equal(t, 10*time.Second, c.HealthCheckInterval)
				assert.NotEmpty(t, c.DataPath)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := tt.input
			cfg.SetDefaults()
			tt.validate(t, cfg)
		})
	}
}

func TestConfig_Validate(t *testing.T) {
	t.Parallel()

	validConfig := func() Config {
		return Config{
			Mode:                ModePersistent,
			DataPath:            "/some/path",
			Port:                5433,
			HealthCheckInterval: 10 * time.Second,
		}
	}

	tests := []struct {
		name     string
		modify   func(c *Config)
		wantErr  bool
		errorMsg string
	}{
		{
			name:   "valid persistent config",
			modify: func(_ *Config) {},
		},
		{
			name: "valid ephemeral config",
			modify: func(c *Config) {
				c.Mode = ModeEphemeral
			},
		},
		{
			name: "invalid mode",
			modify: func(c *Config) {
				c.Mode = "unknown"
			},
			wantErr:  true,
			errorMsg: "invalid embedded mode",
		},
		{
			name: "empty data path",
			modify: func(c *Config) {
				c.DataPath = ""
			},
			wantErr:  true,
			errorMsg: "data_path is required",
		},
		{
			name: "port zero",
			modify: func(c *Config) {
				c.Port = 0
			},
			wantErr:  true,
			errorMsg: "port must be between 1 and 65535",
		},
		{
			name: "port too high",
			modify: func(c *Config) {
				c.Port = 70000
			},
			wantErr:  true,
			errorMsg: "port must be between 1 and 65535",
		},
		{
			name: "negative health check interval",
			modify: func(c *Config) {
				c.HealthCheckInterval = -1 * time.Second
			},
			wantErr:  true,
			errorMsg: "health_check_interval must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			cfg := validConfig()
			tt.modify(&cfg)
			err := cfg.Validate()

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
