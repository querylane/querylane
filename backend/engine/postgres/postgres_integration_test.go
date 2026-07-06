package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver
	"github.com/stretchr/testify/suite"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/integration/testutil"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// PostgresEngineIntegrationTestSuite tests the postgres engine implementation
// using testcontainers for real PostgreSQL integration testing.
type PostgresEngineIntegrationTestSuite struct {
	suite.Suite

	container  *testutil.PostgreSQLContainer
	db         *sql.DB
	eng        *postgres.Postgres
	testDBName string // Store the current test database name to avoid name mismatch issues
}

// SetupSuite runs once before all tests to start the PostgreSQL container.
func (s *PostgresEngineIntegrationTestSuite) SetupSuite() {
	if testing.Short() {
		s.T().Skip("skipping integration test; run without -short")
	}

	// Start PostgreSQL container
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	container := testutil.RequirePostgreSQLContainer(ctx, s.T())
	s.container = container

	// Get connection to default database
	connStr, err := container.ConnectionString(ctx)
	s.Require().NoError(err)

	db, err := sql.Open("pgx", connStr)
	s.Require().NoError(err)
	s.db = db

	// Create engine instance with a process-random token codec.
	tokens, err := engine.NewRandomTokenCodec()
	s.Require().NoError(err)

	s.eng = postgres.New(tokens)

	// Test basic connection
	err = s.eng.TestConnection(ctx, s.db)
	s.Require().NoError(err)
}

// TearDownSuite runs once after all tests to clean up the PostgreSQL container.
func (s *PostgresEngineIntegrationTestSuite) TearDownSuite() {
	if s.db != nil {
		s.db.Close()
	}

	if s.container != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		s.container.Cleanup(ctx) //nolint:errcheck // Best-effort cleanup in test teardown
	}
}

// SetupTest runs before each test to create a clean test database.
func (s *PostgresEngineIntegrationTestSuite) SetupTest() {
	ctx := context.Background()

	// Create unique test database for this test
	s.testDBName = s.getTestDBName()
	_, err := s.container.CreateDatabase(ctx, s.testDBName)
	s.Require().NoError(err)
}

// TearDownTest runs after each test to clean up the test database.
func (s *PostgresEngineIntegrationTestSuite) TearDownTest() {
	ctx := context.Background()
	if s.testDBName != "" {
		_ = s.container.DropDatabase(ctx, s.testDBName)
		s.testDBName = ""
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestGetInstanceOverviewExposesPgStatIo() {
	ctx := context.Background()

	overview, err := s.eng.GetInstanceOverview(ctx, s.db)

	s.Require().NoError(err)
	s.Require().NotNil(overview)
	s.Require().NotNil(overview.IO, "PostgreSQL 16+ exposes pg_stat_io")
	s.GreaterOrEqual(overview.IO.Reads, int64(0))
	s.GreaterOrEqual(overview.IO.ReadBytes, int64(0))
	s.GreaterOrEqual(overview.IO.Writes, int64(0))
	s.GreaterOrEqual(overview.IO.WriteBytes, int64(0))
	s.GreaterOrEqual(overview.IO.Extends, int64(0))
	s.GreaterOrEqual(overview.IO.ExtendBytes, int64(0))
	s.GreaterOrEqual(overview.IO.Fsyncs, int64(0))
}

func (s *PostgresEngineIntegrationTestSuite) TestProbeMetricsCollectRealSamples() {
	ctx := context.Background()

	version, err := s.eng.GetServerVersionNum(ctx, s.db)
	s.Require().NoError(err)
	s.GreaterOrEqual(version, int32(160000), "test container is PG16+")

	conn, err := s.eng.GetConnectionMetrics(ctx, s.db)
	s.Require().NoError(err)
	s.Positive(conn.Total, "our own connection must be counted")
	s.Positive(conn.Max)

	cache, err := s.eng.GetCacheCounters(ctx, s.db)
	s.Require().NoError(err)
	s.GreaterOrEqual(cache.BlocksHit, int64(0))
	s.GreaterOrEqual(cache.BlocksRead, int64(0))
	// pg_stat_database activity counters aggregated from the same scan. The
	// server has been committing catalog/bootstrap transactions since startup,
	// so xact_commit is strictly positive; the rest are cumulative and
	// non-negative. On PG14+ (our floor) the session counters are real columns;
	// the JSON access degrades them to 0 on older servers instead of failing.
	s.Positive(cache.XactCommit, "the server has committed transactions since startup")
	s.GreaterOrEqual(cache.XactRollback, int64(0))
	s.GreaterOrEqual(cache.TupReturned, int64(0))
	s.GreaterOrEqual(cache.TupInserted, int64(0))
	s.GreaterOrEqual(cache.Deadlocks, int64(0))
	s.GreaterOrEqual(cache.TempBytes, int64(0))
	s.GreaterOrEqual(cache.Sessions, int64(0))

	// After an explicit reset, stats_reset is non-NULL and must scan into the
	// *time.Time field.
	_, err = s.db.ExecContext(ctx, "SELECT pg_stat_reset()")
	s.Require().NoError(err)

	cache, err = s.eng.GetCacheCounters(ctx, s.db)
	s.Require().NoError(err)
	s.Require().NotNil(cache.StatsReset, "stats_reset must be recorded after pg_stat_reset()")
	s.WithinDuration(time.Now(), *cache.StatsReset, time.Minute)

	sizes, err := s.eng.ListDatabaseSizes(ctx, s.db)
	s.Require().NoError(err)
	s.Require().NotEmpty(sizes)

	sizeByName := make(map[string]int64, len(sizes))
	for _, size := range sizes {
		sizeByName[size.DatabaseName] = size.SizeBytes
	}

	s.Positive(sizeByName["postgres"], "the default database must report a size")

	io, err := s.eng.GetIOCounters(ctx, s.db)
	s.Require().NoError(err)
	s.GreaterOrEqual(io.Reads, int64(0))
	s.GreaterOrEqual(io.Fsyncs, int64(0))
}

func (s *PostgresEngineIntegrationTestSuite) TestGetVacuumCountersAggregatesUserTables() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS probe_vacuum_target (id int)")
	s.Require().NoError(err)

	_, err = testDB.ExecContext(ctx, "INSERT INTO probe_vacuum_target SELECT generate_series(1, 100)")
	s.Require().NoError(err)

	_, err = testDB.ExecContext(ctx, "VACUUM (ANALYZE) probe_vacuum_target")
	s.Require().NoError(err)

	vacuum, err := s.eng.GetVacuumCounters(ctx, testDB)
	s.Require().NoError(err)
	s.GreaterOrEqual(vacuum.VacuumCount, int64(1), "the manual VACUUM must be counted")
	s.GreaterOrEqual(vacuum.LiveTuples, int64(0))
	s.GreaterOrEqual(vacuum.DeadTuples, int64(0))
}

func (s *PostgresEngineIntegrationTestSuite) TestCheckInstanceHealthReturnsDatabaseBackedSignals() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
	s.Require().NoError(err)

	health, err := s.eng.CheckInstanceHealth(ctx, testDB)

	s.Require().NoError(err)
	s.Require().NotNil(health)

	s.Require().NotNil(health.ConnectionActivity)
	s.Equal(engine.HealthStatusOK, health.ConnectionActivity.Status)
	s.GreaterOrEqual(health.ConnectionActivity.Total, int32(1))
	s.Positive(health.ConnectionActivity.Max)

	s.Require().NotNil(health.Replication)
	s.Equal(engine.ReplicationRolePrimary, health.Replication.Role)
	s.GreaterOrEqual(health.Replication.AttachedReplicas, int32(0))

	s.Require().NotNil(health.StatsAccess)
	s.NotEmpty(health.StatsAccess.CurrentUser)
	s.True(health.StatsAccess.CanReadPGStatActivity)
	s.True(health.StatsAccess.CanReadPGStatDatabase)

	s.Require().NotNil(health.PGStatStatements)
	s.True(health.PGStatStatements.ExtensionInstalled)
	s.NotEmpty(health.PGStatStatements.ExtensionVersion)
	s.GreaterOrEqual(health.PGStatStatements.StatementCount, int64(0))

	if !health.PGStatStatements.SharedPreloadConfigured {
		s.Equal(engine.HealthStatusWarning, health.PGStatStatements.Status)
		s.Contains(health.PGStatStatements.Summary, "shared_preload_libraries")
	}

	s.Require().NotNil(health.Autovacuum)
	s.GreaterOrEqual(health.Autovacuum.RunningWorkers, int32(0))
	s.Positive(health.Autovacuum.MaxWorkers)
	s.NotEmpty(health.Autovacuum.Summary)
	s.Contains([]engine.HealthStatus{engine.HealthStatusOK, engine.HealthStatusWarning}, health.Autovacuum.Status)
}

func (s *PostgresEngineIntegrationTestSuite) TestListExtensionsIncludesAvailableAndInstalled() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS pg_trgm")
	s.Require().NoError(err)

	extensions, _, err := s.eng.ListExtensions(ctx, testDB, aip.Params{PageSize: 1000, OrderBy: "name asc"})
	s.Require().NoError(err)

	byName := make(map[string]engine.Extension, len(extensions))
	for _, extension := range extensions {
		byName[extension.Name] = extension
	}

	pgTrgm, ok := byName["pg_trgm"]
	s.Require().True(ok, "pg_trgm extension should be listed")
	s.True(pgTrgm.Installed)
	s.Equal("public", pgTrgm.SchemaName)
	s.NotEmpty(pgTrgm.InstalledVersion)
	s.NotEmpty(pgTrgm.DefaultVersion)

	uuidOssp, ok := byName["uuid-ossp"]
	s.Require().True(ok, "uuid-ossp should be available on official PostgreSQL images")
	s.False(uuidOssp.Installed)
	s.Empty(uuidOssp.SchemaName)
	s.Empty(uuidOssp.InstalledVersion)
	s.NotEmpty(uuidOssp.DefaultVersion)
}

func (s *PostgresEngineIntegrationTestSuite) TestListExtensionsFiltersUninstalledExtensionsByEmptySchema() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	extensions, _, err := s.eng.ListExtensions(ctx, testDB, aip.Params{
		PageSize: 1000,
		Filter:   `schema = ""`,
		OrderBy:  "schema asc, name asc",
	})
	s.Require().NoError(err)
	s.Require().NotEmpty(extensions)

	for _, extension := range extensions {
		s.False(extension.Installed)
		s.Empty(extension.SchemaName)
	}
}

