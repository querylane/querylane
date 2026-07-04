package config

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestConfig is a reusable test configuration struct for all tests.
type TestConfig struct {
	Name        string          `koanf:"name"`
	Version     string          `koanf:"version"`
	Environment string          `koanf:"environment"`
	Debug       bool            `koanf:"debug"`
	Database    *DatabaseConfig `koanf:"database"`
	Server      *ServerConfig   `koanf:"server"`
	Features    struct {
		EnableMetrics   bool `koanf:"enable_metrics"`
		EnableTracing   bool `koanf:"enable_tracing"`
		EnableProfiling bool `koanf:"enable_profiling"`
	} `koanf:"features"`
	validateCalled          bool `koanf:"-"`
	onLoadingCompleteCalled bool `koanf:"-"`
}

// NewTestConfig creates a default test configuration.
func NewTestConfig() *TestConfig {
	cfg := &TestConfig{}
	cfg.SetDefaults()

	return cfg
}

// SetDefaults populates the struct with sane defaults; called by NewTestConfig and the loader before file/env overlay.
func (tc *TestConfig) SetDefaults() {
	tc.Name = "test-app"
	tc.Version = "1.0.0"
	tc.Environment = "development"
	tc.Debug = true
	tc.Features.EnableMetrics = true
	tc.Features.EnableTracing = false
	tc.Features.EnableProfiling = false

	tc.Database = &DatabaseConfig{}
	tc.Database.SetDefaults()

	tc.Server = &ServerConfig{}
	tc.Server.SetDefaults()
}

// Validate enforces field invariants and records that the hook fired so
// tests can assert the loader actually invoked it.
func (tc *TestConfig) Validate() error {
	tc.validateCalled = true
	if tc.Name == "" {
		return errors.New("name cannot be empty")
	}

	if tc.Version == "" {
		return errors.New("version cannot be empty")
	}

	if tc.Environment == "" {
		return errors.New("environment cannot be empty")
	}

	if tc.Database != nil {
		if err := tc.Database.Validate(); err != nil {
			return fmt.Errorf("database config invalid: %w", err)
		}
	}

	if tc.Server != nil {
		if err := tc.Server.Validate(); err != nil {
			return fmt.Errorf("server config invalid: %w", err)
		}
	}

	return nil
}

// OnLoadingComplete is the loader's post-load hook; recorded so tests can
// assert ordering (it runs after Validate).
func (tc *TestConfig) OnLoadingComplete(ctx context.Context) {
	tc.onLoadingCompleteCalled = true

	if tc.Database != nil {
		tc.Database.OnLoadingComplete(ctx)
	}

	if tc.Server != nil {
		tc.Server.OnLoadingComplete(ctx)
	}
}

// DatabaseConfig is a nested test config.
type DatabaseConfig struct {
	Host                    string `koanf:"host"`
	Port                    int    `koanf:"port"`
	Username                string `koanf:"username"`
	Password                string `koanf:"password"` //nolint:gosec // G117: Password is a legitimate config field name
	MaxConnections          int    `koanf:"max_connections"`
	validateCalled          bool   `koanf:"-"`
	onLoadingCompleteCalled bool   `koanf:"-"`
}

// SetDefaults populates the struct with sane defaults; called by NewTestConfig and the loader before file/env overlay.
func (dc *DatabaseConfig) SetDefaults() {
	dc.Host = "localhost"
	dc.Port = 5432
	dc.Username = "testuser"
	dc.Password = "testpass"
	dc.MaxConnections = 10
}

// Validate enforces field invariants and records that the hook fired so
// tests can assert the loader actually invoked it.
func (dc *DatabaseConfig) Validate() error {
	dc.validateCalled = true
	if dc.Host == "" {
		return errors.New("database host cannot be empty")
	}

	if dc.Port <= 0 {
		return errors.New("database port must be positive")
	}

	if dc.MaxConnections <= 0 {
		return errors.New("max connections must be positive")
	}

	return nil
}

