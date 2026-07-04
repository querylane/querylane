package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver
)

// MigrationFunc is a function that applies database migrations to a database connection.
type MigrationFunc func(*sql.DB) error

// DatabaseManager provides utilities for managing test databases.
type DatabaseManager struct {
	pgContainer *PostgreSQLContainer
	migrateFunc MigrationFunc
}

// NewDatabaseManager creates a new database manager using the given PostgreSQL container and migration function.
func NewDatabaseManager(pgContainer *PostgreSQLContainer, migrateFunc MigrationFunc) *DatabaseManager {
	return &DatabaseManager{
		pgContainer: pgContainer,
		migrateFunc: migrateFunc,
	}
}

// CreateTestDatabase creates a new isolated test database with a unique name.
// The database will have all migrations applied and be ready for testing.
func (dm *DatabaseManager) CreateTestDatabase(ctx context.Context, testName string) (*sql.DB, string, error) {
	// Create a unique database name for this test
	dbName := SanitizeDatabaseName("test_" + testName)

	// Create the database in the PostgreSQL container
	connString, err := dm.pgContainer.CreateDatabase(ctx, dbName)
	if err != nil {
		return nil, "", fmt.Errorf("failed to create test database: %w", err)
	}

	// Connect to the new database
	db, err := sql.Open("pgx", connString)
	if err != nil {
		return nil, "", fmt.Errorf("failed to connect to test database: %w", err)
	}

	// Test the connection
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, "", fmt.Errorf("failed to ping test database: %w", err)
	}

	// Apply migrations to set up the schema
	if dm.migrateFunc != nil {
		if err := dm.migrateFunc(db); err != nil {
			_ = db.Close()
			return nil, "", fmt.Errorf("failed to apply migrations to test database: %w", err)
		}
	}

	return db, dbName, nil
}

// CleanupTestDatabase closes the database connection and drops the database.
func (dm *DatabaseManager) CleanupTestDatabase(ctx context.Context, db *sql.DB, dbName string) error {
	// Close the database connection first
	if db != nil {
		if err := db.Close(); err != nil {
			// Log but don't fail on close error - using slog for structured logging
			slog.Warn("failed to close database connection", slog.Any("error", err))
		}
	}

	// Drop the database from the container
	if err := dm.pgContainer.DropDatabase(ctx, dbName); err != nil {
		return fmt.Errorf("failed to drop test database %s: %w", dbName, err)
	}

	return nil
}

// TruncateAllTables truncates all tables in the database while preserving schema.
// This is useful for cleaning up between tests without recreating the entire database.
func (dm *DatabaseManager) TruncateAllTables(ctx context.Context, db *sql.DB) error {
	// Get all table names (excluding system tables)
	rows, err := db.QueryContext(ctx, `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		  AND table_type = 'BASE TABLE'
		  AND table_name != 'goose_db_version'
	`)
	if err != nil {
		return fmt.Errorf("failed to query table names: %w", err)
	}
	defer rows.Close()

	var tableNames []string

	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return fmt.Errorf("failed to scan table name: %w", err)
		}

		tableNames = append(tableNames, tableName)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating table names: %w", err)
	}

	// Truncate all tables (with CASCADE to handle foreign key constraints)
	if len(tableNames) > 0 {
		truncateQuery := fmt.Sprintf("TRUNCATE TABLE %s RESTART IDENTITY CASCADE",
			strings.Join(tableNames, ", "))

		if _, err := db.ExecContext(ctx, truncateQuery); err != nil {
			return fmt.Errorf("failed to truncate tables: %w", err)
		}
	}

	return nil
}

// ResetSequences resets all sequences in the database to start from 1.
// This ensures consistent ID generation across test runs.
func (dm *DatabaseManager) ResetSequences(ctx context.Context, db *sql.DB) error {
	// Get all sequences in the public schema
	rows, err := db.QueryContext(ctx, `
		SELECT sequence_name 
		FROM information_schema.sequences 
		WHERE sequence_schema = 'public'
	`)
	if err != nil {
		return fmt.Errorf("failed to query sequence names: %w", err)
	}
	defer rows.Close()

	var sequenceNames []string

	for rows.Next() {
		var sequenceName string
		if err := rows.Scan(&sequenceName); err != nil {
			return fmt.Errorf("failed to scan sequence name: %w", err)
		}

		sequenceNames = append(sequenceNames, sequenceName)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating sequence names: %w", err)
	}

	// Reset each sequence to start from 1
	for _, seqName := range sequenceNames {
		if _, err := db.ExecContext(ctx, fmt.Sprintf("ALTER SEQUENCE %s RESTART WITH 1", seqName)); err != nil {
			return fmt.Errorf("failed to reset sequence %s: %w", seqName, err)
		}
	}

	return nil
}