// TestListDatabases tests database listing functionality.
func (s *PostgresEngineIntegrationTestSuite) TestListDatabases() {
	tests := []struct {
		name              string
		setup             func(ctx context.Context)
		expectedDatabases []string
		expectSystemDBs   bool
	}{
		{
			name: "list-all-databases",
			setup: func(ctx context.Context) {
				// Create additional test databases
				_, err := s.container.CreateDatabase(ctx, "user_db1")
				s.Require().NoError(err)
				_, err = s.container.CreateDatabase(ctx, "user_db2")
				s.Require().NoError(err)
			},
			expectedDatabases: []string{"testdb", "user_db1", "user_db2"},
			expectSystemDBs:   true, // postgres is a system DB
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()

			// Setup test data
			tt.setup(ctx)

			// Execute test
			databases, _, err := s.eng.ListDatabases(ctx, s.db, aip.Params{})
			s.Require().NoError(err)
			s.NotEmpty(databases)

			// Verify expected databases exist
			dbNames := make(map[string]bool)
			systemDBCount := 0

			for _, db := range databases {
				dbNames[db.Name] = true
				if db.IsSystemDatabase {
					systemDBCount++
				}
				// Verify database has expected fields
				s.NotEmpty(db.Name)
				s.NotEmpty(db.DisplayName)
				s.NotEmpty(db.Name)
			}

			// Check all expected databases are present
			for _, expectedDB := range tt.expectedDatabases {
				s.True(dbNames[expectedDB], "Expected database %s not found", expectedDB)
			}

			// Verify system databases are properly marked
			if tt.expectSystemDBs {
				s.Positive(systemDBCount, "Expected at least one system database")
			}
		})
	}
}

// TestGetDatabase tests single database retrieval.
func (s *PostgresEngineIntegrationTestSuite) TestGetDatabase() {
	tests := []struct {
		name         string
		databaseName string
		setup        func(ctx context.Context)
		wantErr      bool
		expectedErr  error
	}{
		{
			name:         "existing-database",
			databaseName: "testdb", // Default database from container
			setup:        func(_ context.Context) {},
			wantErr:      false,
		},
		{
			name:         "non-existent-database",
			databaseName: "nonexistent",
			setup:        func(_ context.Context) {},
			wantErr:      true,
			expectedErr:  engine.ErrDatabaseNotFound,
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()
			tt.setup(ctx)

			database, err := s.eng.GetDatabase(ctx, s.db, tt.databaseName)

			if tt.wantErr {
				s.Require().Error(err)
				s.Nil(database)

				if tt.expectedErr != nil {
					s.Require().ErrorIs(err, tt.expectedErr)
				}
			} else {
				s.Require().NoError(err)
				s.NotNil(database)
				s.Equal(tt.databaseName, database.Name)
				s.NotEmpty(database.Name)
			}
		})
	}
}

// TestListSchemas tests schema listing functionality.
func (s *PostgresEngineIntegrationTestSuite) TestListSchemas() {
	tests := []struct {
		name            string
		setup           func(ctx context.Context, db *sql.DB)
		expectedSchemas []string
	}{
		{
			name: "list-schemas-with-custom",
			setup: func(ctx context.Context, db *sql.DB) {
				// Create custom schemas
				_, err := db.ExecContext(ctx, "CREATE SCHEMA test_schema1")
				s.Require().NoError(err)
				_, err = db.ExecContext(ctx, "CREATE SCHEMA test_schema2")
				s.Require().NoError(err)
			},
			expectedSchemas: []string{"public", "test_schema1", "test_schema2"},
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()

			testDB := s.getTestDBConnection()
			defer testDB.Close()

			// Setup test data
			tt.setup(ctx, testDB)

			// Execute test
			schemas, _, err := s.eng.ListSchemas(ctx, testDB, aip.Params{})
			s.Require().NoError(err)

			// Verify schemas
			schemaNames := make(map[string]bool)
			systemSchemaCount := 0

			for _, schema := range schemas {
				schemaNames[schema.Name] = true
				if schema.IsSystemSchema {
					systemSchemaCount++
				}

				s.NotEmpty(schema.Name)
				s.NotEmpty(schema.DisplayName)
			}

			// Check expected schemas exist
			for _, expectedSchema := range tt.expectedSchemas {
				s.True(schemaNames[expectedSchema], "Expected schema %s not found", expectedSchema)
			}

			// Should have system schemas filtered out, but information_schema should be marked
			s.Positive(systemSchemaCount, "Expected system schemas to be marked")
		})
	}
}

// TestListTables tests table listing functionality.
func (s *PostgresEngineIntegrationTestSuite) TestListTables() {
	tests := []struct {
		name             string
		schemaName       string
		setup            func(ctx context.Context, db *sql.DB)
		cleanup          func(ctx context.Context, db *sql.DB)
		expectedTables   []string
		expectedTypes    map[string]api.Table_TableType
		expectedMinSizes map[string]int64
	}{
		{
			name:       "list-tables-excludes-views-and-labels-durable-table-kinds",
			schemaName: "querylane_table_kind",
			setup: func(ctx context.Context, db *sql.DB) {
				_, err := db.ExecContext(ctx, `
					DROP SCHEMA IF EXISTS querylane_table_kind CASCADE;
					CREATE SCHEMA querylane_table_kind;

					CREATE TABLE querylane_table_kind.users (
						id SERIAL PRIMARY KEY,
						name VARCHAR(255) NOT NULL,
						email VARCHAR(255) UNIQUE
					);

					CREATE TABLE querylane_table_kind.events (
						id integer NOT NULL,
						occurred_on date NOT NULL
					) PARTITION BY RANGE (occurred_on);
					CREATE TABLE querylane_table_kind.events_2026 PARTITION OF querylane_table_kind.events
						FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
					INSERT INTO querylane_table_kind.events (id, occurred_on) VALUES (1, '2026-06-26');

					CREATE VIEW querylane_table_kind.user_emails AS
					SELECT id, email FROM querylane_table_kind.users;
				`)
				s.Require().NoError(err)
			},
			cleanup: func(ctx context.Context, db *sql.DB) {
				_, _ = db.ExecContext(ctx, "DROP SCHEMA IF EXISTS querylane_table_kind CASCADE")
			},
			expectedTables: []string{"users", "events"},
			expectedTypes: map[string]api.Table_TableType{
				"events": api.Table_TABLE_TYPE_PARTITIONED,
				"users":  api.Table_TABLE_TYPE_BASE_TABLE,
			},
			expectedMinSizes: map[string]int64{
				"events": 1,
			},
		},
		{
			name:       "list-tables-labels-foreign-table-kind",
			schemaName: "querylane_foreign_table_kind",
			setup: func(ctx context.Context, db *sql.DB) {
				if _, err := db.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS file_fdw"); err != nil {
					s.T().Skipf("file_fdw unavailable: %v", err)
				}

				_, err := db.ExecContext(ctx, `
					DROP SCHEMA IF EXISTS querylane_foreign_table_kind CASCADE;
					DROP SERVER IF EXISTS querylane_table_kind_fdw CASCADE;
					CREATE SCHEMA querylane_foreign_table_kind;
					CREATE SERVER querylane_table_kind_fdw FOREIGN DATA WRAPPER file_fdw;
					CREATE FOREIGN TABLE querylane_foreign_table_kind.remote_users (id integer, name text)
						SERVER querylane_table_kind_fdw
						OPTIONS (filename '/dev/null', format 'csv');
				`)
				s.Require().NoError(err)
			},
			cleanup: func(ctx context.Context, db *sql.DB) {
				_, _ = db.ExecContext(ctx, `
					DROP SCHEMA IF EXISTS querylane_foreign_table_kind CASCADE;
					DROP SERVER IF EXISTS querylane_table_kind_fdw CASCADE;
					DROP EXTENSION IF EXISTS file_fdw CASCADE;
				`)
			},
			expectedTables: []string{"remote_users"},
			expectedTypes: map[string]api.Table_TableType{
				"remote_users": api.Table_TABLE_TYPE_EXTERNAL,
			},
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()

			testDB := s.getTestDBConnection()
			defer testDB.Close()

			if tt.cleanup != nil {
				defer tt.cleanup(ctx, testDB)
			}

			// Setup test data
			tt.setup(ctx, testDB)

			// Execute test
			tables, _, err := s.eng.ListTables(ctx, testDB, tt.schemaName, aip.Params{})
			s.Require().NoError(err)

			// Verify tables
			tableMap := make(map[string]engine.Table)
			for _, table := range tables {
				tableMap[table.Name] = table
				s.NotEmpty(table.Name)
				s.NotEmpty(table.DisplayName)
				s.False(table.IsSystemTable)
			}

			// Check expected tables exist with correct types.
			for _, expectedTable := range tt.expectedTables {
				table, exists := tableMap[expectedTable]
				s.True(exists, "Expected table %s not found", expectedTable)

				if expectedType, hasType := tt.expectedTypes[expectedTable]; hasType {
					s.Equal(expectedType, table.TableType, "Table %s has wrong type", expectedTable)

					got, err := s.eng.GetTable(ctx, testDB, tt.schemaName, expectedTable)
					s.Require().NoError(err)
					s.Equal(expectedType, got.TableType, "GetTable(%s) has wrong type", expectedTable)

					if expectedMinSize, hasMinSize := tt.expectedMinSizes[expectedTable]; hasMinSize {
						s.GreaterOrEqual(table.SizeBytes, expectedMinSize, "Table %s has wrong list size", expectedTable)
						s.GreaterOrEqual(got.SizeBytes, expectedMinSize, "GetTable(%s) has wrong size", expectedTable)
					}
				}
			}
		})
	}
}

