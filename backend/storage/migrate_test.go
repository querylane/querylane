package storage

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestMigrationsUseTransactionLocalTimeouts guards against a migration setting a
// session-level timeout. `SET statement_timeout`/`SET lock_timeout` persist on
// the pooled connection after the migration commits (goose wraps migrations in
// a transaction but the SET outlives it); `SET LOCAL` is transaction-scoped and
// must be used instead.
func TestMigrationsUseTransactionLocalTimeouts(t *testing.T) {
	t.Parallel()

	entries, err := fs.ReadDir(embedMigrations, "migrations")
	require.NoError(t, err)

	bareTimeoutSet := regexp.MustCompile(`(?im)^\s*SET\s+(statement_timeout|lock_timeout)\b`)

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		data, err := fs.ReadFile(embedMigrations, "migrations/"+entry.Name())
		require.NoError(t, err)

		assert.NotRegexpf(t, bareTimeoutSet, string(data),
			"migration %s sets a session-level timeout; use SET LOCAL so it doesn't leak onto the pooled connection",
			entry.Name())
	}
}

// TestIntegrationMigrationsDoNotLeakSessionTimeouts applies the migrations on a
// pinned single connection and verifies the session carries no leaked timeout
// afterwards. The application reuses the migration *sql.DB for normal queries,
// so a leaked statement_timeout/lock_timeout would cause sporadic failures for
// the first few minutes after install/upgrade.
func TestIntegrationMigrationsDoNotLeakSessionTimeouts(t *testing.T) {
	t.Parallel()

	// NewTestDB starts (and ref-counts) the shared server and gates on -short.
	port := NewTestDB(t).Port()
	dbName := nextTestDatabaseName()

	adminConnStr := fmt.Sprintf("host=localhost port=%d user=postgres password=postgres dbname=postgres sslmode=disable", port)
	adminDB, err := sql.Open("pgx", adminConnStr)
	require.NoError(t, err)

	defer adminDB.Close()

	_, err = adminDB.ExecContext(t.Context(), fmt.Sprintf(`CREATE DATABASE "%s"`, dbName))
	require.NoError(t, err)
	t.Cleanup(func() { _ = dropTestDatabase(context.Background(), port, dbName) })

	connStr := fmt.Sprintf("host=localhost port=%d user=postgres password=postgres dbname=%s sslmode=disable", port, dbName)
	db, err := sql.Open("pgx", connStr)
	require.NoError(t, err)

	defer db.Close()

	// Pin to one connection so the migration and the checks share a session
	// (goose uses a single connection for both the lock and the migrations).
	db.SetMaxOpenConns(1)

	_, err = MigrateDB(t.Context(), db)
	require.NoError(t, err)

	var statementTimeout, lockTimeout string
	require.NoError(t, db.QueryRowContext(t.Context(), "SHOW statement_timeout").Scan(&statementTimeout))
	require.NoError(t, db.QueryRowContext(t.Context(), "SHOW lock_timeout").Scan(&lockTimeout))

	assert.NotEqual(t, "5s", statementTimeout, "statement_timeout leaked from a migration into the pooled session")
	assert.NotEqual(t, "1s", lockTimeout, "lock_timeout leaked from a migration into the pooled session")
}

func TestIntegrationMigrationChainUpDownUp(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)

	// After NewTestDB, all up migrations have already been applied.
	provider, err := NewGooseProvider(testDB.DB())
	require.NoError(t, err)

	version, err := provider.GetDBVersion(t.Context())
	require.NoError(t, err)
	assert.Positive(t, version, "version should be greater than 0")

	latestVersion := version

	// Step down all the way to version 0.
	_, err = provider.DownTo(t.Context(), 0)
	require.NoError(t, err)

	downVersion, err := provider.GetDBVersion(t.Context())
	require.NoError(t, err)
	assert.Equal(t, int64(0), downVersion, "version should be 0 after full down migration")

	// Re-apply all up migrations.
	results, err := provider.Up(t.Context())
	require.NoError(t, err)
	assert.NotEmpty(t, results, "should have applied migrations")

	version, err = provider.GetDBVersion(t.Context())
	require.NoError(t, err)
	assert.Equal(t, latestVersion, version, "version after up-down-up should match original")
}

func TestIntegrationMigrateDBResult(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)

	// MigrateDB was already called by NewTestDB, so running it again should be a no-op.
	result, err := MigrateDB(t.Context(), testDB.DB())
	require.NoError(t, err)

	assert.Equal(t, 0, result.StepsApplied, "no steps should be applied on already-migrated DB")
	assert.Positive(t, result.EndVersion, "end version should be > 0")
}
