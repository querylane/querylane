package config_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

// SimpleTestConfig is a minimal test configuration to avoid complex dependencies.
type SimpleTestConfig struct {
	Name    string `koanf:"name"`
	Version string `koanf:"version"`
	Port    int    `koanf:"port"`
	Debug   bool   `koanf:"debug"`

	validateCalled          bool
	onLoadingCompleteCalled bool
}

// NewSimpleTestConfig creates a simple test configuration.
func NewSimpleTestConfig() *SimpleTestConfig {
	cfg := &SimpleTestConfig{}
	cfg.SetDefaults()

	return cfg
}

func (c *SimpleTestConfig) SetDefaults() {
	c.Name = "simple-app"
	c.Version = "1.0.0"
	c.Port = 8080
	c.Debug = true
}

func (c *SimpleTestConfig) Validate() error {
	c.validateCalled = true
	if c.Name == "" {
		return errors.New("name cannot be empty")
	}

	if c.Version == "" {
		return errors.New("version cannot be empty")
	}

	if c.Port <= 0 {
		return errors.New("port must be positive")
	}

	return nil
}

func (c *SimpleTestConfig) OnLoadingComplete(_ context.Context) {
	c.onLoadingCompleteCalled = true
}

// ValidationCalled returns whether Validate() was called.
func (c *SimpleTestConfig) ValidationCalled() bool {
	return c.validateCalled
}

// OnLoadingCompleteWasCalled returns whether OnLoadingComplete() was called.
func (c *SimpleTestConfig) OnLoadingCompleteWasCalled() bool {
	return c.onLoadingCompleteCalled
}

func TestLoader_DefaultsOnly(t *testing.T) {
	t.Parallel()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	result, err := loader.Load(context.Background(), config.Struct{Value: defaultCfg})

	require.NoError(t, err)
	assert.Equal(t, "simple-app", result.Name)
	assert.Equal(t, "1.0.0", result.Version)
	assert.Equal(t, 8080, result.Port)
	assert.True(t, result.ValidationCalled())
	assert.True(t, result.OnLoadingCompleteWasCalled())
}

func TestLoader_FileOverridesDefaults(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name: custom-app
port: 9090
`, "test.yaml")
	defer cleanup()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	result, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile))

	require.NoError(t, err)
	assert.Equal(t, "custom-app", result.Name)
	assert.Equal(t, 9090, result.Port)
	assert.Equal(t, "1.0.0", result.Version) // default preserved
}

func TestLoader_EnvOverridesFile(t *testing.T) { //nolint:paralleltest // Test modifies environment variables
	// Cannot use t.Parallel() when using t.Setenv
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: file-app
port: 9090
`, "test.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_NAME": "env-app",
	})

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	result, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile),
		config.Env("QUERYLANE_"))

	require.NoError(t, err)
	assert.Equal(t, "env-app", result.Name) // env wins
	assert.Equal(t, 9090, result.Port)      // file wins over defaults
}

func TestLoader_ValidationError(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name: ""  # invalid - empty name
port: -1  # invalid - negative port
`, "test.yaml")
	defer cleanup()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	_, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid configuration")
}

func TestLoader_UnknownKeyRejected(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name: test-app
unknown_field: should-fail
`, "test.yaml")
	defer cleanup()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	_, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmarshal")
}

func TestLoader_UnknownEnvKeyRejected(t *testing.T) { //nolint:paralleltest // Test modifies environment variables
	// Cannot use t.Parallel() when using t.Setenv
	configFile, cleanup := config.CreateTempConfigFile(t, `
name: test-app
`, "test.yaml")
	defer cleanup()

	config.SetEnvVars(t, map[string]string{
		"QUERYLANE_NAME":          "env-app",
		"QUERYLANE_UNKNOWN_FIELD": "should-fail", // This should cause failure
	})

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	_, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile),
		config.Env("QUERYLANE_"))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "unmarshal")
}

func TestLoader_JSONParsing(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `{
  "name": "json-app",
  "port": 8888,
  "debug": false
}`, "config.json")
	defer cleanup()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	result, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile))

	require.NoError(t, err)
	assert.Equal(t, "json-app", result.Name)
	assert.Equal(t, 8888, result.Port)
	assert.False(t, result.Debug)
}

func TestLoader_TOMLParsing(t *testing.T) {
	t.Parallel()

	configFile, cleanup := config.CreateTempConfigFile(t, `
name = "toml-app"
port = 7777
debug = false
`, "config.toml")
	defer cleanup()

	loader := config.NewLoader[*SimpleTestConfig]()
	defaultCfg := NewSimpleTestConfig()

	result, err := loader.Load(context.Background(),
		config.Struct{Value: defaultCfg},
		config.File(configFile))

	require.NoError(t, err)
	assert.Equal(t, "toml-app", result.Name)
	assert.Equal(t, 7777, result.Port)
	assert.False(t, result.Debug)
}