// TestListTableColumns tests column listing functionality.
func (s *PostgresEngineIntegrationTestSuite) TestListTableColumns() {
	tests := []struct {
		name            string
		setup           func(ctx context.Context, db *sql.DB)
		tableName       string
		expectedColumns []struct {
			name         string
			dataType     api.DataType
			nullable     bool
			isPrimaryKey bool
		}
	}{
		{
			name: "list-columns-with-various-types",
			setup: func(ctx context.Context, db *sql.DB) {
				_, err := db.ExecContext(ctx, `
					CREATE TABLE test_types (
						id SERIAL PRIMARY KEY,
						name VARCHAR(255) NOT NULL,
						age INTEGER,
						balance DECIMAL(10,2),
						is_active BOOLEAN DEFAULT true,
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						metadata JSONB,
						uuid_field UUID DEFAULT gen_random_uuid()
					)
				`)
				s.Require().NoError(err)
			},
			tableName: "test_types",
			expectedColumns: []struct {
				name         string
				dataType     api.DataType
				nullable     bool
				isPrimaryKey bool
			}{
				{"id", api.DataType_DATA_TYPE_INTEGER, false, true},
				{"name", api.DataType_DATA_TYPE_STRING, false, false},
				{"age", api.DataType_DATA_TYPE_INTEGER, true, false},
				{"balance", api.DataType_DATA_TYPE_FLOAT, true, false},
				{"is_active", api.DataType_DATA_TYPE_BOOLEAN, true, false},
				{"created_at", api.DataType_DATA_TYPE_TIMESTAMP, true, false},
				{"metadata", api.DataType_DATA_TYPE_JSON, true, false},
				{"uuid_field", api.DataType_DATA_TYPE_UUID, true, false},
			},
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()

			testDB := s.getTestDBConnection()
			defer testDB.Close()

			// Setup test data
			tt.setup(ctx, testDB)

			// Execute test
			columns, err := s.eng.ListTableColumns(ctx, testDB, "public", tt.tableName)
			s.Require().NoError(err)
			s.NotEmpty(columns)

			// Create map for easier lookup
			columnMap := make(map[string]engine.Column)
			for _, col := range columns {
				columnMap[col.Name] = col
			}

			// Verify expected columns
			for _, expectedCol := range tt.expectedColumns {
				col, exists := columnMap[expectedCol.name]
				s.True(exists, "Expected column %s not found", expectedCol.name)
				s.Equal(expectedCol.dataType, col.DataType, "Column %s has wrong data type", expectedCol.name)
				s.Equal(expectedCol.nullable, col.IsNullable, "Column %s has wrong nullable setting", expectedCol.name)
				s.Equal(expectedCol.isPrimaryKey, col.IsPrimaryKey, "Column %s has wrong primary key setting", expectedCol.name)
			}
		})
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestListTableColumnsGeneratedAndIdentityMetadata() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, `
		CREATE TABLE generated_identity_columns (
			id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
			always_id bigint GENERATED ALWAYS AS IDENTITY,
			email text NOT NULL,
			email_lower text GENERATED ALWAYS AS (lower(email)) STORED
		)
	`)
	s.Require().NoError(err)

	hasVirtualGeneratedColumns := s.postgresMajor(ctx, testDB) >= 18
	if hasVirtualGeneratedColumns {
		_, err = testDB.ExecContext(ctx, `
			ALTER TABLE generated_identity_columns
				ADD COLUMN email_domain text GENERATED ALWAYS AS (split_part(email, '@', 2)) VIRTUAL
		`)
		s.Require().NoError(err)
	}

	columns, err := s.eng.ListTableColumns(ctx, testDB, "public", "generated_identity_columns")
	s.Require().NoError(err)

	columnMap := make(map[string]engine.Column, len(columns))
	for _, col := range columns {
		columnMap[col.Name] = col
	}

	id := columnMap["id"]
	s.True(id.IsIdentity, "id should be marked as an identity column")
	s.Equal(api.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT, id.IdentityGeneration)

	alwaysID := columnMap["always_id"]
	s.True(alwaysID.IsIdentity, "always_id should be marked as an identity column")
	s.Equal(api.IdentityGeneration_IDENTITY_GENERATION_ALWAYS, alwaysID.IdentityGeneration)

	emailLower := columnMap["email_lower"]
	s.True(emailLower.IsGenerated, "email_lower should be marked as generated")
	s.Contains(emailLower.GenerationExpression, "lower(email)")

	if hasVirtualGeneratedColumns {
		emailDomain := columnMap["email_domain"]
		s.True(emailDomain.IsGenerated, "email_domain should be marked as generated")
		s.Contains(emailDomain.GenerationExpression, "split_part")
	}
}

// TestTestConnection tests connection validation.
func (s *PostgresEngineIntegrationTestSuite) TestTestConnection() {
	tests := []struct {
		name    string
		db      func() *sql.DB
		wantErr bool
		errIs   error
	}{
		{
			name: "valid-connection",
			db: func() *sql.DB {
				return s.getTestDBConnection()
			},
			wantErr: false,
		},
		{
			name: "closed-connection",
			db: func() *sql.DB {
				db := s.getTestDBConnection()
				db.Close()

				return db
			},
			wantErr: true,
		},
		{
			name: "missing-database",
			db: func() *sql.DB {
				ctx := context.Background()
				connStr, err := s.container.ConnectionString(ctx)
				s.Require().NoError(err)

				parsed, err := url.Parse(connStr)
				s.Require().NoError(err)

				parsed.Path = "/definitely_missing"

				db, err := sql.Open("pgx", parsed.String())
				s.Require().NoError(err)

				return db
			},
			wantErr: true,
			errIs:   engine.ErrDatabaseNotFound,
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			ctx := context.Background()

			testDB := tt.db()
			if !tt.wantErr {
				defer testDB.Close()
			}

			err := s.eng.TestConnection(ctx, testDB)

			if tt.wantErr {
				s.Require().Error(err)

				if tt.errIs != nil {
					s.Require().ErrorIs(err, tt.errIs)
				}
			} else {
				s.NoError(err)
			}
		})
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestExecuteQueryCapturesPostgresWarnings() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	s.createWarningFunction(ctx, testDB)

	stream, err := s.eng.ExecuteQuery(ctx, testDB, engine.ExecuteQueryParams{
		Statement: "SELECT public.ql_notice_warning('execute') AS n",
		Timeout:   5 * time.Second,
	})
	s.Require().NoError(err)

	var rows int
	for stream.Next() {
		rows++
	}

	s.Require().NoError(stream.Err())
	s.Require().NoError(stream.Close())
	s.Equal(1, rows)
	s.Contains(strings.Join(stream.Stats().Notices, "\n"), "WARNING 01000: querylane warning: execute")
}

func (s *PostgresEngineIntegrationTestSuite) TestExplainQueryCapturesPostgresWarnings() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	s.createWarningFunction(ctx, testDB)

	result, err := s.eng.ExplainQuery(ctx, testDB, engine.ExplainQueryParams{
		Statement: "SELECT public.ql_notice_warning('explain')",
		Analyze:   true,
		Timeout:   5 * time.Second,
	})

	s.Require().NoError(err)
	s.NotEmpty(result.Plan)
	s.Contains(strings.Join(result.Notices, "\n"), "WARNING 01000: querylane warning: explain")
}

func (s *PostgresEngineIntegrationTestSuite) TestExecuteQueryNoticeCaptureDoesNotLeakBetweenRequests() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	testDB.SetMaxOpenConns(1)

	s.createWarningFunction(ctx, testDB)

	first := s.executeQueryStats(ctx, testDB, "SELECT public.ql_notice_warning('first') AS n")
	s.Contains(strings.Join(first.Notices, "\n"), "WARNING 01000: querylane warning: first")

	second := s.executeQueryStats(ctx, testDB, "SELECT 1 AS n")
	s.Empty(second.Notices)
}

func (s *PostgresEngineIntegrationTestSuite) TestExecuteQueryNoticeCaptureIsolatedAcrossConcurrentRequests() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	testDB.SetMaxOpenConns(2)

	s.createWarningFunction(ctx, testDB)

	type queryResult struct {
		label string
		stats engine.ExecuteQueryStats
		err   error
	}

	start := make(chan struct{})
	results := make(chan queryResult, 2)

	for _, label := range []string{"left", "right"} {
		go func() {
			<-start

			statement := fmt.Sprintf("SELECT public.ql_notice_warning('%s') AS n", label)

			stream, err := s.eng.ExecuteQuery(ctx, testDB, engine.ExecuteQueryParams{
				Statement: statement,
				Timeout:   5 * time.Second,
			})
			if err != nil {
				results <- queryResult{label: label, err: err}
				return
			}

			for stream.Next() {
			}

			err = errors.Join(stream.Err(), stream.Close())
			results <- queryResult{label: label, stats: stream.Stats(), err: err}
		}()
	}

	close(start)

	for range 2 {
		select {
		case result := <-results:
			s.Require().NoError(result.err)

			notices := strings.Join(result.stats.Notices, "\n")
			s.Contains(notices, "WARNING 01000: querylane warning: "+result.label)

			otherLabel := "right"
			if result.label == "right" {
				otherLabel = "left"
			}

			s.NotContains(notices, "querylane warning: "+otherLabel)
		case <-ctx.Done():
			s.Require().NoError(ctx.Err())
		}
	}
}

// TestErrorHandling tests proper error handling and edge cases.
func (s *PostgresEngineIntegrationTestSuite) TestErrorHandling() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	// Test non-existent schema
	s.Run("non-existent-schema", func() {
		_, err := s.eng.GetSchema(ctx, testDB, "nonexistent_schema")
		s.Require().Error(err)
		s.Require().ErrorIs(err, engine.ErrSchemaNotFound)
	})

	// Test non-existent table
	s.Run("non-existent-table", func() {
		_, err := s.eng.GetTable(ctx, testDB, "public", "nonexistent_table")
		s.Require().Error(err)
		s.Require().ErrorIs(err, engine.ErrTableNotFound)
	})

	// Test listing columns for non-existent table
	s.Run("columns-for-non-existent-table", func() {
		_, err := s.eng.ListTableColumns(ctx, testDB, "public", "nonexistent_table")
		s.Require().Error(err)
		s.Require().ErrorIs(err, engine.ErrTableNotFound)
	})

	// Test listing columns for non-existent schema
	s.Run("columns-for-non-existent-schema", func() {
		_, err := s.eng.ListTableColumns(ctx, testDB, "nonexistent_schema", "customers")
		s.Require().Error(err)
		s.Require().ErrorIs(err, engine.ErrSchemaNotFound)
	})
}

// TestComplexTypeMapping tests advanced PostgreSQL type mapping scenarios.
func (s *PostgresEngineIntegrationTestSuite) TestComplexTypeMapping() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	// Create table with complex types
	_, err := testDB.ExecContext(ctx, `
		CREATE TABLE complex_types (
			id SERIAL PRIMARY KEY,
			tags TEXT[],
			numbers INTEGER[],
			data JSONB,
			binary_data BYTEA,
			decimal_field DECIMAL(10,2),
			float_field REAL,
			double_field DOUBLE PRECISION
		)
	`)
	s.Require().NoError(err)

	// Test column listing for complex types
	columns, err := s.eng.ListTableColumns(ctx, testDB, "public", "complex_types")
	s.Require().NoError(err)

	columnMap := make(map[string]engine.Column)
	for _, col := range columns {
		columnMap[col.Name] = col
	}

	// Verify array types
	tagsCol := columnMap["tags"]
	s.Equal(api.DataType_DATA_TYPE_ARRAY, tagsCol.DataType)

	numbersCol := columnMap["numbers"]
	s.Equal(api.DataType_DATA_TYPE_ARRAY, numbersCol.DataType)

	// Verify binary data
	binaryCol := columnMap["binary_data"]
	s.Equal(api.DataType_DATA_TYPE_BINARY, binaryCol.DataType)

	// Verify numeric types
	decimalCol := columnMap["decimal_field"]
	s.Equal(api.DataType_DATA_TYPE_FLOAT, decimalCol.DataType)

	floatCol := columnMap["float_field"]
	s.Equal(api.DataType_DATA_TYPE_FLOAT, floatCol.DataType)

	doubleCol := columnMap["double_field"]
	s.Equal(api.DataType_DATA_TYPE_FLOAT, doubleCol.DataType)
}

