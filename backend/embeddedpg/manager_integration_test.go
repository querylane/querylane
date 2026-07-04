package embeddedpg

import (
	"database/sql"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register PostgreSQL driver.
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// findAvailablePort finds an available TCP port for testing.
func findAvailablePort(t *testing.T) int {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0") //nolint:noctx // Test helper, context not needed for port discovery
	require.NoError(t, err, "find available port")

	defer listener.Close()

	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	require.True(t, ok)

	return tcpAddr.Port
}

func TestIntegration_Manager_StartStop(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	port := findAvailablePort(t)
	dataPath := filepath.Join(t.TempDir(), "pgdata")

	mgr := NewManager(Config{
		Mode:                ModeEphemeral,
		DataPath:            dataPath,
		Port:                port,
		HealthCheckInterval: 50 * time.Millisecond,
	})

	t.Cleanup(func() {
		if err := mgr.Stop(t.Context()); err != nil {
			t.Logf("cleanup stop error: %v", err)
		}

		if mgr.Logs() != "" {
			t.Logf("postgres logs:\n%s", mgr.Logs())
		}
	})

	// Start.
	require.NoError(t, mgr.Start(t.Context()))

	// Verify we can connect and query.
	dsn := fmt.Sprintf(
		"host=127.0.0.1 port=%d user=%s password=%s dbname=%s sslmode=disable",
		port, dbUsername, dbPassword, dbName,
	)

	db, err := sql.Open("pgx", dsn)
	require.NoError(t, err)

	defer db.Close()

	var result int
	require.NoError(t, db.QueryRowContext(t.Context(), "SELECT 1").Scan(&result))
	assert.Equal(t, 1, result)

	// Health should become healthy within a few ticks.
	require.Eventually(t, func() bool {
		return mgr.Health() == HealthHealthy
	}, 5*time.Second, 25*time.Millisecond, "health should become healthy")

	// Stop.
	require.NoError(t, mgr.Stop(t.Context()))
	assert.Equal(t, HealthStopped, mgr.Health())
}

func TestIntegration_Manager_PersistentDataSurvivesRestart(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	port := findAvailablePort(t)
	dataPath := filepath.Join(t.TempDir(), "pgdata")

	mgr := NewManager(Config{
		Mode:                ModePersistent,
		DataPath:            dataPath,
		Port:                port,
		HealthCheckInterval: 50 * time.Millisecond,
	})

	// First start: create a table and insert data.
	require.NoError(t, mgr.Start(t.Context()))

	dsn := fmt.Sprintf(
		"host=127.0.0.1 port=%d user=%s password=%s dbname=%s sslmode=disable",
		port, dbUsername, dbPassword, dbName,
	)

	db, err := sql.Open("pgx", dsn)
	require.NoError(t, err)

	_, err = db.ExecContext(t.Context(), "CREATE TABLE test_persist (id int PRIMARY KEY)")
	require.NoError(t, err)

	_, err = db.ExecContext(t.Context(), "INSERT INTO test_persist (id) VALUES (42)")
	require.NoError(t, err)
	db.Close()

	// Stop.
	require.NoError(t, mgr.Stop(t.Context()))

	// Data dir should still exist.
	_, err = os.Stat(dataPath)
	require.NoError(t, err, "data directory should persist")

	// Second start on a fresh port: verify data survived.
	// A fresh port avoids an OS-level race where the previous postgres
	// process has exited but the TCP socket is still in TIME_WAIT.
	port2 := findAvailablePort(t)
	mgr2 := NewManager(Config{
		Mode:                ModePersistent,
		DataPath:            dataPath,
		Port:                port2,
		HealthCheckInterval: 50 * time.Millisecond,
	})

	t.Cleanup(func() {
		_ = mgr2.Stop(t.Context())
	})

	require.NoError(t, mgr2.Start(t.Context()))

	dsn2 := fmt.Sprintf(
		"host=127.0.0.1 port=%d user=%s password=%s dbname=%s sslmode=disable",
		port2, dbUsername, dbPassword, dbName,
	)

	db2, err := sql.Open("pgx", dsn2)
	require.NoError(t, err)

	defer db2.Close()

	var id int
	require.NoError(t, db2.QueryRowContext(t.Context(), "SELECT id FROM test_persist").Scan(&id))
	assert.Equal(t, 42, id)
}

func TestIntegration_Manager_EphemeralCleansUp(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	port := findAvailablePort(t)
	dataPath := filepath.Join(t.TempDir(), "pgdata")

	mgr := NewManager(Config{
		Mode:                ModeEphemeral,
		DataPath:            dataPath,
		Port:                port,
		HealthCheckInterval: 50 * time.Millisecond,
	})

	require.NoError(t, mgr.Start(t.Context()))

	// Verify data dir was created.
	_, err := os.Stat(dataPath)
	require.NoError(t, err, "data directory should exist while running")

	require.NoError(t, mgr.Stop(t.Context()))

	// Data dir should be gone after ephemeral stop.
	_, err = os.Stat(dataPath)
	assert.True(t, os.IsNotExist(err), "data directory should be removed in ephemeral mode")
}

func TestIntegration_Manager_DoubleStartFails(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	t.Parallel()

	port := findAvailablePort(t)
	dataPath := filepath.Join(t.TempDir(), "pgdata")

	mgr := NewManager(Config{
		Mode:                ModeEphemeral,
		DataPath:            dataPath,
		Port:                port,
		HealthCheckInterval: 50 * time.Millisecond,
	})

	t.Cleanup(func() {
		_ = mgr.Stop(t.Context())
	})

	require.NoError(t, mgr.Start(t.Context()))

	err := mgr.Start(t.Context())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already running")
}
