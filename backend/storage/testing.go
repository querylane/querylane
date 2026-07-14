package storage

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/jackc/pgx/v5/stdlib" // Register PostgreSQL driver
)

// TestDB provides utilities for setting up embedded PostgreSQL for storage integration tests.
// This type is designed for testing any storage repository with real database instances.
//
// Usage:
//
//	testDB := storage.NewTestDB(t)
//	repo := storage.NewInstanceRepository(t.Context(), testDB.DB())
//	// Run tests with any repository...
//
// Each test function gets a completely fresh database with migrations applied.
// Cleanup is handled automatically via t.Cleanup().
type TestDB struct {
	db        *sql.DB
	port      uint32
	dbName    string
	logBuffer *bytes.Buffer // Captures PostgreSQL logs for debugging failed tests
}

type sharedTestPostgresServer struct {
	mu        sync.Mutex
	refs      int
	postgres  *embeddedpostgres.EmbeddedPostgres
	port      uint32
	tempDir   string
	logBuffer *bytes.Buffer
}

var (
	sharedTestPostgres sharedTestPostgresServer
	testDBCounter      atomic.Uint64
)

// NewTestDB creates a new isolated database for storage integration testing.
// Each test gets a completely isolated database with all migrations applied.
//
// The test database is automatically dropped when the test completes via t.Cleanup(),
// so no manual cleanup is required.
//
// Example:
//
//	func TestCreateResource(t *testing.T) {
//	    testDB := NewTestDB(t)
//	    repo, err := NewSomeRepository(testDB.DB())
//	    require.NoError(t, err)
//	    // ... test repository operations
//	}
//
// findAvailablePort finds an available port for testing.
func findAvailablePort(t *testing.T) uint32 {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0") //nolint:noctx // Test helper, context not needed for port discovery
	if err != nil {
		t.Fatalf("Failed to find available port: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr()

	tcpAddr, ok := addr.(*net.TCPAddr)
	if !ok {
		t.Fatalf("Expected TCP address, got %T", addr)
	}

	port := tcpAddr.Port
	if port < 0 || port > 65535 {
		t.Fatalf("Invalid port number: %d", port)
	}

	return uint32(port) //nolint:gosec // G115: port is validated to be 0-65535 above
}

func (s *sharedTestPostgresServer) acquire(t *testing.T) (uint32, *bytes.Buffer) {
	t.Helper()

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.refs == 0 {
		port := findAvailablePort(t)

		tempDir, err := os.MkdirTemp("", "querylane-test-postgres-*") //nolint:usetesting // Shared server outlives the acquiring test while parallel tests still hold refs.
		if err != nil {
			t.Fatalf("Failed to create temporary PostgreSQL directory: %v", err)
		}

		logBuffer := &bytes.Buffer{}

		var pgLogger io.Writer = logBuffer
		if os.Getenv("QUERYLANE_TEST_VERBOSE_DB") != "" {
			pgLogger = io.MultiWriter(logBuffer, os.Stderr)
		}

		postgres := embeddedpostgres.NewDatabase(
			embeddedpostgres.DefaultConfig().
				DataPath(filepath.Join(tempDir, "pgdata")).
				RuntimePath(filepath.Join(tempDir, "runtime")).
				Port(port).
				Logger(pgLogger))
		if err := postgres.Start(); err != nil {
			_ = os.RemoveAll(tempDir)

			t.Fatalf("Failed to start embedded postgres: %v", err)
		}

		s.postgres = postgres
		s.port = port
		s.tempDir = tempDir
		s.logBuffer = logBuffer
	}

	s.refs++

	return s.port, s.logBuffer
}

func (s *sharedTestPostgresServer) release() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.refs > 0 {
		s.refs--
	}

	if s.refs != 0 || s.postgres == nil {
		return
	}

	_ = s.postgres.Stop()
	_ = os.RemoveAll(s.tempDir)
	s.postgres = nil
	s.port = 0
	s.tempDir = ""
	s.logBuffer = nil
}

func nextTestDatabaseName() string {
	return fmt.Sprintf("test_%d", testDBCounter.Add(1))
}

// NewTestDB spins up an ephemeral database on a shared embeddedpostgres.EmbeddedPostgres server,
// applies goose migrations, and returns a handle torn down via t.Cleanup.
// It calls t.Skip when testing.Short() is enabled so storage integration tests
// stay out of unit/short test runs.
func NewTestDB(t *testing.T) *TestDB {
	t.Helper()

	if testing.Short() {
		t.Skip("skipping storage integration test in short mode")
	}

	port, logBuffer := sharedTestPostgres.acquire(t)
	dbName := nextTestDatabaseName()

	adminConnStr := fmt.Sprintf("host=localhost port=%d user=postgres password=postgres dbname=postgres sslmode=disable", port)

	adminDB, err := sql.Open("pgx", adminConnStr)
	if err != nil {
		sharedTestPostgres.release()
		t.Fatalf("Failed to connect to embedded postgres admin database: %v", err)
	}
	defer adminDB.Close()

	if err := adminDB.PingContext(t.Context()); err != nil {
		sharedTestPostgres.release()
		t.Fatalf("Failed to ping embedded postgres admin database: %v", err)
	}

	if _, err := adminDB.ExecContext(t.Context(), fmt.Sprintf(`CREATE DATABASE "%s"`, dbName)); err != nil {
		sharedTestPostgres.release()
		t.Fatalf("Failed to create test database %q: %v", dbName, err)
	}

	connStr := fmt.Sprintf("host=localhost port=%d user=postgres password=postgres dbname=%s sslmode=disable", port, dbName)

	db, err := sql.Open("pgx", connStr)
	if err != nil {
		if dropErr := dropTestDatabase(t.Context(), port, dbName); dropErr != nil {
			t.Logf("Failed to drop test database %q after connection failure: %v", dbName, dropErr)
		}

		sharedTestPostgres.release()
		t.Fatalf("Failed to connect to embedded postgres: %v", err)
	}

	if err := db.PingContext(t.Context()); err != nil {
		_ = db.Close()

		if dropErr := dropTestDatabase(t.Context(), port, dbName); dropErr != nil {
			t.Logf("Failed to drop test database %q after ping failure: %v", dbName, dropErr)
		}

		sharedTestPostgres.release()
		t.Fatalf("Failed to ping embedded postgres: %v", err)
	}

	if _, err := MigrateDB(t.Context(), db); err != nil {
		_ = db.Close()

		if dropErr := dropTestDatabase(t.Context(), port, dbName); dropErr != nil {
			t.Logf("Failed to drop test database %q after migration failure: %v", dbName, dropErr)
		}

		sharedTestPostgres.release()
		t.Fatalf("Failed to apply migrations: %v", err)
	}

	testDB := &TestDB{
		db:        db,
		port:      port,
		dbName:    dbName,
		logBuffer: logBuffer,
	}

	t.Cleanup(func() {
		if t.Failed() && logBuffer != nil && logBuffer.Len() > 0 {
			t.Logf("PostgreSQL logs (test failed):\n%s", logBuffer.String())
		}

		testDB.Close()
	})

	return testDB
}

func dropTestDatabase(ctx context.Context, port uint32, dbName string) error {
	adminConnStr := fmt.Sprintf("host=localhost port=%d user=postgres password=postgres dbname=postgres sslmode=disable", port)

	adminDB, err := sql.Open("pgx", adminConnStr)
	if err != nil {
		return err
	}
	defer adminDB.Close()

	_, _ = adminDB.ExecContext(ctx, `
		SELECT pg_terminate_backend(pid)
		FROM pg_stat_activity
		WHERE datname = $1 AND pid <> pg_backend_pid()
	`, dbName)
	_, err = adminDB.ExecContext(ctx, fmt.Sprintf(`DROP DATABASE IF EXISTS "%s"`, dbName))

	return err
}

// DB returns the database connection for this test instance.
// This connection has all migrations applied and is ready for repository operations.
func (tdb *TestDB) DB() *sql.DB {
	return tdb.db
}

// Port returns the port the embedded postgres is running on.
// This is primarily useful for debugging or advanced test scenarios.
func (tdb *TestDB) Port() uint32 {
	return tdb.port
}

// ShowLogs outputs the captured PostgreSQL logs to the test logger.
// This is useful for debugging test failures or when you need to see
// what PostgreSQL was doing during a test.
func (tdb *TestDB) ShowLogs(t *testing.T) {
	t.Helper()

	if tdb.logBuffer.Len() > 0 {
		t.Logf("PostgreSQL logs:\n%s", tdb.logBuffer.String())
	} else {
		t.Log("No PostgreSQL logs captured")
	}
}

// Close closes the database connection and drops the isolated test database.
// This is called automatically via t.Cleanup(), so manual calls are not required.
func (tdb *TestDB) Close() {
	if tdb.db != nil {
		_ = tdb.db.Close()
		tdb.db = nil
	}

	if tdb.dbName != "" {
		_ = dropTestDatabase(context.Background(), tdb.port, tdb.dbName)
		tdb.dbName = ""

		sharedTestPostgres.release()
	}
}

// TruncateAllTables truncates all user tables while preserving the schema.
// This is useful for cleaning up data between subtests within the same test function.
//
// Note: Most tests don't need this since each test function gets a fresh database.
// This is mainly useful for subtests that need to start with a clean slate.
//
// Example:
//
//	func TestMultipleOperations(t *testing.T) {
//	    testDB := NewTestDB(t)
//	    repo, _ := NewSomeRepository(testDB.DB())
//
//	    t.Run("First operation", func(t *testing.T) {
//	        // ... test logic
//	        testDB.TruncateAllTables(t) // Clean up for next subtest
//	    })
//
//	    t.Run("Second operation", func(t *testing.T) {
//	        // Starts with clean database
//	    })
//	}
func (tdb *TestDB) TruncateAllTables(t *testing.T) {
	t.Helper()

	// Get all table names (excluding system tables and migration history)
	rows, err := tdb.db.QueryContext(t.Context(), `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		  AND table_type = 'BASE TABLE'
		  AND table_name != 'goose_db_version'
	`)
	if err != nil {
		t.Fatalf("Failed to query table names: %v", err)
	}
	defer rows.Close()

	var tableNames []string

	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			t.Fatalf("Failed to scan table name: %v", err)
		}

		tableNames = append(tableNames, tableName)
	}

	if err := rows.Err(); err != nil {
		t.Fatalf("Error iterating table names: %v", err)
	}

	// Truncate all tables (with CASCADE to handle foreign key constraints)
	if len(tableNames) > 0 {
		truncateQuery := fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE",
			fmt.Sprintf(`"%s"`, tableNames[0]))

		var truncateQuerySb244 strings.Builder
		for i := 1; i < len(tableNames); i++ {
			fmt.Fprintf(&truncateQuerySb244, `, "%s"`, tableNames[i])
		}

		truncateQuery += truncateQuerySb244.String()

		if _, err := tdb.db.ExecContext(t.Context(), truncateQuery); err != nil {
			t.Fatalf("Failed to truncate tables: %v", err)
		}
	}
}