func (s *PostgresEngineIntegrationTestSuite) TestGetTablePartitionMetadata() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, `
		CREATE SCHEMA partitions;
		CREATE TABLE partitions.events (
			id integer NOT NULL,
			occurred_at date NOT NULL
		) PARTITION BY RANGE (occurred_at);
		CREATE TABLE partitions.events_2024 PARTITION OF partitions.events
			FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
		CREATE TABLE partitions.events_2025 PARTITION OF partitions.events
			FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
		CREATE TABLE partitions.notes (
			id integer PRIMARY KEY,
			body text NOT NULL
		);
	`)
	s.Require().NoError(err)

	parent, err := s.eng.GetTablePartitionMetadata(ctx, testDB, "partitions", "events")
	s.Require().NoError(err)
	s.Equal("RANGE (occurred_at)", parent.PartitionKey)
	s.Empty(parent.ParentTableName)
	s.Empty(parent.PartitionBound)
	s.Equal(int32(2), parent.PartitionCount)
	s.Require().Len(parent.ChildPartitions, 2)
	s.Equal("partitions", parent.ChildPartitions[0].SchemaName)
	s.Equal("events_2024", parent.ChildPartitions[0].TableName)
	s.Contains(parent.ChildPartitions[0].PartitionBound, "FOR VALUES FROM ('2024-01-01')")

	child, err := s.eng.GetTablePartitionMetadata(ctx, testDB, "partitions", "events_2024")
	s.Require().NoError(err)
	s.Equal("partitions", child.ParentSchemaName)
	s.Equal("events", child.ParentTableName)
	s.Contains(child.PartitionBound, "FOR VALUES FROM ('2024-01-01')")
	s.Empty(child.ChildPartitions)

	s.Run("foreign table leaf partition", func() {
		if _, err := testDB.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS file_fdw"); err != nil {
			s.T().Skipf("file_fdw unavailable: %v", err)
		}

		_, err := testDB.ExecContext(ctx, `
			CREATE SERVER partitions_file_server FOREIGN DATA WRAPPER file_fdw;
			CREATE FOREIGN TABLE partitions.events_foreign_2026 PARTITION OF partitions.events
				FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')
				SERVER partitions_file_server
				OPTIONS (filename '/dev/null', format 'csv');
		`)
		s.Require().NoError(err)

		parentWithForeignChild, err := s.eng.GetTablePartitionMetadata(ctx, testDB, "partitions", "events")
		s.Require().NoError(err)
		s.Equal(int32(3), parentWithForeignChild.PartitionCount)
		s.Require().Len(parentWithForeignChild.ChildPartitions, 3)
		s.Equal("partitions", parentWithForeignChild.ChildPartitions[2].SchemaName)
		s.Equal("events_foreign_2026", parentWithForeignChild.ChildPartitions[2].TableName)
		s.Contains(parentWithForeignChild.ChildPartitions[2].PartitionBound, "FOR VALUES FROM ('2026-01-01')")

		foreignChild, err := s.eng.GetTablePartitionMetadata(ctx, testDB, "partitions", "events_foreign_2026")
		s.Require().NoError(err)
		s.Equal("partitions", foreignChild.ParentSchemaName)
		s.Equal("events", foreignChild.ParentTableName)
		s.Contains(foreignChild.PartitionBound, "FOR VALUES FROM ('2026-01-01')")
		s.Empty(foreignChild.ChildPartitions)
	})

	ordinary, err := s.eng.GetTablePartitionMetadata(ctx, testDB, "partitions", "notes")
	s.Require().NoError(err)
	s.Empty(ordinary.PartitionKey)
	s.Empty(ordinary.PartitionBound)
	s.Empty(ordinary.ParentTableName)
	s.Empty(ordinary.ChildPartitions)
	s.Zero(ordinary.PartitionCount)
}

// TestListDatabasesPagination tests cursor pagination for ListDatabases.
func (s *PostgresEngineIntegrationTestSuite) TestListDatabasesPagination() {
	ctx := context.Background()

	// Create additional test databases so there's enough to paginate
	_, err := s.container.CreateDatabase(ctx, "page_db1")
	s.Require().NoError(err)
	_, err = s.container.CreateDatabase(ctx, "page_db2")
	s.Require().NoError(err)

	// Fetch first page with page_size=2
	page1, nextToken, err := s.eng.ListDatabases(ctx, s.db, aip.Params{PageSize: 2})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(nextToken, "expected next_page_token for additional results")

	// Fetch second page using the token
	page2, _, err := s.eng.ListDatabases(ctx, s.db, aip.Params{PageSize: 2, PageToken: nextToken})
	s.Require().NoError(err)
	s.NotEmpty(page2)

	// Pages should not overlap
	page1Names := make(map[string]bool)
	for _, db := range page1 {
		page1Names[db.Name] = true
	}

	for _, db := range page2 {
		s.False(page1Names[db.Name], "database %s appeared on both pages", db.Name)
	}
}

// TestListDatabasesFilterRejected verifies the schema declares no filterable
// fields, so any non-empty filter is rejected with ErrInvalidFilter (AIP-160:
// unsupported filters must error, never be silently ignored).
func (s *PostgresEngineIntegrationTestSuite) TestListDatabasesFilterRejected() {
	ctx := context.Background()

	_, err := s.container.CreateDatabase(ctx, "filter_db1")
	s.Require().NoError(err)

	_, _, err = s.eng.ListDatabases(ctx, s.db, aip.Params{PageSize: 20, Filter: "owner=postgres"})
	s.Require().ErrorIs(err, engine.ErrInvalidFilter)

	// A filter appearing mid-pagination trips the token's filter-hash check
	// before filter validation runs.
	page1, nextToken, err := s.eng.ListDatabases(ctx, s.db, aip.Params{PageSize: 1})
	s.Require().NoError(err)
	s.Len(page1, 1)
	s.Require().NotEmpty(nextToken)

	_, _, err = s.eng.ListDatabases(ctx, s.db, aip.Params{
		PageSize:  1,
		PageToken: nextToken,
		Filter:    "different-filter",
	})
	s.ErrorIs(err, engine.ErrFilterMismatch)
}

func (s *PostgresEngineIntegrationTestSuite) TestListSchemasPaginationAndOrdering() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, "CREATE SCHEMA zz_schema_a")
	s.Require().NoError(err)
	_, err = testDB.ExecContext(ctx, "CREATE SCHEMA zz_schema_b")
	s.Require().NoError(err)
	_, err = testDB.ExecContext(ctx, "CREATE SCHEMA zz_schema_c")
	s.Require().NoError(err)

	page1, nextToken, err := s.eng.ListSchemas(ctx, testDB, aip.Params{
		PageSize: 2,
		OrderBy:  "name desc",
	})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(nextToken)
	s.Equal("zz_schema_c", page1[0].Name)
	s.Equal("zz_schema_b", page1[1].Name)

	page2, _, err := s.eng.ListSchemas(ctx, testDB, aip.Params{
		PageSize:  2,
		PageToken: nextToken,
		OrderBy:   "name desc",
	})
	s.Require().NoError(err)
	s.NotEmpty(page2)
	s.Equal("zz_schema_a", page2[0].Name)

	page1Names := make(map[string]bool)
	for _, schema := range page1 {
		page1Names[schema.Name] = true
	}

	for _, schema := range page2 {
		s.False(page1Names[schema.Name], "schema %s appeared on both pages", schema.Name)
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestListTablesPaginationAndOrdering() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, "CREATE TABLE zz_table_a (id SERIAL PRIMARY KEY)")
	s.Require().NoError(err)
	_, err = testDB.ExecContext(ctx, "CREATE TABLE zz_table_b (id SERIAL PRIMARY KEY)")
	s.Require().NoError(err)
	_, err = testDB.ExecContext(ctx, "CREATE TABLE zz_table_c (id SERIAL PRIMARY KEY)")
	s.Require().NoError(err)

	page1, nextToken, err := s.eng.ListTables(ctx, testDB, "public", aip.Params{
		PageSize: 2,
		OrderBy:  "name desc",
	})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(nextToken)
	s.Equal("zz_table_c", page1[0].Name)
	s.Equal("zz_table_b", page1[1].Name)

	page2, _, err := s.eng.ListTables(ctx, testDB, "public", aip.Params{
		PageSize:  2,
		PageToken: nextToken,
		OrderBy:   "name desc",
	})
	s.Require().NoError(err)
	s.NotEmpty(page2)
	s.Equal("zz_table_a", page2[0].Name)

	page1Names := make(map[string]bool)
	for _, table := range page1 {
		page1Names[table.Name] = true
	}

	for _, table := range page2 {
		s.False(page1Names[table.Name], "table %s appeared on both pages", table.Name)
	}
}

// TestListDatabasesInvalidOrderBy tests that invalid order_by returns an error.
func (s *PostgresEngineIntegrationTestSuite) TestListDatabasesInvalidOrderBy() {
	ctx := context.Background()

	_, _, err := s.eng.ListDatabases(ctx, s.db, aip.Params{OrderBy: "nonexistent_field"})
	s.Require().Error(err)
	s.ErrorIs(err, engine.ErrInvalidOrderBy)
}

func (s *PostgresEngineIntegrationTestSuite) TestListDatabasesInvalidPageToken() {
	ctx := context.Background()

	_, _, err := s.eng.ListDatabases(ctx, s.db, aip.Params{PageToken: "not-valid-base64!@#$"})
	s.Require().Error(err)
	s.ErrorIs(err, engine.ErrInvalidPageToken)
}

