package server

import (
	"testing"
	"time"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
)

func TestDatabaseSetupErrorEventRedactsPostgresServerFields(t *testing.T) {
	t.Parallel()

	event := databaseSetupErrorEvent(dbsetup.StepConnecting, &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: "password for meta_user contains api_key=secret",
	})

	assert.Equal(t, dbsetup.StateFailed, event.State)
	assert.Contains(t, event.Error, pgerrcode.InvalidPassword)
	assert.NotContains(t, event.Error, "meta_user")
	assert.NotContains(t, event.Error, "api_key=secret")
}

func TestIntegrationBuildDatabasePersistsTokenCodecAcrossRestart(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "0123456789abcdef0123456789abcdef")

	testDB := storage.NewTestDB(t)

	var databaseName string
	require.NoError(t, testDB.DB().QueryRowContext(t.Context(), "SELECT current_database()").Scan(&databaseName))

	cfg := &serverconfig.Config{Database: &serverconfig.Database{
		Host:     "localhost",
		Port:     int(testDB.Port()),
		Database: databaseName,
		Username: "postgres",
		Password: "postgres",
		SSLMode:  "disable",
	}}

	first, err := buildDatabase(t.Context(), cfg, nil)
	require.NoError(t, err)

	pageToken, err := first.tokenCodec.Sign(
		engine.TokenKindReadRowsPage,
		&api.ReadRowsPageTokenPayload{Version: 1},
	)
	require.NoError(t, err)
	cellToken, err := first.tokenCodec.Sign(
		engine.TokenKindFullValueCell,
		&api.TableCellFullValueTokenPayload{Version: 1},
	)
	require.NoError(t, err)
	first.close()

	second, err := buildDatabase(t.Context(), cfg, nil)
	require.NoError(t, err)
	t.Cleanup(second.close)

	require.NoError(t, second.tokenCodec.Verify(
		engine.TokenKindReadRowsPage,
		pageToken,
		&api.ReadRowsPageTokenPayload{},
	))
	require.NoError(t, second.tokenCodec.Verify(
		engine.TokenKindFullValueCell,
		cellToken,
		&api.TableCellFullValueTokenPayload{},
	))
}

func TestPoolConfigFromLimits(t *testing.T) {
	t.Parallel()

	pool := poolConfigFromLimits(serverconfig.PostgresPoolLimits{
		MaxOpenConnections:    7,
		MaxIdleConnections:    1,
		IdleTimeout:           time.Minute,
		ConnectionMaxLifetime: time.Hour,
	})

	assert.Equal(t, 7, pool.MaxOpenConns)
	assert.Equal(t, 1, pool.MaxIdleConns)
	assert.Equal(t, time.Minute, pool.IdleTimeout)
	assert.Equal(t, time.Hour, pool.ConnMaxLifetime)
}
