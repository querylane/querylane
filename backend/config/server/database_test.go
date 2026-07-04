package server

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
)

const redactedMarker = "[REDACTED]"

func TestDatabase_Redacted(t *testing.T) {
	t.Parallel()

	t.Run("nil database", func(t *testing.T) {
		t.Parallel()
		assert.Equal(t, Database{}, (*Database)(nil).Redacted())
	})

	t.Run("redacts inline password", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Host:     "localhost",
			Port:     5432,
			Database: "mydb",
			Username: "user",
			Password: "supersecret",
			SSLMode:  "require",
		}

		redacted := db.Redacted()
		assert.Equal(t, redactedMarker, redacted.Password)
		assert.Equal(t, "localhost", redacted.Host)
		assert.NotContains(t, redacted.Password, "supersecret")
	})

	t.Run("redacts URL DSN", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			DSN: "postgresql://username:secretpassword@localhost:5432/dbname?sslmode=require",
		}

		redacted := db.Redacted()
		assert.Contains(t, redacted.DSN, redactedMarker)
		assert.NotContains(t, redacted.DSN, "secretpassword")
		assert.Contains(t, redacted.DSN, "localhost:5432")
		assert.Contains(t, redacted.DSN, "dbname")
	})

	t.Run("redacts key value DSN", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			DSN: "host=localhost port=5432 user=dbuser password=verysecret dbname=testdb sslmode=prefer",
		}

		redacted := db.Redacted()
		assert.Contains(t, redacted.DSN, "password=[REDACTED]")
		assert.NotContains(t, redacted.DSN, "verysecret")
	})

	t.Run("fully redacts malformed DSN", func(t *testing.T) {
		t.Parallel()

		db := &Database{DSN: "this-is-not-a-valid-dsn-but-might-contain-secrets"}
		assert.Equal(t, "[REDACTED_DSN]", db.Redacted().DSN)
	})
}

func TestDatabase_ToDSN(t *testing.T) {
	t.Parallel()

	t.Run("returns effective dsn when set", func(t *testing.T) {
		t.Parallel()

		db := &Database{DSN: "postgres://u:p@h:5432/d"}
		assert.Equal(t, "postgres://u:p@h:5432/d", db.ToDSN())
	})

	t.Run("builds dsn from individual fields", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Host:           "localhost",
			Port:           5432,
			Database:       "mydb",
			Username:       "admin",
			Password:       "secret",
			SSLMode:        "require",
			SSLNegotiation: "direct",
		}

		dsn := db.ToDSN()
		assert.Contains(t, dsn, "postgresql://")
		assert.Contains(t, dsn, "localhost:5432")
		assert.Contains(t, dsn, "/mydb")
		assert.Contains(t, dsn, "admin")
		assert.Contains(t, dsn, "sslmode=require")
		assert.Contains(t, dsn, "sslnegotiation=direct")
	})
}

// Not t.Parallel because the test mutates process env.
func TestDatabase_LoadedFromQuerylaneEnv(t *testing.T) {
	t.Setenv("QUERYLANE_DATABASE_DSN", "postgres://envuser:envpass@envhost:5432/envdb")

	defaultCfg := &Config{}
	defaultCfg.SetDefaults()

	loader := config.NewLoader[*Config]()
	cfg, err := loader.Load(
		context.Background(),
		config.Struct{Value: defaultCfg},
		config.Env("QUERYLANE_"),
	)
	require.NoError(t, err)

	require.NotNil(t, cfg.Database)
	assert.Equal(t, "postgres://envuser:envpass@envhost:5432/envdb", cfg.Database.DSN)
	assert.Equal(t, "postgres://envuser:envpass@envhost:5432/envdb", cfg.Database.EffectiveDSN())
}

func TestDatabase_Validate(t *testing.T) {
	t.Parallel()

	t.Run("valid dsn", func(t *testing.T) {
		t.Parallel()

		db := &Database{DSN: "postgres://user:pass@localhost:5432/mydb"}
		assert.NoError(t, db.Validate())
	})

	t.Run("valid individual fields", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Host:           "localhost",
			Port:           5432,
			Database:       "mydb",
			Username:       "user",
			Password:       "pass",
			SSLMode:        "prefer",
			SSLNegotiation: "postgres",
		}
		assert.NoError(t, db.Validate())
	})

	t.Run("missing host", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Port:     5432,
			Database: "mydb",
			Username: "user",
		}
		assert.ErrorContains(t, db.Validate(), "host is required")
	})

	t.Run("invalid ssl mode", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Host:     "localhost",
			Port:     5432,
			Database: "mydb",
			Username: "user",
			Password: "pass",
			SSLMode:  "bogus",
		}
		assert.ErrorContains(t, db.Validate(), "invalid ssl_mode")
	})

	t.Run("direct ssl negotiation requires require or stronger ssl mode", func(t *testing.T) {
		t.Parallel()

		db := &Database{
			Host:           "localhost",
			Port:           5432,
			Database:       "mydb",
			Username:       "user",
			Password:       "pass",
			SSLMode:        "allow",
			SSLNegotiation: "direct",
		}
		assert.ErrorContains(t, db.Validate(), "requires ssl_mode require")
	})
}