// TestReadRowsTruncatedTextPKRoundTrip guards against the bug where a
// preview-eligible identity column (e.g. text PK) was truncated in the
// public projection, then captured in the full_value_token as the
// truncated prefix — making a follow-up ReadCellValue WHERE pk='<prefix>'
// match no rows. The fix excludes identity columns from preview
// truncation so the scanned value used for token minting is always the
// full PK.
func (s *PostgresEngineIntegrationTestSuite) TestReadRowsTruncatedTextPKRoundTrip() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, `
		CREATE TABLE text_pk_rows (
			row_id text PRIMARY KEY,
			payload text NOT NULL
		)
	`)
	s.Require().NoError(err)

	const longID = "row-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // > MaxCellBytes=5

	const longPayload = "payload-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

	_, err = testDB.ExecContext(ctx, `INSERT INTO text_pk_rows (row_id, payload) VALUES ($1, $2)`, longID, longPayload)
	s.Require().NoError(err)

	page, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName:    "instances/test/databases/" + s.testDBName + "/schemas/public/tables/text_pk_rows",
		SchemaName:      "public",
		TableName:       "text_pk_rows",
		PageSize:        10,
		SelectedColumns: []string{"row_id", "payload"},
		CellValueMode:   api.CellValueMode_CELL_VALUE_MODE_PREVIEW,
		MaxCellBytes:    5,
	})
	s.Require().NoError(err)
	s.Require().Len(page.Rows, 1)

	row := page.Rows[0]

	// row_id is the identity column. It must come back un-truncated even
	// under PREVIEW; otherwise the token-bound identity is wrong.
	rowIDCell := row.GetValues()[0]
	s.False(rowIDCell.GetTruncated(), "identity column must not be truncated under PREVIEW")
	s.Equal(longID, rowIDCell.GetValue().GetStringValue())

	// payload (non-identity) should truncate normally.
	payloadCell := row.GetValues()[1]
	s.True(payloadCell.GetTruncated(), "non-identity preview-eligible column should truncate")
	s.NotEmpty(payloadCell.GetFullValueToken())

	full, err := s.eng.ReadCellValue(ctx, testDB, engine.ReadCellValueParams{
		SchemaName:     "public",
		TableName:      "text_pk_rows",
		Column:         "payload",
		RowIdentity:    page.RowIdentity,
		IdentityValues: []*api.TableValue{{Kind: &api.TableValue_StringValue{StringValue: longID}}},
	})
	s.Require().NoError(err)
	s.Equal(longPayload, full.Cell.GetValue().GetStringValue())
}

// TestReadRowsKeysetWithPKExcludedFromSelection guards a subtle invariant:
// keyset pagination must remain stable even when the primary key is not in
// SelectedColumns. The cursor uses internal `__qlcursor` aliases that are
// scanned but never returned to the client, so a future projection refactor
// could quietly drop the identity columns from the query and silently
// downgrade pagination to OFFSET — or worse, lose stability across pages.
func (s *PostgresEngineIntegrationTestSuite) TestReadRowsKeysetWithPKExcludedFromSelection() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, `
		CREATE TABLE int_pk_rows (
			id integer PRIMARY KEY,
			payload text NOT NULL
		)
	`)
	s.Require().NoError(err)

	for i := 1; i <= 5; i++ {
		_, err = testDB.ExecContext(ctx,
			`INSERT INTO int_pk_rows (id, payload) VALUES ($1, $2)`,
			i, fmt.Sprintf("payload-%d", i))
		s.Require().NoError(err)
	}

	resourceName := "instances/test/databases/" + s.testDBName + "/schemas/public/tables/int_pk_rows"

	firstPage, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName:    resourceName,
		SchemaName:      "public",
		TableName:       "int_pk_rows",
		PageSize:        2,
		SelectedColumns: []string{"payload"}, // id deliberately excluded
	})
	s.Require().NoError(err)

	s.Equal(api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, firstPage.PaginationStrategy,
		"keyset pagination must be selected even when PK is not in SelectedColumns")

	s.Require().Len(firstPage.Columns, 1, "only the selected column should be returned to the client")
	s.Equal("payload", firstPage.Columns[0].GetColumnName(), "PK must not leak into the public projection")

	s.Require().Len(firstPage.Rows, 2)

	for _, row := range firstPage.Rows {
		s.Require().Len(row.GetValues(), 1, "row should carry only the selected column")
	}

	s.Require().NotEmpty(firstPage.NextPageToken, "first page must mint a continuation token")

	firstPayloads := make(map[string]struct{}, len(firstPage.Rows))
	for _, row := range firstPage.Rows {
		firstPayloads[row.GetValues()[0].GetValue().GetStringValue()] = struct{}{}
	}

	secondPage, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName:    resourceName,
		SchemaName:      "public",
		TableName:       "int_pk_rows",
		PageSize:        2,
		PageToken:       firstPage.NextPageToken,
		SelectedColumns: []string{"payload"},
	})
	s.Require().NoError(err)

	s.Equal(api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET, secondPage.PaginationStrategy)
	s.Require().Len(secondPage.Rows, 2)

	for _, row := range secondPage.Rows {
		payload := row.GetValues()[0].GetValue().GetStringValue()
		_, dup := firstPayloads[payload]
		s.False(dup, "second page row %q overlaps the first page — keyset stability lost", payload)
	}
}

func (s *PostgresEngineIntegrationTestSuite) TestReadRowsRowCountModes() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := testDB.ExecContext(ctx, `
		CREATE TABLE row_count_rows (
			id integer PRIMARY KEY,
			status text NOT NULL
		)
	`)
	s.Require().NoError(err)

	_, err = testDB.ExecContext(ctx, `
		INSERT INTO row_count_rows (id, status)
		VALUES (1, 'active'), (2, 'active'), (3, 'archived')
	`)
	s.Require().NoError(err)

	_, err = testDB.ExecContext(ctx, `ANALYZE row_count_rows`)
	s.Require().NoError(err)

	resourceName := "instances/test/databases/" + s.testDBName + "/schemas/public/tables/row_count_rows"

	unspecified, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName: resourceName,
		SchemaName:   "public",
		TableName:    "row_count_rows",
		PageSize:     2,
	})
	s.Require().NoError(err)
	s.Require().NotNil(unspecified.RowCount)
	s.Equal(api.RowCount_STATUS_NOT_REQUESTED, unspecified.RowCount.GetStatus())
	s.Equal(int64(0), unspecified.RowCount.GetValue())

	none, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName: resourceName,
		SchemaName:   "public",
		TableName:    "row_count_rows",
		PageSize:     2,
		RowCountMode: api.RowCountMode_ROW_COUNT_MODE_NONE,
	})
	s.Require().NoError(err)
	s.Require().NotNil(none.RowCount)
	s.Equal(api.RowCount_STATUS_NOT_REQUESTED, none.RowCount.GetStatus())
	s.Equal(int64(0), none.RowCount.GetValue())

	filter := &api.RowFilter{
		Node: &api.RowFilter_Predicate{
			Predicate: &api.RowPredicate{
				Column:   "status",
				Operator: api.RowPredicate_OPERATOR_EQUAL,
				Values: []*api.TableValue{
					{Kind: &api.TableValue_StringValue{StringValue: "active"}},
				},
			},
		},
	}

	estimate, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName: resourceName,
		SchemaName:   "public",
		TableName:    "row_count_rows",
		PageSize:     2,
		Filter:       filter,
		RowCountMode: api.RowCountMode_ROW_COUNT_MODE_ESTIMATE,
	})
	s.Require().NoError(err)
	s.Require().NotNil(estimate.RowCount)
	s.Equal(api.RowCount_STATUS_ESTIMATED, estimate.RowCount.GetStatus())
	s.Equal(int64(3), estimate.RowCount.GetValue(), "estimate uses table statistics and ignores filters")

	exact, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName: resourceName,
		SchemaName:   "public",
		TableName:    "row_count_rows",
		PageSize:     2,
		Filter:       filter,
		RowCountMode: api.RowCountMode_ROW_COUNT_MODE_EXACT,
	})
	s.Require().NoError(err)
	s.Require().NotNil(exact.RowCount)
	s.Equal(api.RowCount_STATUS_AVAILABLE, exact.RowCount.GetStatus())
	s.Equal(int64(2), exact.RowCount.GetValue(), "exact count honors filters")

	_, err = testDB.ExecContext(ctx, `
		UPDATE pg_catalog.pg_class
		SET reltuples = 2000000
		WHERE oid = 'public.row_count_rows'::regclass
	`)
	s.Require().NoError(err)

	declinedExact, err := s.eng.ReadRows(ctx, testDB, engine.ReadRowsParams{
		ResourceName: resourceName,
		SchemaName:   "public",
		TableName:    "row_count_rows",
		PageSize:     2,
		Filter:       filter,
		RowCountMode: api.RowCountMode_ROW_COUNT_MODE_EXACT,
	})
	s.Require().NoError(err)
	s.Require().NotNil(declinedExact.RowCount)
	s.Equal(api.RowCount_STATUS_ESTIMATED, declinedExact.RowCount.GetStatus())
	s.Equal(int64(2_000_000), declinedExact.RowCount.GetValue(), "large exact requests keep the useful table estimate")
}

// TestRolesListAndGet exercises the live pg_roles / pg_auth_members queries
// end to end: attribute decoding, membership edges, system-role flagging,
// single-role retrieval, and not-found handling. Roles are cluster-level, so
// they are created on the shared connection and dropped on cleanup.
func (s *PostgresEngineIntegrationTestSuite) TestRolesListAndGet() {
	ctx := context.Background()

	for _, stmt := range []string{
		"CREATE ROLE qltest_parent NOLOGIN VALID UNTIL 'infinity'",
		"CREATE ROLE qltest_login LOGIN CONNECTION LIMIT 5 PASSWORD 'qltest_secret' VALID UNTIL '2030-01-01 00:00:00+00'",
		"ALTER ROLE qltest_login SET work_mem = '64MB'",
		"GRANT qltest_parent TO qltest_login WITH ADMIN OPTION",
	} {
		_, err := s.db.ExecContext(ctx, stmt)
		s.Require().NoError(err)
	}

	s.T().Cleanup(func() {
		// Drop the member first so the parent role has no dependents.
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_login")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_parent")
	})

	roles, _, err := s.eng.ListRoles(ctx, s.db, aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	roleMap := make(map[string]engine.Role)
	for _, role := range roles {
		roleMap[role.Name] = role
	}

	login, ok := roleMap["qltest_login"]
	s.Require().True(ok, "qltest_login should be listed")
	s.True(login.Attributes.CanLogin)
	s.Equal(int32(5), login.Attributes.ConnectionLimit)
	s.False(login.IsSystemRole)
	s.Require().NotNil(login.Attributes.ValidUntil, "qltest_login has a finite VALID UNTIL")
	s.Equal(2030, login.Attributes.ValidUntil.Year())
	s.Contains(login.Attributes.ConfigParameters, "work_mem=64MB")
	s.Require().Len(login.MemberOf, 1)
	s.Equal("qltest_parent", login.MemberOf[0].RoleName)
	s.True(login.MemberOf[0].AdminOption)

	parent, ok := roleMap["qltest_parent"]
	s.Require().True(ok, "qltest_parent should be listed")
	s.False(parent.Attributes.CanLogin)
	s.Nil(parent.Attributes.ValidUntil, "'infinity' VALID UNTIL must surface as no expiry")
	s.Empty(parent.MemberOf)

	// Built-in pg_* roles must be flagged as system roles.
	for name, role := range roleMap {
		if strings.HasPrefix(name, "pg_") {
			s.True(role.IsSystemRole, "expected %s to be flagged as a system role", name)
		}
	}

	// GetRole returns the same membership view for a single role.
	got, err := s.eng.GetRole(ctx, s.db, "qltest_login")
	s.Require().NoError(err)
	s.Require().NotNil(got)
	s.Equal("qltest_login", got.Name)
	s.True(got.Attributes.CanLogin)
	s.Require().NotNil(got.Attributes.ValidUntil)
	s.Contains(got.Attributes.ConfigParameters, "work_mem=64MB")
	s.Require().Len(got.MemberOf, 1)
	s.Equal("qltest_parent", got.MemberOf[0].RoleName)

	// Unknown role names map to ErrRoleNotFound.
	_, err = s.eng.GetRole(ctx, s.db, "qltest_does_not_exist")
	s.Require().Error(err)
	s.ErrorIs(err, engine.ErrRoleNotFound)
}

