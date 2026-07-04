package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedDatabase_SetDefaults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    EmbeddedDatabase
		validate func(t *testing.T, e EmbeddedDatabase)
	}{
		{
			name:  "all zero values get defaults",
			input: EmbeddedDatabase{},
			validate: func(t *testing.T, e EmbeddedDatabase) {
				t.Helper()
				assert.Equal(t, "persistent", e.Mode)
				assert.Equal(t, 5433, e.Port)
				assert.Equal(t, 10*time.Second, e.HealthCheckInterval)

				home, err := os.UserHomeDir()
				require.NoError(t, err)
				assert.Equal(t, filepath.Join(home, ".querylane", "pgdata"), e.DataPath)
			},
		},
		{
			name: "explicit values are preserved",
			input: EmbeddedDatabase{
				Mode:                "ephemeral",
				DataPath:            "/custom/path",
				Port:                9999,
				HealthCheckInterval: 30 * time.Second,
			},
			validate: func(t *testing.T, e EmbeddedDatabase) {
				t.Helper()
				assert.Equal(t, "ephemeral", e.Mode)
				assert.Equal(t, "/custom/path", e.DataPath)
				assert.Equal(t, 9999, e.Port)
				assert.Equal(t, 30*time.Second, e.HealthCheckInterval)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			e := tt.input
			e.SetDefaults()
			tt.validate(t, e)
		})
	}
}

func TestEmbeddedDatabase_Validate(t *testing.T) {
	t.Parallel()

	validEmbedded := func() EmbeddedDatabase {
		return EmbeddedDatabase{
			Mode:                "persistent",
			DataPath:            "/some/path",
			Port:                5433,
			HealthCheckInterval: 10 * time.Second,
		}
	}

	tests := []struct {
		name     string
		modify   func(e *EmbeddedDatabase)
		wantErr  bool
		errorMsg string
	}{
		{
			name:   "valid persistent",
			modify: func(_ *EmbeddedDatabase) {},
		},
		{
			name: "valid ephemeral",
			modify: func(e *EmbeddedDatabase) {
				e.Mode = "ephemeral"
			},
		},
		{
			name: "invalid mode",
			modify: func(e *EmbeddedDatabase) {
				e.Mode = "invalid"
			},
			wantErr:  true,
			errorMsg: "invalid embedded mode",
		},
		{
			name: "empty data path",
			modify: func(e *EmbeddedDatabase) {
				e.DataPath = ""
			},
			wantErr:  true,
			errorMsg: "data_path is required",
		},
		{
			name: "port zero",
			modify: func(e *EmbeddedDatabase) {
				e.Port = 0
			},
			wantErr:  true,
			errorMsg: "port must be between 1 and 65535",
		},
		{
			name: "port too high",
			modify: func(e *EmbeddedDatabase) {
				e.Port = 70000
			},
			wantErr:  true,
			errorMsg: "port must be between 1 and 65535",
		},
		{
			name: "negative health check interval",
			modify: func(e *EmbeddedDatabase) {
				e.HealthCheckInterval = -1 * time.Second
			},
			wantErr:  true,
			errorMsg: "health_check_interval must be positive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			e := validEmbedded()
			tt.modify(&e)
			err := e.Validate()

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestConfig_EmbeddedDatabaseMutualExclusivity(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		cfg      Config
		wantErr  bool
		errorMsg string
	}{
		{
			name: "only embedded is valid",
			cfg: Config{
				HTTP: HTTP{Host: "0.0.0.0", Port: 8080, CORS: CORS{AllowedOrigins: []string{"*"}}},
				Embedded: &EmbeddedDatabase{
					Mode:                "persistent",
					DataPath:            "/some/path",
					Port:                5433,
					HealthCheckInterval: 10 * time.Second,
				},
			},
		},
		{
			name: "only database is valid",
			cfg: Config{
				HTTP: HTTP{Host: "0.0.0.0", Port: 8080, CORS: CORS{AllowedOrigins: []string{"*"}}},
				Database: &Database{
					Host:     "localhost",
					Port:     5432,
					Database: "querylane",
					Username: "querylane",
				},
			},
		},
		{
			name: "neither is valid",
			cfg: Config{
				HTTP: HTTP{Host: "0.0.0.0", Port: 8080, CORS: CORS{AllowedOrigins: []string{"*"}}},
			},
		},
		{
			name: "both specified is invalid",
			cfg: Config{
				HTTP: HTTP{Host: "0.0.0.0", Port: 8080, CORS: CORS{AllowedOrigins: []string{"*"}}},
				Database: &Database{
					Host:     "localhost",
					Port:     5432,
					Database: "querylane",
					Username: "querylane",
				},
				Embedded: &EmbeddedDatabase{
					Mode:                "persistent",
					DataPath:            "/some/path",
					Port:                5433,
					HealthCheckInterval: 10 * time.Second,
				},
			},
			wantErr:  true,
			errorMsg: "cannot specify both",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := tt.cfg.Validate()

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
