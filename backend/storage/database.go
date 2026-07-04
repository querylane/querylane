// Package storage provides database connection management and migration utilities.
package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver

	config "github.com/querylane/querylane/backend/config/server"
)

// NewPostgresDB creates a PostgreSQL database connection using the configured DSN.
// Returns a *sql.DB instance ready for use with standard database operations.
func NewPostgresDB(ctx context.Context, cfg *config.Config) (*sql.DB, error) {
	slog.DebugContext(ctx, "connecting to app database", slog.Any("database_config", cfg.Database.Redacted()))

	if cfg.Database == nil {
		return nil, errors.New("database configuration is required")
	}

	dsn := cfg.Database.ToDSN()
	if dsn == "" {
		return nil, errors.New("database DSN is required")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	// Configure connection pool for handling React SPA concurrent requests
	db.SetMaxOpenConns(25)                 // Handle concurrent requests
	db.SetMaxIdleConns(25)                 // Efficient connection reuse
	db.SetConnMaxLifetime(5 * time.Minute) // Rotate connections regularly
	db.SetConnMaxIdleTime(2 * time.Minute) // Close idle connections

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	slog.DebugContext(ctx, "successfully connected to database", slog.Any("database_config", cfg.Database.Redacted()))

	return db, nil
}