// TestListRolesPaginationAndOrdering verifies cursor pagination and ordering
// for ListRoles using the always-present built-in roles.
func (s *PostgresEngineIntegrationTestSuite) TestListRolesPaginationAndOrdering() {
	ctx := context.Background()

	page1, nextToken, err := s.eng.ListRoles(ctx, s.db, aip.Params{PageSize: 2, OrderBy: "name asc"})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(nextToken)
	s.LessOrEqual(page1[0].Name, page1[1].Name)

	page2, _, err := s.eng.ListRoles(ctx, s.db, aip.Params{PageSize: 2, PageToken: nextToken, OrderBy: "name asc"})
	s.Require().NoError(err)
	s.NotEmpty(page2)

	page1Names := make(map[string]bool)
	for _, role := range page1 {
		page1Names[role.Name] = true
	}

	for _, role := range page2 {
		s.False(page1Names[role.Name], "role %s appeared on both pages", role.Name)
	}
}

// TestListRoleGrants exercises the live aclexplode-based grant query: schema
// USAGE and table privileges granted directly to a role, WITH GRANT OPTION
// decoding, and cursor pagination. The role is cluster-level (created on the
// shared connection); the objects and grants are per-database.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleGrants() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := s.db.ExecContext(ctx, "CREATE ROLE qltest_grantee NOLOGIN")
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS grant_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_grantee")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA grant_schema",
		"CREATE TABLE grant_schema.widgets (id int)",
		"GRANT USAGE ON SCHEMA grant_schema TO qltest_grantee",
		"GRANT SELECT, INSERT ON grant_schema.widgets TO qltest_grantee WITH GRANT OPTION",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr)
	}

	grants, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_grantee", aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	type grantKey struct{ objectType, schema, object, privilege string }

	got := make(map[grantKey]engine.RoleGrant, len(grants))
	for _, g := range grants {
		got[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}] = g
	}

	schemaUsage, ok := got[grantKey{"SCHEMA", "grant_schema", "", "USAGE"}]
	s.Require().True(ok, "expected USAGE on grant_schema")
	s.False(schemaUsage.WithGrantOption)

	tableSelect, ok := got[grantKey{"TABLE", "grant_schema", "widgets", "SELECT"}]
	s.Require().True(ok, "expected SELECT on grant_schema.widgets")
	s.True(tableSelect.WithGrantOption, "SELECT was granted WITH GRANT OPTION")

	_, ok = got[grantKey{"TABLE", "grant_schema", "widgets", "INSERT"}]
	s.True(ok, "expected INSERT on grant_schema.widgets")

	// Cursor pagination: the three grants split across pages without overlap.
	page1, token, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_grantee", aip.Params{PageSize: 2})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(token)

	page2, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_grantee", aip.Params{PageSize: 2, PageToken: token})
	s.Require().NoError(err)
	s.NotEmpty(page2)

	seen := make(map[grantKey]bool, len(page1))
	for _, g := range page1 {
		seen[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}] = true
	}

	for _, g := range page2 {
		s.False(seen[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}], "grant appeared on both pages")
	}
}

// TestListRoleGrants_ExcludesOwnerImplicit verifies that a role's ownership of an
// object is never reported as a direct grant. The first GRANT/REVOKE touching an
// object materializes its ACL, at which point PostgreSQL writes an explicit owner
// self-grant (owner=arwdDxt/owner) into it. aclexplode would otherwise surface that
// as a direct grant, double-counting the object that ListRoleOwnedObjects already
// reports. Genuine grants made to the role must still appear.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleGrants_ExcludesOwnerImplicit() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := s.db.ExecContext(ctx, "CREATE ROLE qltest_acl_owner NOLOGIN")
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS acl_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_acl_owner")
	})

	for _, stmt := range []string{
		// The role owns the schema and a table within it. Granting TO PUBLIC on each
		// materializes nspacl/relacl, instantiating the owner self-grant that the
		// query must NOT report as a direct grant.
		"CREATE SCHEMA acl_schema AUTHORIZATION qltest_acl_owner",
		"GRANT USAGE ON SCHEMA acl_schema TO PUBLIC",
		"CREATE TABLE acl_schema.owned_tbl (id int)",
		"ALTER TABLE acl_schema.owned_tbl OWNER TO qltest_acl_owner",
		"GRANT SELECT ON acl_schema.owned_tbl TO PUBLIC",
		// A table the role does NOT own but is genuinely granted INSERT on — this
		// is a real direct grant and must still be reported.
		"CREATE TABLE acl_schema.granted_tbl (id int)",
		"GRANT INSERT ON acl_schema.granted_tbl TO qltest_acl_owner",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	grants, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_acl_owner", aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	type grantKey struct{ objectType, schema, object, privilege string }

	got := make(map[grantKey]bool, len(grants))
	sawOwnedTable := false
	sawOwnedSchema := false

	for _, g := range grants {
		got[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}] = true
		if g.ObjectName == "owned_tbl" {
			sawOwnedTable = true
		}

		if g.ObjectType == "SCHEMA" && g.SchemaName == "acl_schema" {
			sawOwnedSchema = true
		}
	}

	// The genuine direct grant on the non-owned table is still reported.
	s.True(got[grantKey{"TABLE", "acl_schema", "granted_tbl", "INSERT"}],
		"expected the genuine INSERT grant on the non-owned table")

	// The owner's implicit privileges on the objects it owns are NOT reported as
	// direct grants (this is what regresses without the acl.grantee <> owner filter).
	s.False(sawOwnedTable, "owner-implicit grants on the owned table leaked into direct grants")
	s.False(sawOwnedSchema, "owner-implicit grants on the owned schema leaked into direct grants")

	// Sanity: the ownership is represented — just via the ownership query, not here.
	owned, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_acl_owner", aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	ownsTable := false

	for _, o := range owned {
		if o.ObjectType == "TABLE" && o.SchemaName == "acl_schema" && o.ObjectName == "owned_tbl" {
			ownsTable = true
		}
	}

	s.True(ownsTable, "expected the owned table to be reported by ListRoleOwnedObjects")
}

// TestListRoleOwnedObjects exercises the live ownership query across all four
// branches: the connected database (pg_database.datdba), a schema, relations,
// and a function. Ownership is the access source most often missed when a role
// shows no direct grants. Cursor pagination must keep the synthesized DATABASE
// row (which sorts first on its empty schema) stable across page boundaries.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleOwnedObjects() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := s.db.ExecContext(ctx, "CREATE ROLE qltest_owner NOLOGIN")
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		// Robust under either teardown ordering: drop the owned objects and clear
		// the datdba dependency before dropping the role. If TearDownTest already
		// dropped the database, these error harmlessly and the role drop still
		// succeeds.
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS owned_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, fmt.Sprintf("ALTER DATABASE %q OWNER TO CURRENT_USER", s.testDBName))
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_owner")
	})

	for _, stmt := range []string{
		fmt.Sprintf("ALTER DATABASE %q OWNER TO qltest_owner", s.testDBName),
		"CREATE SCHEMA owned_schema AUTHORIZATION qltest_owner",
		"CREATE TABLE owned_schema.widgets (id int)",
		"ALTER TABLE owned_schema.widgets OWNER TO qltest_owner",
		"CREATE VIEW owned_schema.widget_view AS SELECT 1 AS one",
		"ALTER VIEW owned_schema.widget_view OWNER TO qltest_owner",
		"CREATE SEQUENCE owned_schema.widget_seq",
		"ALTER SEQUENCE owned_schema.widget_seq OWNER TO qltest_owner",
		"CREATE FUNCTION owned_schema.widget_count() RETURNS int LANGUAGE sql AS 'SELECT 1'",
		"ALTER FUNCTION owned_schema.widget_count() OWNER TO qltest_owner",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	objects, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_owner", aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	type ownedKey struct{ objectType, schema, object string }

	got := make(map[ownedKey]engine.OwnedObject, len(objects))
	for _, o := range objects {
		got[ownedKey{o.ObjectType, o.SchemaName, o.ObjectName}] = o
	}

	_, ok := got[ownedKey{"DATABASE", "", s.testDBName}]
	s.True(ok, "expected ownership of the connected database itself")
	_, ok = got[ownedKey{"SCHEMA", "owned_schema", ""}]
	s.True(ok, "expected ownership of owned_schema")
	_, ok = got[ownedKey{"TABLE", "owned_schema", "widgets"}]
	s.True(ok, "expected ownership of owned_schema.widgets")
	_, ok = got[ownedKey{"VIEW", "owned_schema", "widget_view"}]
	s.True(ok, "expected ownership of owned_schema.widget_view")
	_, ok = got[ownedKey{"SEQUENCE", "owned_schema", "widget_seq"}]
	s.True(ok, "expected ownership of owned_schema.widget_seq")
	_, ok = got[ownedKey{"FUNCTION", "owned_schema", "widget_count()"}]
	s.True(ok, "expected ownership of owned_schema.widget_count()")

	// System schemas are excluded: the bootstrap superuser (testuser) owns all of
	// pg_catalog and information_schema. Without the filter, listing its owned
	// objects would return hundreds of catalog rows and bury real objects.
	superObjects, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "testuser", aip.Params{PageSize: 1000})
	s.Require().NoError(err)
	s.Less(len(superObjects), 50, "bootstrap superuser owned objects should be small once system schemas are excluded")

	for _, o := range superObjects {
		s.NotEqual("pg_catalog", o.SchemaName, "pg_catalog must be excluded from owned objects")
		s.NotEqual("information_schema", o.SchemaName, "information_schema must be excluded from owned objects")
	}

	// Cursor pagination across the boundary that includes the DATABASE row.
	page1, token, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_owner", aip.Params{PageSize: 2})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(token)
	// The DATABASE row sorts first (empty schema_name) and must land on page 1.
	s.Equal("DATABASE", page1[0].ObjectType)

	page2, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_owner", aip.Params{PageSize: 2, PageToken: token})
	s.Require().NoError(err)
	s.NotEmpty(page2)

	seen := make(map[ownedKey]bool, len(page1))
	for _, o := range page1 {
		seen[ownedKey{o.ObjectType, o.SchemaName, o.ObjectName}] = true
	}

	for _, o := range page2 {
		s.False(seen[ownedKey{o.ObjectType, o.SchemaName, o.ObjectName}], "owned object appeared on both pages")
	}
}

