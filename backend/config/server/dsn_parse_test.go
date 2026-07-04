package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDSN(t *testing.T) {
	t.Parallel()

	t.Run("parses postgres:// URL", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgres://admin:secret@dbhost:5433/mydb?sslmode=require")
		require.NoError(t, err)
		assert.Equal(t, "dbhost", fields.Host)
		assert.Equal(t, 5433, fields.Port)
		assert.Equal(t, "mydb", fields.Database)
		assert.Equal(t, "admin", fields.Username)
		assert.Equal(t, "secret", fields.Password)
		assert.Equal(t, "require", fields.SSLMode)
	})

	t.Run("parses postgresql:// URL", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgresql://user:pass@host:5432/db")
		require.NoError(t, err)
		assert.Equal(t, "host", fields.Host)
		assert.Equal(t, 5432, fields.Port)
		assert.Equal(t, "db", fields.Database)
		assert.Equal(t, "user", fields.Username)
		assert.Equal(t, "pass", fields.Password)
	})

	t.Run("defaults port to 5432 when not in URL", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgres://user:pass@host/db")
		require.NoError(t, err)
		assert.Equal(t, 5432, fields.Port)
	})

	t.Run("extracts sslmode from query params", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgres://u:p@h:5432/d?sslmode=verify-full")
		require.NoError(t, err)
		assert.Equal(t, "verify-full", fields.SSLMode)
	})

	t.Run("extracts sslnegotiation from query params", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgres://u:p@h:5432/d?sslmode=require&sslnegotiation=direct")
		require.NoError(t, err)
		assert.Equal(t, "require", fields.SSLMode)
		assert.Equal(t, "direct", fields.SSLNegotiation)
	})

	t.Run("empty sslmode when not in URL", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("postgres://u:p@h:5432/d")
		require.NoError(t, err)
		assert.Empty(t, fields.SSLMode)
	})

	t.Run("parses key=value format", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("host=myhost port=5433 dbname=mydb user=myuser password=mypass sslmode=require sslnegotiation=direct")
		require.NoError(t, err)
		assert.Equal(t, "myhost", fields.Host)
		assert.Equal(t, 5433, fields.Port)
		assert.Equal(t, "mydb", fields.Database)
		assert.Equal(t, "myuser", fields.Username)
		assert.Equal(t, "mypass", fields.Password)
		assert.Equal(t, "require", fields.SSLMode)
		assert.Equal(t, "direct", fields.SSLNegotiation)
	})

	t.Run("key=value defaults port to 5432", func(t *testing.T) {
		t.Parallel()

		fields, err := parseDSN("host=h dbname=d user=u")
		require.NoError(t, err)
		assert.Equal(t, 5432, fields.Port)
	})

	t.Run("error on unrecognized format", func(t *testing.T) {
		t.Parallel()

		_, err := parseDSN("not-a-valid-dsn")
		assert.ErrorContains(t, err, "invalid DSN format")
	})
}

func TestValidateDSN(t *testing.T) {
	t.Parallel()

	t.Run("valid postgres:// URL", func(t *testing.T) {
		t.Parallel()
		assert.NoError(t, validateDSN("postgres://user:pass@host:5432/db"))
	})

	t.Run("valid key=value", func(t *testing.T) {
		t.Parallel()
		assert.NoError(t, validateDSN("host=h user=u dbname=d"))
	})

	t.Run("rejects wrong scheme", func(t *testing.T) {
		t.Parallel()
		assert.ErrorContains(t, validateDSN("mysql://u:p@h/d"), "invalid DSN format")
	})

	t.Run("rejects missing host in URL", func(t *testing.T) {
		t.Parallel()
		assert.ErrorContains(t, validateDSN("postgres://u:p@/d"), "DSN missing host")
	})

	t.Run("rejects missing required key in key=value", func(t *testing.T) {
		t.Parallel()
		assert.ErrorContains(t, validateDSN("host=h dbname=d"), "DSN missing required key: user")
	})

	t.Run("rejects unrecognized format", func(t *testing.T) {
		t.Parallel()
		assert.ErrorContains(t, validateDSN("random-string"), "invalid DSN format")
	})

	t.Run("rejects direct ssl negotiation without required sslmode", func(t *testing.T) {
		t.Parallel()
		assert.ErrorContains(
			t,
			validateDSN("postgres://u:p@h:5432/d?sslmode=prefer&sslnegotiation=direct"),
			"requires ssl_mode require",
		)
	})
}
