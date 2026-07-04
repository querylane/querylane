package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Not t.Parallel because subtests mutate process env.
func TestResolveSecret(t *testing.T) {
	t.Run("resolves from env", func(t *testing.T) {
		t.Setenv("TEST_SECRET_ENV", "from-env")

		val, err := resolveSecret("TEST_SECRET_ENV")
		require.NoError(t, err)
		assert.Equal(t, "from-env", val)
	})

	t.Run("returns empty when env name is empty", func(t *testing.T) { //nolint:paralleltest // parent uses t.Setenv
		val, err := resolveSecret("")
		require.NoError(t, err)
		assert.Empty(t, val)
	})

	t.Run("errors when env is missing", func(t *testing.T) { //nolint:paralleltest // parent uses t.Setenv
		_, err := resolveSecret("SURELY_NOT_SET_ABCXYZ")
		assert.ErrorContains(t, err, "environment variable")
	})

	t.Run("errors when env is empty", func(t *testing.T) {
		t.Setenv("TEST_SECRET_EMPTY", "")

		_, err := resolveSecret("TEST_SECRET_EMPTY")
		assert.ErrorContains(t, err, "set but empty")
	})
}

func TestHasDSNSource(t *testing.T) {
	t.Parallel()

	assert.False(t, hasDSNSource("", ""))
	assert.True(t, hasDSNSource("postgres://u:p@h:5432/d", ""))
	assert.True(t, hasDSNSource("", "DATABASE_URL"))
}

func TestValidateSSLMode(t *testing.T) {
	t.Parallel()

	for _, mode := range []string{"", "disable", "allow", "prefer", "require", "verify-ca", "verify-full"} {
		require.NoError(t, validateSSLMode(mode), "ssl_mode %q should be accepted", mode)
	}

	require.ErrorContains(t, validateSSLMode("bogus"), "invalid ssl_mode")
}
