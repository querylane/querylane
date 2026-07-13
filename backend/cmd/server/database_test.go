package server

import (
	"testing"

	"github.com/stretchr/testify/require"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
)

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