// TestListRoleDefaultPrivileges exercises the live pg_default_acl query: a
// schema-scoped default, a sequence default WITH GRANT OPTION, and a DB-wide
// default (defaclnamespace = 0 surfacing as an empty schema). Default privileges
// pre-grant access to objects the creator role makes later.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleDefaultPrivileges() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	for _, stmt := range []string{
		"CREATE ROLE qltest_dp_creator NOLOGIN",
		"CREATE ROLE qltest_dp_grantee NOLOGIN",
	} {
		_, execErr := s.db.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP OWNED BY qltest_dp_creator, qltest_dp_grantee CASCADE")
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS dp_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_dp_grantee")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_dp_creator")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA dp_schema",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_dp_creator IN SCHEMA dp_schema GRANT SELECT ON TABLES TO qltest_dp_grantee",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_dp_creator IN SCHEMA dp_schema GRANT USAGE ON SEQUENCES TO qltest_dp_grantee WITH GRANT OPTION",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_dp_creator GRANT SELECT ON TABLES TO qltest_dp_grantee",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	privileges, _, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_dp_grantee", aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	type dpKey struct{ creator, objectType, schema, privilege string }

	got := make(map[dpKey]engine.RoleDefaultPrivilege, len(privileges))
	for _, p := range privileges {
		got[dpKey{p.CreatorRoleName, p.ObjectType, p.SchemaName, p.Privilege}] = p
	}

	schemaTable, ok := got[dpKey{"qltest_dp_creator", "TABLES", "dp_schema", "SELECT"}]
	s.Require().True(ok, "expected schema-scoped TABLES SELECT default")
	s.False(schemaTable.WithGrantOption)

	seqDefault, ok := got[dpKey{"qltest_dp_creator", "SEQUENCES", "dp_schema", "USAGE"}]
	s.Require().True(ok, "expected schema-scoped SEQUENCES USAGE default")
	s.True(seqDefault.WithGrantOption, "USAGE was granted WITH GRANT OPTION")

	_, ok = got[dpKey{"qltest_dp_creator", "TABLES", "", "SELECT"}]
	s.True(ok, "expected DB-wide TABLES SELECT default with an empty schema")
}

// TestListRoleOwnedObjectsFilter exercises server-side filtering on the live
// owned-objects query: bounded object_type equality, object_name ILIKE
// substring, a combined AND, an out-of-vocabulary enum value, and the
// filter+cursor round trip (consistent next page; changed filter rejected).
func (s *PostgresEngineIntegrationTestSuite) TestListRoleOwnedObjectsFilter() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := s.db.ExecContext(ctx, "CREATE ROLE qltest_fowner NOLOGIN")
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS fown_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_fowner")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA fown_schema AUTHORIZATION qltest_fowner",
		"CREATE TABLE fown_schema.alpha_tbl (id int)",
		"ALTER TABLE fown_schema.alpha_tbl OWNER TO qltest_fowner",
		"CREATE TABLE fown_schema.beta_tbl (id int)",
		"ALTER TABLE fown_schema.beta_tbl OWNER TO qltest_fowner",
		"CREATE VIEW fown_schema.alpha_view AS SELECT 1 AS one",
		"ALTER VIEW fown_schema.alpha_view OWNER TO qltest_fowner",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	// Bounded object_type equality returns only the two tables.
	tables, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLE"`,
	})
	s.Require().NoError(err)
	s.Require().Len(tables, 2)

	for _, o := range tables {
		s.Equal("TABLE", o.ObjectType)
	}

	// object_name ILIKE substring is case-insensitive and spans kinds.
	alpha, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize: 1000,
		Filter:   `object_name:"ALPHA"`,
	})
	s.Require().NoError(err)

	alphaNames := make(map[string]bool, len(alpha))
	for _, o := range alpha {
		alphaNames[o.ObjectName] = true
	}

	s.True(alphaNames["alpha_tbl"], "expected alpha_tbl")
	s.True(alphaNames["alpha_view"], "expected alpha_view")
	s.False(alphaNames["beta_tbl"], "beta_tbl must not match ALPHA")

	// Combined AND narrows to a single row.
	combined, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLE" AND object_name:"alpha"`,
	})
	s.Require().NoError(err)
	s.Require().Len(combined, 1)
	s.Equal("alpha_tbl", combined[0].ObjectName)

	// A value outside the bounded set is an invalid filter, not an empty result.
	_, _, err = s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "NOPE"`,
	})
	s.Require().ErrorIs(err, engine.ErrInvalidFilter)

	// Filter + cursor round trip.
	page1, token, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize: 1,
		Filter:   `object_type = "TABLE"`,
	})
	s.Require().NoError(err)
	s.Require().Len(page1, 1)
	s.Require().NotEmpty(token)

	page2, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize:  1,
		PageToken: token,
		Filter:    `object_type = "TABLE"`,
	})
	s.Require().NoError(err)
	s.Require().Len(page2, 1)
	s.NotEqual(page1[0].ObjectName, page2[0].ObjectName, "pages must not overlap under the same filter")

	// Changing the filter mid-pagination is rejected by the page-token hash.
	_, _, err = s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_fowner", aip.Params{
		PageSize:  1,
		PageToken: token,
		Filter:    `object_type = "VIEW"`,
	})
	s.ErrorIs(err, engine.ErrFilterMismatch)
}

// TestListRoleDefaultPrivilegesFilter exercises server-side filtering on the
// live default-privileges query: the plural object_type vocabulary, an unbounded
// privilege filter, rejection of the singular owned-objects vocabulary, and the
// changed-filter page-token guard.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleDefaultPrivilegesFilter() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	for _, stmt := range []string{
		"CREATE ROLE qltest_fdp_creator NOLOGIN",
		"CREATE ROLE qltest_fdp_grantee NOLOGIN",
	} {
		_, execErr := s.db.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP OWNED BY qltest_fdp_creator, qltest_fdp_grantee CASCADE")
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS fdp_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_fdp_grantee")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_fdp_creator")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA fdp_schema",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_fdp_creator IN SCHEMA fdp_schema GRANT SELECT ON TABLES TO qltest_fdp_grantee",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_fdp_creator IN SCHEMA fdp_schema GRANT USAGE ON SEQUENCES TO qltest_fdp_grantee",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	// Plural object_type vocabulary.
	tables, _, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_fdp_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLES"`,
	})
	s.Require().NoError(err)
	s.Require().NotEmpty(tables)

	for _, p := range tables {
		s.Equal("TABLES", p.ObjectType)
	}

	// Unbounded privilege filter.
	usage, _, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_fdp_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `privilege = "USAGE"`,
	})
	s.Require().NoError(err)
	s.Require().NotEmpty(usage)

	for _, p := range usage {
		s.Equal("USAGE", p.Privilege)
	}

	// The singular owned-objects token is not valid here (different vocabulary).
	_, _, err = s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_fdp_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLE"`,
	})
	s.Require().ErrorIs(err, engine.ErrInvalidFilter)

	// Changing the filter mid-pagination is rejected.
	_, token, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_fdp_grantee", aip.Params{
		PageSize: 1,
		Filter:   `object_type = "TABLES"`,
	})
	s.Require().NoError(err)

	if token != "" {
		_, _, err = s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_fdp_grantee", aip.Params{
			PageSize:  1,
			PageToken: token,
			Filter:    `object_type = "SEQUENCES"`,
		})
		s.ErrorIs(err, engine.ErrFilterMismatch)
	}
}

// TestListRoleGrantsFilter exercises server-side filtering on the live grants
// query: privilege equality, object_name substring, bounded object_type, and
// an out-of-vocabulary enum value.
func (s *PostgresEngineIntegrationTestSuite) TestListRoleGrantsFilter() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	_, err := s.db.ExecContext(ctx, "CREATE ROLE qltest_fgrants NOLOGIN")
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP OWNED BY qltest_fgrants CASCADE")
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS fgr_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_fgrants")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA fgr_schema",
		"CREATE TABLE fgr_schema.orders_tbl (id int)",
		"CREATE TABLE fgr_schema.users_tbl (id int)",
		"GRANT SELECT ON fgr_schema.orders_tbl TO qltest_fgrants",
		"GRANT INSERT ON fgr_schema.orders_tbl TO qltest_fgrants",
		"GRANT SELECT ON fgr_schema.users_tbl TO qltest_fgrants",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	// Unbounded privilege equality.
	selects, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_fgrants", aip.Params{
		PageSize: 1000,
		Filter:   `privilege = "SELECT" AND schema_name = "fgr_schema"`,
	})
	s.Require().NoError(err)
	s.Require().Len(selects, 2)

	for _, g := range selects {
		s.Equal("SELECT", g.Privilege)
	}

	// object_name ILIKE substring.
	orders, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_fgrants", aip.Params{
		PageSize: 1000,
		Filter:   `object_name:"ORDERS"`,
	})
	s.Require().NoError(err)
	s.Require().Len(orders, 2)

	for _, g := range orders {
		s.Equal("orders_tbl", g.ObjectName)
	}

	// Bounded object_type equality.
	tables, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_fgrants", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLE" AND schema_name = "fgr_schema"`,
	})
	s.Require().NoError(err)
	s.Require().Len(tables, 3)

	// A value outside the bounded set is an invalid filter, not an empty result.
	_, _, err = s.eng.ListRoleGrants(ctx, testDB, "qltest_fgrants", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "TABLES"`,
	})
	s.Require().ErrorIs(err, engine.ErrInvalidFilter)
}

func (s *PostgresEngineIntegrationTestSuite) TestPG17MaintainPrivilegeRolePublicAndDefaultGrants() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	s.requirePostgresAtLeast(ctx, testDB, 17)

	for _, stmt := range []string{
		"CREATE ROLE qltest_maint_creator NOLOGIN",
		"CREATE ROLE qltest_maint_grantee NOLOGIN",
	} {
		_, execErr := s.db.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP OWNED BY qltest_maint_creator, qltest_maint_grantee CASCADE")
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS maint_schema CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_maint_grantee")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_maint_creator")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA maint_schema",
		"CREATE TABLE maint_schema.direct_tbl (id int)",
		"GRANT MAINTAIN ON maint_schema.direct_tbl TO qltest_maint_grantee",
		"GRANT MAINTAIN ON maint_schema.direct_tbl TO PUBLIC",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_maint_creator IN SCHEMA maint_schema GRANT MAINTAIN ON TABLES TO qltest_maint_grantee",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	roleGrants, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_maint_grantee", aip.Params{
		PageSize: 1,
		Filter:   `privilege = "MAINTAIN"`,
		OrderBy:  "privilege asc, object_name asc",
	})
	s.Require().NoError(err)
	s.Require().Len(roleGrants, 1)
	s.Equal("MAINTAIN", roleGrants[0].Privilege)

	publicGrants, _, err := s.eng.ListPublicGrants(ctx, testDB, aip.Params{
		PageSize: 1000,
		Filter:   `privilege = "MAINTAIN" AND schema_name = "maint_schema"`,
	})
	s.Require().NoError(err)
	s.Require().Len(publicGrants, 1)
	s.Equal("MAINTAIN", publicGrants[0].Privilege)

	defaultPrivileges, _, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_maint_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `privilege = "MAINTAIN" AND object_type = "TABLES"`,
	})
	s.Require().NoError(err)
	s.Require().Len(defaultPrivileges, 1)
	s.Equal("MAINTAIN", defaultPrivileges[0].Privilege)
}