// OnLoadingComplete is the loader's post-load hook; recorded so tests can
// assert ordering (it runs after Validate).
func (dc *DatabaseConfig) OnLoadingComplete(_ context.Context) {
	dc.onLoadingCompleteCalled = true
}

// ServerConfig is another nested test config.
type ServerConfig struct {
	HTTP struct {
		Port         int  `koanf:"port"`
		EnableTLS    bool `koanf:"enable_tls"`
		ReadTimeout  int  `koanf:"read_timeout"`
		WriteTimeout int  `koanf:"write_timeout"`
	} `koanf:"http"`
	CORS struct {
		AllowedOrigins []string `koanf:"allowed_origins"`
		AllowedMethods []string `koanf:"allowed_methods"`
		AllowedHeaders []string `koanf:"allowed_headers"`
	} `koanf:"cors"`
	validateCalled          bool `koanf:"-"`
	onLoadingCompleteCalled bool `koanf:"-"`
}

// SetDefaults populates the struct with sane defaults; called by NewTestConfig and the loader before file/env overlay.
func (sc *ServerConfig) SetDefaults() {
	sc.HTTP.Port = 8080
	sc.HTTP.EnableTLS = false
	sc.HTTP.ReadTimeout = 30
	sc.HTTP.WriteTimeout = 30
	sc.CORS.AllowedOrigins = []string{"*"}
	sc.CORS.AllowedMethods = []string{"GET", "POST", "PUT", "DELETE"}
	sc.CORS.AllowedHeaders = []string{"Content-Type", "Authorization"}
}

// Validate enforces field invariants and records that the hook fired so
// tests can assert the loader actually invoked it.
func (sc *ServerConfig) Validate() error {
	sc.validateCalled = true
	if sc.HTTP.Port <= 0 {
		return errors.New("HTTP port must be positive")
	}

	if sc.HTTP.ReadTimeout <= 0 {
		return errors.New("read timeout must be positive")
	}

	if sc.HTTP.WriteTimeout <= 0 {
		return errors.New("write timeout must be positive")
	}

	if len(sc.CORS.AllowedOrigins) == 0 {
		return errors.New("at least one CORS origin must be specified")
	}

	return nil
}

// OnLoadingComplete is the loader's post-load hook; recorded so tests can
// assert ordering (it runs after Validate).
func (sc *ServerConfig) OnLoadingComplete(_ context.Context) {
	sc.onLoadingCompleteCalled = true
}

// Test helper functions

// CreateTempConfigFile creates a temporary config file with the given content.
func CreateTempConfigFile(t *testing.T, content, filename string) (string, func()) {
	t.Helper()

	tempDir := t.TempDir()

	configFile := filepath.Join(tempDir, filename)
	err := os.WriteFile(configFile, []byte(content), 0o600)
	require.NoError(t, err)

	cleanup := func() { os.RemoveAll(tempDir) }

	return configFile, cleanup
}

// SetEnvVars sets multiple environment variables for a test using t.Setenv (auto-cleanup).
func SetEnvVars(t *testing.T, envVars map[string]string) {
	t.Helper()

	for key, value := range envVars {
		t.Setenv(key, value)
	}
}

// AssertConfigState validates common configuration assertions.
func AssertConfigState(t *testing.T, config *TestConfig, expectedName, expectedVersion string) {
	t.Helper()

	require.Equal(t, expectedName, config.Name)
	require.Equal(t, expectedVersion, config.Version)
	require.True(t, config.validateCalled)
	require.True(t, config.onLoadingCompleteCalled)

	// Validate nested configs
	require.NotNil(t, config.Database)
	require.True(t, config.Database.validateCalled)
	require.True(t, config.Database.onLoadingCompleteCalled)

	require.NotNil(t, config.Server)
	require.True(t, config.Server.validateCalled)
	require.True(t, config.Server.onLoadingCompleteCalled)
}
