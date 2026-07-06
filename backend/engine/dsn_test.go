package engine

import (
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
)

var testPasswordEnvMu sync.Mutex

func TestConfigToDSN(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		config   *api.PostgresConfig
		expected string
	}{
		{
			name:     "nil config",
			config:   nil,
			expected: "",
		},
		{
			name:     "empty config",
			config:   &api.PostgresConfig{},
			expected: "",
		},
		{
			name: "complete config",
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				Password: "testpass",
				SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
			},
			expected: "postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable&client_encoding=UTF8&connect_timeout=10&application_name=querylane",
		},
		{
			name: "ssl mode prefer",
			config: &api.PostgresConfig{
				Host:     "db.example.com",
				Port:     5432,
				Database: "proddb",
				Username: "produser",
				Password: "prodpass",
				SslMode:  api.PostgresConfig_SSL_MODE_PREFER,
			},
			expected: "postgres://produser:prodpass@db.example.com:5432/proddb?sslmode=prefer&client_encoding=UTF8&connect_timeout=10&application_name=querylane",
		},
		{
			name: "direct ssl negotiation",
			config: &api.PostgresConfig{
				Host:           "db.example.com",
				Port:           5432,
				Database:       "proddb",
				Username:       "produser",
				Password:       "prodpass",
				SslMode:        api.PostgresConfig_SSL_MODE_REQUIRE,
				SslNegotiation: api.PostgresConfig_SSL_NEGOTIATION_DIRECT,
			},
			expected: "postgres://produser:prodpass@db.example.com:5432/proddb?sslmode=require&client_encoding=UTF8&connect_timeout=10&application_name=querylane&sslnegotiation=direct",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := ConfigToDSN(tt.config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestConfigToDSN_SSLNegotiationDirectParsesWithPGX(t *testing.T) {
	t.Parallel()

	dsn := ConfigToDSN(&api.PostgresConfig{
		Host:           "db.example.com",
		Port:           5432,
		Database:       "proddb",
		Username:       "produser",
		Password:       "prodpass",
		SslMode:        api.PostgresConfig_SSL_MODE_REQUIRE,
		SslNegotiation: api.PostgresConfig_SSL_NEGOTIATION_DIRECT,
	})

	config, err := pgconn.ParseConfig(dsn)
	require.NoError(t, err)
	assert.Equal(t, "direct", config.SSLNegotiation)
	assert.Empty(t, config.RuntimeParams["sslnegotiation"])
}

func TestConfigToDSN_IPv6(t *testing.T) {
	t.Parallel()

	config := &api.PostgresConfig{
		Host:     "::1",
		Port:     5432,
		Database: "testdb",
		Username: "testuser",
		Password: "testpass",
		SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
	}

	result := ConfigToDSN(config)
	assert.Contains(t, result, "[::1]:5432")
}

func TestConfigToDSN_AllSSLModes(t *testing.T) {
	t.Parallel()

	sslModes := map[api.PostgresConfig_SslMode]string{
		api.PostgresConfig_SSL_MODE_DISABLED:    "disable",
		api.PostgresConfig_SSL_MODE_ALLOW:       "allow",
		api.PostgresConfig_SSL_MODE_PREFER:      "prefer",
		api.PostgresConfig_SSL_MODE_REQUIRE:     "require",
		api.PostgresConfig_SSL_MODE_VERIFY_CA:   "verify-ca",
		api.PostgresConfig_SSL_MODE_VERIFY_FULL: "verify-full",
		api.PostgresConfig_SSL_MODE_UNSPECIFIED: "prefer",
	}

	for sslMode, expectedStr := range sslModes {
		t.Run(sslMode.String(), func(t *testing.T) {
			t.Parallel()

			config := &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				Password: "testpass",
				SslMode:  sslMode,
			}

			result := ConfigToDSN(config)
			assert.Contains(t, result, "sslmode="+expectedStr)
		})
	}
}

func TestIntegrationConfigToDSN_WithEmbeddedPostgres(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	config := &api.PostgresConfig{
		Host:     "localhost",
		Port:     int32(testDB.Port()),
		Database: "postgres",
		Username: "postgres",
		Password: "postgres",
		SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
	}

	result := ConfigToDSN(config)
	expected := fmt.Sprintf("postgres://postgres:postgres@localhost:%d/postgres?sslmode=disable&client_encoding=UTF8&connect_timeout=10&application_name=querylane", testDB.Port())
	require.Equal(t, expected, result)
}

func TestConfigToDSNWithSecretResolver(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		setup         func(t *testing.T)
		config        *api.PostgresConfig
		expected      string
		errorContains string
	}{
		{
			name: "env password source",
			setup: func(t *testing.T) {
				t.Helper()
				setTestPasswordEnv(t, "QUERYLANE_TEST_PASSWORD", "from-env")
			},
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Env{Env: "QUERYLANE_TEST_PASSWORD"},
				},
				SslMode: api.PostgresConfig_SSL_MODE_DISABLED,
			},
			expected: "postgres://testuser:from-env@localhost:5432/testdb?sslmode=disable&client_encoding=UTF8&connect_timeout=10&application_name=querylane",
		},

		{
			name: "inline password source overrides legacy password",
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				Password: "legacy-password",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Inline{Inline: "inline-password"},
				},
				SslMode: api.PostgresConfig_SSL_MODE_DISABLED,
			},
			expected: "postgres://testuser:inline-password@localhost:5432/testdb?sslmode=disable&client_encoding=UTF8&connect_timeout=10&application_name=querylane",
		},
		{
			name: "missing env password source returns clear error",
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Env{Env: "QUERYLANE_MISSING_TEST_PASSWORD"},
				},
				SslMode: api.PostgresConfig_SSL_MODE_DISABLED,
			},
			errorContains: "QUERYLANE_MISSING_TEST_PASSWORD",
		},
		{
			name: "empty env password source returns clear error",
			setup: func(t *testing.T) {
				t.Helper()
				setTestPasswordEnv(t, "QUERYLANE_EMPTY_TEST_PASSWORD", "")
			},
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Env{Env: "QUERYLANE_EMPTY_TEST_PASSWORD"},
				},
				SslMode: api.PostgresConfig_SSL_MODE_DISABLED,
			},
			errorContains: "set but empty",
		},
		{
			name: "unsupported ref",
			config: &api.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "testdb",
				Username: "testuser",
				PasswordSource: &api.SecretSource{
					Source: &api.SecretSource_Ref{Ref: "vault://database/prod/password"},
				},
				SslMode: api.PostgresConfig_SSL_MODE_DISABLED,
			},
			errorContains: "unsupported provider",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if tt.setup != nil {
				tt.setup(t)
			}

			result, err := ConfigToDSNWithSecretResolver(t.Context(), tt.config, LocalSecretResolver{})
			if tt.errorContains != "" {
				require.Error(t, err)
				assert.ErrorContains(t, err, tt.errorContains)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func setTestPasswordEnv(t *testing.T, key string, value string) {
	t.Helper()

	testPasswordEnvMu.Lock()
	t.Cleanup(testPasswordEnvMu.Unlock)

	previous, hadPrevious := os.LookupEnv(key)
	require.NoError(t, os.Setenv(key, value)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
	t.Cleanup(func() {
		if hadPrevious {
			require.NoError(t, os.Setenv(key, previous)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
			return
		}

		require.NoError(t, os.Unsetenv(key))
	})
}
