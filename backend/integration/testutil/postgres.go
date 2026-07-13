package testutil

// This package provides testcontainer-based utilities for integration and e2e tests.
// For storage layer tests, use the embedded postgres utilities in storage/ instead.

import (
	"context"
	"crypto/md5" //nolint:gosec // G501: md5 used for test name hashing, not cryptographic purposes
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/querylane/querylane/backend/engine"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	// defaultPostgresImage is the newest supported major, exercising the PG18+
	// pg_stat_io read_bytes/write_bytes columns and the 14+ session counters.
	// Override with QUERYLANE_TEST_POSTGRES_IMAGE to run the suite against an
	// older major (e.g. postgres:14-alpine, postgres:16-alpine) so the
	// version-branching probe queries -- pg_stat_io op_bytes, absent session
	// counters -- get real coverage across the fleet we support.
	defaultPostgresImage = "postgres:18-alpine"
	postgresImageEnv     = "QUERYLANE_TEST_POSTGRES_IMAGE"
	containerDatabase    = "testdb"
	containerUsername    = "testuser"
	containerPassword    = "testpass"
)

// postgresImage returns the container image the integration suite runs
// against: QUERYLANE_TEST_POSTGRES_IMAGE when set, else defaultPostgresImage.
func postgresImage() string {
	if img := strings.TrimSpace(os.Getenv(postgresImageEnv)); img != "" {
		return img
	}

	return defaultPostgresImage
}

// PostgreSQLContainer wraps a testcontainers PostgreSQL instance with convenience methods.
type PostgreSQLContainer struct {
	container *postgres.PostgresContainer
}

// NewPostgreSQLContainer creates and starts a new PostgreSQL testcontainer.
// Defaults to the latest PostgreSQL 18 Alpine image; QUERYLANE_TEST_POSTGRES_IMAGE
// overrides it to run the suite against an older supported major.
func NewPostgreSQLContainer(ctx context.Context) (*PostgreSQLContainer, error) {
	return newPostgreSQLContainer(ctx)
}

// NewPostgreSQLContainerWithMaxConnections creates a PostgreSQL testcontainer
// with a deliberately small physical connection ceiling.
func NewPostgreSQLContainerWithMaxConnections(ctx context.Context, maxConnections int) (*PostgreSQLContainer, error) {
	return newPostgreSQLContainer(ctx, testcontainers.WithCmd(
		"postgres",
		"-c", "fsync=off",
		"-c", "max_connections="+strconv.Itoa(maxConnections),
	))
}

