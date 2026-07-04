package testutil

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/suite"
)

// IntegrationTestSuite provides a base test suite for storage integration tests.
// It manages PostgreSQL testcontainer lifecycle and provides common utilities.
type IntegrationTestSuite struct {
	suite.Suite

	// Container and database management
	pgContainer *PostgreSQLContainer
	dbManager   *DatabaseManager
	migrateFunc MigrationFunc

	// Test-specific database connection
	db     *sql.DB
	dbName string
}

// SetMigrationFunc sets the migration function to use for setting up test databases.
// This should be called before SetupSuite (typically in a test suite's constructor).
func (s *IntegrationTestSuite) SetMigrationFunc(migrateFunc MigrationFunc) {
	s.migrateFunc = migrateFunc
}

// SetupSuite is called once before all tests in the suite.
// It starts the PostgreSQL container that will be shared across all tests.
func (s *IntegrationTestSuite) SetupSuite() {
	ctx := context.Background()

	// Start PostgreSQL container
	pgContainer := RequirePostgreSQLContainer(ctx, s.T())
	s.pgContainer = pgContainer

	// Create database manager
	s.dbManager = NewDatabaseManager(pgContainer, s.migrateFunc)

	s.T().Logf("PostgreSQL container started successfully")
}

// TearDownSuite is called once after all tests in the suite.
// It cleans up the PostgreSQL container and all resources.
func (s *IntegrationTestSuite) TearDownSuite() {
	if s.pgContainer != nil {
		ctx := context.Background()
		err := s.pgContainer.Cleanup(ctx)
		s.Require().NoError(err, "Failed to cleanup PostgreSQL container")
		s.T().Logf("PostgreSQL container cleaned up successfully")
	}
}

// SetupTest is called before each individual test.
// It creates a fresh database with migrations applied for test isolation.
func (s *IntegrationTestSuite) SetupTest() {
	testName := s.T().Name()
	ctx := context.Background()

	// Create a fresh test database with migrations
	db, dbName, err := s.dbManager.CreateTestDatabase(ctx, testName)
	s.Require().NoError(err, "Failed to create test database")

	s.db = db
	s.dbName = dbName

	s.T().Logf("Created test database: %s", dbName)
}

// TearDownTest is called after each individual test.
// It cleans up the test database to ensure isolation between tests.
func (s *IntegrationTestSuite) TearDownTest() {
	if s.db != nil || s.dbName != "" {
		ctx := context.Background()
		err := s.dbManager.CleanupTestDatabase(ctx, s.db, s.dbName)
		s.Require().NoError(err, "Failed to cleanup test database")
		s.T().Logf("Cleaned up test database: %s", s.dbName)

		s.db = nil
		s.dbName = ""
	}
}

// DB returns the current test database connection.
// This connection is unique to the current test and has migrations applied.
func (s *IntegrationTestSuite) DB() *sql.DB {
	s.Require().NotNil(s.db, "Database connection not available. Ensure SetupTest ran successfully.")
	return s.db
}

// TruncateAllTables truncates all tables in the current test database.
// This is useful for cleaning up between test cases within the same test method.
func (s *IntegrationTestSuite) TruncateAllTables() {
	ctx := context.Background()
	err := s.dbManager.TruncateAllTables(ctx, s.db)
	s.Require().NoError(err, "Failed to truncate tables")
}

// ResetSequences resets all sequences in the current test database.
// This ensures consistent ID generation when testing auto-increment fields.
func (s *IntegrationTestSuite) ResetSequences() {
	ctx := context.Background()
	err := s.dbManager.ResetSequences(ctx, s.db)
	s.Require().NoError(err, "Failed to reset sequences")
}

// RunIntegrationTestSuite is a helper function to run an integration test suite.
// It provides a consistent way to execute test suites that embed IntegrationTestSuite.
func RunIntegrationTestSuite(t *testing.T, testSuite suite.TestingSuite) {
	t.Helper()
	suite.Run(t, testSuite)
}