// ResetSequences resets all sequences in the database to start from 1.
// This ensures consistent ID generation across test runs when using auto-increment fields.
//
// Like TruncateAllTables, this is mainly useful for subtests that need predictable IDs.
func (tdb *TestDB) ResetSequences(t *testing.T) {
	t.Helper()

	// Get all sequences in the public schema
	rows, err := tdb.db.QueryContext(t.Context(), `
		SELECT sequence_name
		FROM information_schema.sequences
		WHERE sequence_schema = 'public'
	`)
	if err != nil {
		t.Fatalf("Failed to query sequence names: %v", err)
	}
	defer rows.Close()

	var sequenceNames []string

	for rows.Next() {
		var sequenceName string
		if err := rows.Scan(&sequenceName); err != nil {
			t.Fatalf("Failed to scan sequence name: %v", err)
		}

		sequenceNames = append(sequenceNames, sequenceName)
	}

	if err := rows.Err(); err != nil {
		t.Fatalf("Error iterating sequence names: %v", err)
	}

	// Reset each sequence to start from 1
	for _, seqName := range sequenceNames {
		if _, err := tdb.db.ExecContext(t.Context(), fmt.Sprintf(`ALTER SEQUENCE "%s" RESTART WITH 1`, seqName)); err != nil {
			t.Fatalf("Failed to reset sequence %s: %v", seqName, err)
		}
	}
}