func newPostgreSQLContainer(ctx context.Context, extraOptions ...testcontainers.ContainerCustomizer) (*PostgreSQLContainer, error) {
	image := postgresImage()

	options := make([]testcontainers.ContainerCustomizer, 0, 4+len(extraOptions))
	options = append(options,
		postgres.WithDatabase(containerDatabase),
		postgres.WithUsername(containerUsername),
		postgres.WithPassword(containerPassword),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	options = append(options, extraOptions...)

	container, err := postgres.Run(ctx,
		image,
		options...,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to start PostgreSQL container %s: %w", image, err)
	}

	return &PostgreSQLContainer{
		container: container,
	}, nil
}

// RequirePostgreSQLContainerWithMaxConnections starts a low-capacity target
// and skips the test when Docker/Testcontainers is unavailable.
func RequirePostgreSQLContainerWithMaxConnections(ctx context.Context, t *testing.T, maxConnections int) *PostgreSQLContainer {
	t.Helper()

	testcontainers.SkipIfProviderIsNotHealthy(t)

	container, err := NewPostgreSQLContainerWithMaxConnections(ctx, maxConnections)
	if err != nil {
		t.Fatalf("failed to start low-connection PostgreSQL testcontainer: %v", err)
	}

	return container
}

// RequirePostgreSQLContainer skips the calling test when Docker/Testcontainers
// is unavailable, then starts a PostgreSQL testcontainer.
func RequirePostgreSQLContainer(ctx context.Context, t *testing.T) *PostgreSQLContainer {
	t.Helper()

	testcontainers.SkipIfProviderIsNotHealthy(t)

	container, err := NewPostgreSQLContainer(ctx)
	if err != nil {
		t.Fatalf("failed to start PostgreSQL testcontainer: %v", err)
	}

	return container
}

// ConnectionString returns the PostgreSQL connection string for this container.
func (c *PostgreSQLContainer) ConnectionString(ctx context.Context) (string, error) {
	return c.container.ConnectionString(ctx, "sslmode=disable")
}

// Host returns the host address of the PostgreSQL container.
func (c *PostgreSQLContainer) Host(ctx context.Context) (string, error) {
	return c.container.Host(ctx)
}

// MappedPort returns the mapped port of the PostgreSQL container.
func (c *PostgreSQLContainer) MappedPort(ctx context.Context) (string, error) {
	port, err := c.container.MappedPort(ctx, "5432")
	if err != nil {
		return "", err
	}

	return port.Port(), nil
}

// CreateDatabase creates a new database with the given name in this PostgreSQL instance.
// This allows multiple test suites to have isolated databases within the same container.
// The database will be ready for connections when this method returns successfully.
func (c *PostgreSQLContainer) CreateDatabase(ctx context.Context, dbName string) (string, error) {
	// Execute CREATE DATABASE command using psql directly in the container
	_, _, err := c.container.Exec(ctx, []string{
		"psql", "-U", containerUsername, "-d", containerDatabase, "-c", fmt.Sprintf("CREATE DATABASE %s;", dbName),
	})
	if err != nil {
		return "", fmt.Errorf("failed to create database %s: %w", dbName, err)
	}

	newConnString, err := c.databaseConnectionString(ctx, dbName, nil)
	if err != nil {
		return "", err
	}

	// Wait for database to be ready for connections
	db, err := sql.Open("pgx", newConnString)
	if err != nil {
		return "", fmt.Errorf("failed to open connection to new database %s: %w", dbName, err)
	}
	defer db.Close()

	err = c.waitForDatabaseReady(ctx, db, 5*time.Second)
	if err != nil {
		return "", fmt.Errorf("database %s not ready after creation: %w", dbName, err)
	}

	return newConnString, nil
}

// CreateDatabaseWithEncoding creates a new database with an explicit PostgreSQL
// server encoding and returns a UTF8-client connection string. The database
// uses the C locale so PostgreSQL accepts non-UTF-8 encodings in Alpine-based
// test containers.
func (c *PostgreSQLContainer) CreateDatabaseWithEncoding(ctx context.Context, dbName, encoding string) (string, error) {
	_, _, err := c.container.Exec(ctx, []string{
		"psql",
		"-U", containerUsername,
		"-d", containerDatabase,
		"-v", "ON_ERROR_STOP=1",
		"-c", fmt.Sprintf(
			"CREATE DATABASE %s WITH TEMPLATE template0 ENCODING %s LC_COLLATE 'C' LC_CTYPE 'C';",
			quoteSQLIdentifier(dbName),
			quoteSQLLiteral(encoding),
		),
	})
	if err != nil {
		return "", fmt.Errorf("failed to create database %s with encoding %s: %w", dbName, encoding, err)
	}

	newConnString, err := c.databaseConnectionString(ctx, dbName, map[string]string{
		"client_encoding": "UTF8",
	})
	if err != nil {
		return "", err
	}

	db, err := sql.Open("pgx", newConnString)
	if err != nil {
		return "", fmt.Errorf("failed to open connection to new database %s: %w", dbName, err)
	}
	defer db.Close()

	err = c.waitForDatabaseReady(ctx, db, 5*time.Second)
	if err != nil {
		return "", fmt.Errorf("database %s not ready after creation: %w", dbName, err)
	}

	return newConnString, nil
}

// SetDatabaseClientEncoding configures the client_encoding default for future
// sessions to a database. This is useful for reproducing legacy-client
// environments even when the database server encoding is UTF8.
func (c *PostgreSQLContainer) SetDatabaseClientEncoding(ctx context.Context, dbName, encoding string) error {
	_, _, err := c.container.Exec(ctx, []string{
		"psql",
		"-U", containerUsername,
		"-d", containerDatabase,
		"-v", "ON_ERROR_STOP=1",
		"-c", fmt.Sprintf(
			"ALTER DATABASE %s SET client_encoding = %s;",
			quoteSQLIdentifier(dbName),
			quoteSQLLiteral(encoding),
		),
	})
	if err != nil {
		return fmt.Errorf("failed to set database %s client_encoding %s: %w", dbName, encoding, err)
	}

	return nil
}

// DropDatabase drops a database with the given name from this PostgreSQL instance.
func (c *PostgreSQLContainer) DropDatabase(ctx context.Context, dbName string) error {
	_, _, err := c.container.Exec(ctx, []string{
		"psql", "-U", containerUsername, "-d", containerDatabase, "-c", fmt.Sprintf("DROP DATABASE IF EXISTS %s;", dbName),
	})
	if err != nil {
		return fmt.Errorf("failed to drop database %s: %w", dbName, err)
	}

	return nil
}

// ConnectToDatabase returns a database connection to the specified database within this container.
// The database must already exist (created via CreateDatabase).
func (c *PostgreSQLContainer) ConnectToDatabase(ctx context.Context, dbName string) (*sql.DB, error) {
	connString, err := c.databaseConnectionString(ctx, dbName, nil)
	if err != nil {
		return nil, err
	}

	db, err := engine.OpenPostgresDB(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to open connection to database %s: %w", dbName, err)
	}

	return db, nil
}

// Cleanup terminates the PostgreSQL container and cleans up resources.
func (c *PostgreSQLContainer) Cleanup(ctx context.Context) error {
	if c.container == nil {
		return nil
	}

	return c.container.Terminate(ctx)
}

func (c *PostgreSQLContainer) databaseConnectionString(ctx context.Context, dbName string, params map[string]string) (string, error) {
	host, err := c.Host(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get container host: %w", err)
	}

	port, err := c.MappedPort(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get container port: %w", err)
	}

	query := url.Values{}
	query.Set("sslmode", "disable")

	for key, value := range params {
		query.Set(key, value)
	}

	hostPort := net.JoinHostPort(host, port)

	return fmt.Sprintf(
		"postgresql://%s:%s@%s/%s?%s",
		containerUsername,
		containerPassword,
		hostPort,
		dbName,
		query.Encode(),
	), nil
}

func quoteSQLIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

func quoteSQLLiteral(value string) string {
	return `'` + strings.ReplaceAll(value, `'`, `''`) + `'`
}

// waitForDatabaseReady waits for a database to be ready for connections.
func (c *PostgreSQLContainer) waitForDatabaseReady(ctx context.Context, db *sql.DB, maxWaitTime time.Duration) error {
	deadline := time.Now().Add(maxWaitTime)

	for time.Now().Before(deadline) {
		if err := db.PingContext(ctx); err == nil {
			// Database is responding, try a simple query
			var result int

			err := db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
			if err == nil && result == 1 {
				return nil
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(50 * time.Millisecond):
			// Continue waiting
		}
	}

	return fmt.Errorf("database not ready after %v", maxWaitTime)
}

// ConnectionInfo holds the individual connection parameters for a test database.
type ConnectionInfo struct {
	Host     string
	Port     int
	Database string
	Username string
	Password string //nolint:gosec // G117: Test-only struct, not a credential leak
}

// NewTestPostgres starts a PostgreSQL testcontainer, creates an isolated
// database named after the test, and registers cleanup. It returns the
// connection details needed to connect to the database.
func NewTestPostgres(t *testing.T) ConnectionInfo {
	t.Helper()

	ctx := t.Context()

	container := RequirePostgreSQLContainer(ctx, t)

	t.Cleanup(func() {
		_ = container.Cleanup(context.Background())
	})

	dbName := SanitizeDatabaseName("test_" + t.Name())

	if _, err := container.CreateDatabase(ctx, dbName); err != nil {
		t.Fatalf("failed to create test database: %v", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		t.Fatalf("failed to get container host: %v", err)
	}

	portStr, err := container.MappedPort(ctx)
	if err != nil {
		t.Fatalf("failed to get container port: %v", err)
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("failed to parse container port: %v", err)
	}

	return ConnectionInfo{
		Host:     host,
		Port:     port,
		Database: dbName,
		Username: containerUsername,
		Password: containerPassword,
	}
}

// PostgresProtoConfig returns a ConnectRPC PostgresConfig proto message
// suitable for use with OnboardingService.SetupAppDatabase.
func (c ConnectionInfo) PostgresProtoConfig() *consolev1alpha1.PostgresConfig {
	return &consolev1alpha1.PostgresConfig{
		Host:     c.Host,
		Port:     int32(c.Port), //nolint:gosec // G115: Port is validated to valid range
		Database: c.Database,
		Username: c.Username,
		Password: c.Password,
		SslMode:  consolev1alpha1.PostgresConfig_SSL_MODE_DISABLED,
	}
}

// SanitizeDatabaseName converts a test name into a valid PostgreSQL database name.
// PostgreSQL database names must:
// - Be 63 characters or less
// - Start with a letter or underscore
// - Contain only letters, digits, underscores, and dollar signs
// - Not be a reserved word.
func SanitizeDatabaseName(testName string) string {
	// Remove invalid characters and replace with underscores
	reg := regexp.MustCompile(`[^a-zA-Z0-9_$]`)
	sanitized := reg.ReplaceAllString(testName, "_")

	// Ensure it starts with a letter or underscore
	if len(sanitized) > 0 && !regexp.MustCompile(`^[a-zA-Z_]`).MatchString(sanitized) {
		sanitized = "test_" + sanitized
	}

	// Handle length limit (63 characters for PostgreSQL)
	const maxLen = 63
	if len(sanitized) <= maxLen {
		return strings.ToLower(sanitized)
	}

	// If too long, create a hash-based name to ensure uniqueness
	hash := fmt.Sprintf("%x", md5.Sum([]byte(testName))) //nolint:gosec // G401: md5 used for test name hashing, not cryptographic purposes
	prefix := sanitized[:min(maxLen-9, len(sanitized))]  // Leave room for hash + underscore

	return strings.ToLower(fmt.Sprintf("%s_%s", prefix, hash[:8]))
}