func (s *PostgresEngineIntegrationTestSuite) TestPG18LargeObjectRolePublicOwnedAndDefaultPrivileges() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	s.requirePostgresAtLeast(ctx, testDB, 18)

	for _, stmt := range []string{
		"CREATE ROLE qltest_lo_creator NOLOGIN",
		"CREATE ROLE qltest_lo_grantee NOLOGIN",
	} {
		_, execErr := s.db.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "SELECT lo_unlink(910277)")
		_, _ = testDB.ExecContext(ctx, "SELECT lo_unlink(910278)")
		_, _ = testDB.ExecContext(ctx, "DROP OWNED BY qltest_lo_creator, qltest_lo_grantee CASCADE")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_lo_grantee")
		_, _ = s.db.ExecContext(ctx, "DROP ROLE IF EXISTS qltest_lo_creator")
	})

	for _, stmt := range []string{
		"SELECT pg_catalog.lo_unlink(910277) WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata WHERE oid = 910277)",
		"SELECT pg_catalog.lo_unlink(910278) WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata WHERE oid = 910278)",
		"SELECT lo_create(910277)",
		"SELECT lo_create(910278)",
		"ALTER LARGE OBJECT 910278 OWNER TO qltest_lo_grantee",
		"GRANT SELECT ON LARGE OBJECT 910277 TO qltest_lo_grantee WITH GRANT OPTION",
		"GRANT UPDATE ON LARGE OBJECT 910277 TO PUBLIC",
		"ALTER DEFAULT PRIVILEGES FOR ROLE qltest_lo_creator GRANT SELECT ON LARGE OBJECTS TO qltest_lo_grantee",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	roleGrants, _, err := s.eng.ListRoleGrants(ctx, testDB, "qltest_lo_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "LARGE_OBJECT"`,
	})
	s.Require().NoError(err)
	s.Require().Len(roleGrants, 1)
	s.Equal("LARGE_OBJECT", roleGrants[0].ObjectType)
	s.Empty(roleGrants[0].SchemaName)
	s.Equal("910277", roleGrants[0].ObjectName)
	s.Equal("SELECT", roleGrants[0].Privilege)
	s.True(roleGrants[0].WithGrantOption)

	publicGrants, _, err := s.eng.ListPublicGrants(ctx, testDB, aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "LARGE_OBJECT"`,
	})
	s.Require().NoError(err)
	s.Require().Len(publicGrants, 1)
	s.Equal("910277", publicGrants[0].ObjectName)
	s.Equal("UPDATE", publicGrants[0].Privilege)

	ownedObjects, _, err := s.eng.ListRoleOwnedObjects(ctx, testDB, "qltest_lo_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "LARGE_OBJECT"`,
	})
	s.Require().NoError(err)
	s.Require().Len(ownedObjects, 1)
	s.Equal("910278", ownedObjects[0].ObjectName)

	defaultPrivileges, _, err := s.eng.ListRoleDefaultPrivileges(ctx, testDB, "qltest_lo_grantee", aip.Params{
		PageSize: 1000,
		Filter:   `object_type = "LARGE_OBJECTS"`,
	})
	s.Require().NoError(err)
	s.Require().Len(defaultPrivileges, 1)
	s.Equal("qltest_lo_creator", defaultPrivileges[0].CreatorRoleName)
	s.Equal("LARGE_OBJECTS", defaultPrivileges[0].ObjectType)
	s.Empty(defaultPrivileges[0].SchemaName)
	s.Equal("SELECT", defaultPrivileges[0].Privilege)
}

// TestListPublicGrants exercises the live PUBLIC grant query: explicit
// GRANT ... TO PUBLIC entries plus the synthesized DATABASE CONNECT/TEMPORARY
// defaults on a fresh database (datacl unset). After an explicit database grant
// materializes datacl, the synthesized branch must stop firing so CONNECT is not
// double-counted.
func (s *PostgresEngineIntegrationTestSuite) TestListPublicGrants() {
	ctx := context.Background()

	testDB := s.getTestDBConnection()
	defer testDB.Close()

	s.T().Cleanup(func() {
		_, _ = testDB.ExecContext(ctx, "DROP SCHEMA IF EXISTS pub_schema CASCADE")
	})

	for _, stmt := range []string{
		"CREATE SCHEMA pub_schema",
		"CREATE TABLE pub_schema.lookup (id int)",
		"GRANT USAGE ON SCHEMA pub_schema TO PUBLIC",
		"GRANT SELECT ON pub_schema.lookup TO PUBLIC",
	} {
		_, execErr := testDB.ExecContext(ctx, stmt)
		s.Require().NoError(execErr, stmt)
	}

	type grantKey struct{ objectType, schema, object, privilege string }

	collect := func(grants []engine.RoleGrant) map[grantKey]engine.RoleGrant {
		out := make(map[grantKey]engine.RoleGrant, len(grants))
		for _, g := range grants {
			out[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}] = g
		}

		return out
	}

	grants, _, err := s.eng.ListPublicGrants(ctx, testDB, aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	got := collect(grants)

	// Synthesized database-level defaults on the fresh (datacl IS NULL) database.
	dbConnect, ok := got[grantKey{"DATABASE", "", s.testDBName, "CONNECT"}]
	s.Require().True(ok, "expected synthesized PUBLIC CONNECT on the fresh database")
	s.Empty(dbConnect.Grantor, "synthesized rows carry no grantor")
	_, ok = got[grantKey{"DATABASE", "", s.testDBName, "TEMPORARY"}]
	s.True(ok, "expected synthesized PUBLIC TEMPORARY on the fresh database")

	// Explicit GRANT ... TO PUBLIC entries.
	_, ok = got[grantKey{"SCHEMA", "pub_schema", "", "USAGE"}]
	s.True(ok, "expected explicit PUBLIC USAGE on pub_schema")
	_, ok = got[grantKey{"TABLE", "pub_schema", "lookup", "SELECT"}]
	s.True(ok, "expected explicit PUBLIC SELECT on pub_schema.lookup")

	// System schemas grant USAGE to PUBLIC by default but are excluded as noise;
	// the user-facing public schema and pub_schema are retained.
	for _, g := range grants {
		s.NotEqual("pg_catalog", g.SchemaName, "pg_catalog must be excluded from PUBLIC grants")
		s.NotEqual("information_schema", g.SchemaName, "information_schema must be excluded from PUBLIC grants")
	}

	// Materialize datacl with an explicit database grant; the synthesized branch
	// (datacl IS NULL) must no longer fire, so CONNECT appears exactly once.
	_, err = testDB.ExecContext(ctx, fmt.Sprintf("GRANT CONNECT ON DATABASE %q TO PUBLIC", s.testDBName))
	s.Require().NoError(err)

	grants, _, err = s.eng.ListPublicGrants(ctx, testDB, aip.Params{PageSize: 1000})
	s.Require().NoError(err)

	connectCount := 0

	for _, g := range grants {
		if g.ObjectType == "DATABASE" && g.Privilege == "CONNECT" {
			connectCount++
		}
	}

	s.Equal(1, connectCount, "DATABASE CONNECT must not be double-counted once datacl is materialized")

	// Pagination across the explicit + synthesized rows must not overlap.
	page1, token, err := s.eng.ListPublicGrants(ctx, testDB, aip.Params{PageSize: 2})
	s.Require().NoError(err)
	s.Len(page1, 2)
	s.NotEmpty(token)

	page2, _, err := s.eng.ListPublicGrants(ctx, testDB, aip.Params{PageSize: 2, PageToken: token})
	s.Require().NoError(err)

	seen := make(map[grantKey]bool, len(page1))
	for _, g := range page1 {
		seen[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}] = true
	}

	for _, g := range page2 {
		s.False(seen[grantKey{g.ObjectType, g.SchemaName, g.ObjectName, g.Privilege}], "public grant appeared on both pages")
	}
}

func (s *PostgresEngineIntegrationTestSuite) createWarningFunction(ctx context.Context, db *sql.DB) {
	s.T().Helper()

	_, err := db.ExecContext(ctx, `
		CREATE OR REPLACE FUNCTION public.ql_notice_warning(label text)
		RETURNS integer
		LANGUAGE plpgsql
		AS $$
		BEGIN
			RAISE WARNING 'querylane warning: %', label;
			RETURN 7;
		END
		$$;
	`)
	s.Require().NoError(err)
}

func (s *PostgresEngineIntegrationTestSuite) executeQueryStats(ctx context.Context, db *sql.DB, statement string) engine.ExecuteQueryStats {
	s.T().Helper()

	stream, err := s.eng.ExecuteQuery(ctx, db, engine.ExecuteQueryParams{
		Statement: statement,
		Timeout:   5 * time.Second,
	})
	s.Require().NoError(err)

	for stream.Next() {
	}

	s.Require().NoError(stream.Err())
	s.Require().NoError(stream.Close())

	return stream.Stats()
}

// getTestDBName returns a unique database name for the current test.
func (s *PostgresEngineIntegrationTestSuite) getTestDBName() string {
	return testutil.SanitizeDatabaseName("test_" + s.T().Name())
}

// getTestDBConnection returns a connection to the current test database.
func (s *PostgresEngineIntegrationTestSuite) getTestDBConnection() *sql.DB {
	ctx := context.Background()

	db, err := s.container.ConnectToDatabase(ctx, s.testDBName)
	s.Require().NoError(err)

	return db
}

func (s *PostgresEngineIntegrationTestSuite) requirePostgresAtLeast(ctx context.Context, db *sql.DB, major int) {
	currentMajor := s.postgresMajor(ctx, db)
	if currentMajor < major {
		s.T().Skipf("PostgreSQL %d+ required, container is %d", major, currentMajor)
	}
}

func (s *PostgresEngineIntegrationTestSuite) postgresMajor(ctx context.Context, db *sql.DB) int {
	var versionNumber int

	err := db.QueryRowContext(ctx, "SHOW server_version_num").Scan(&versionNumber)
	s.Require().NoError(err)

	return versionNumber / 10000
}

// TestIntegration runs the integration test suite.
func TestIntegration(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(PostgresEngineIntegrationTestSuite))
}
