package storage

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"time"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

// MigrateDBResult contains information about a completed migration run.
type MigrateDBResult struct {
	// StartVersion is the schema version before the migration ran.
	StartVersion int64
	// EndVersion is the schema version after the migration ran.
	EndVersion int64
	// StepsApplied is the number of migration steps that were executed.
	StepsApplied int
	// TotalDuration is the wall-clock time for the entire migration run.
	TotalDuration time.Duration
}

// NewGooseProvider creates a goose Provider for use with the embedded migration
// files. This is used by both the automatic startup path and the CLI commands.
func NewGooseProvider(db *sql.DB) (*goose.Provider, error) {
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("failed to create session locker: %w", err)
	}

	// embed.FS includes the "migrations/" prefix — strip it so goose sees the SQL files at root.
	fsys, err := fs.Sub(embedMigrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to create sub filesystem: %w", err)
	}

	return goose.NewProvider(
		goose.DialectPostgres,
		db,
		fsys,
		goose.WithSessionLocker(locker),
	)
}

// MigrateDB runs all pending up migrations with structured logging.
func MigrateDB(ctx context.Context, db *sql.DB) (*MigrateDBResult, error) {
	provider, err := NewGooseProvider(db)
	if err != nil {
		return nil, err
	}

	startVersion, err := provider.GetDBVersion(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current version: %w", err)
	}

	slog.InfoContext(ctx, "starting database migrations",
		slog.Int64("current_version", startVersion))

	start := time.Now()

	results, err := provider.Up(ctx)
	if err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	duration := time.Since(start)

	for _, r := range results {
		slog.InfoContext(ctx, "migration applied",
			slog.Int64("version", r.Source.Version),
			slog.Duration("duration", r.Duration),
		)
	}

	endVersion, _ := provider.GetDBVersion(ctx)

	if len(results) > 0 {
		slog.InfoContext(ctx, "database migrations completed",
			slog.Int64("version", endVersion),
			slog.Int("steps_applied", len(results)),
			slog.Duration("total_duration", duration),
		)
	} else {
		slog.InfoContext(ctx, "database schema is up to date",
			slog.Int64("version", endVersion),
		)
	}

	return &MigrateDBResult{
		StartVersion:  startVersion,
		EndVersion:    endVersion,
		StepsApplied:  len(results),
		TotalDuration: duration,
	}, nil
}
