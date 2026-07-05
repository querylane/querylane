// Package migrate provides CLI commands for managing database schema migrations.
// These commands are intended for operators to diagnose and recover from migration
// issues without needing direct database access.
package migrate

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib" // PostgreSQL driver

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/storage"
)

// Command contains all migration-related commands.
type Command struct {
	Up      UpCmd      `cmd:"" help:"Apply all pending migrations"`
	UpTo    UpToCmd    `cmd:"" help:"Migrate up to a specific version"`
	Down    DownCmd    `cmd:"" help:"Roll back the last applied migration"`
	DownTo  DownToCmd  `cmd:"" help:"Roll back down to a specific version"`
	Version VersionCmd `cmd:"" help:"Print the current migration version"`
	Status  StatusCmd  `cmd:"" help:"Show status of all migrations"`
}

// DatabaseFlags provides shared flags for connecting to the meta database.
// Either --dsn or --config must be provided.
type DatabaseFlags struct {
	Config string `env:"QUERYLANE_CONFIG"       help:"Path to Querylane config file" type:"path" xor:"db"`
	DSN    string `env:"QUERYLANE_DATABASE_DSN" help:"PostgreSQL connection string"  xor:"db"`
}

// openDB resolves the DSN and opens a database connection.
func (f *DatabaseFlags) openDB(ctx context.Context) (*sql.DB, error) {
	dsn, err := f.resolveDSN(ctx)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return db, nil
}

// resolveDSN returns a DSN from either the --dsn flag or by loading the config file.
func (f *DatabaseFlags) resolveDSN(ctx context.Context) (string, error) {
	if f.DSN != "" {
		return f.DSN, nil
	}

	if f.Config == "" {
		return "", errors.New("either --dsn or --config is required")
	}

	cfg := serverconfig.Config{}
	cfg.SetDefaults()

	configManager, err := config.NewConfigManager(ctx, &cfg, config.WithConfigFile(f.Config))
	if err != nil {
		return "", fmt.Errorf("failed to load config: %w", err)
	}
	defer configManager.Stop()

	loaded := configManager.CurrentConfig()
	if loaded.Database == nil {
		return "", errors.New("no database configuration found in config file")
	}

	return loaded.Database.ToDSN(), nil
}

// UpCmd applies all pending forward migrations.
type UpCmd struct {
	DatabaseFlags
}

// Run applies all pending forward migrations.
func (cmd *UpCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	result, err := storage.MigrateDB(ctx, db)
	if err != nil {
		return err
	}

	if result.StepsApplied == 0 {
		writeOutf("Already up to date.\n")
	} else {
		writeOutf("Applied %d migration(s). Version: %d\n", result.StepsApplied, result.EndVersion)
	}

	return nil
}

// UpToCmd migrates up to a specific version.
type UpToCmd struct {
	DatabaseFlags

	Version int64 `arg:"" help:"Target migration version"`
}

// Run applies forward migrations up to (and including) the target version.
func (cmd *UpToCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := storage.NewGooseProvider(db)
	if err != nil {
		return err
	}

	results, err := provider.UpTo(ctx, cmd.Version)
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	if len(results) == 0 {
		writeOutf("Already at version %d or higher.\n", cmd.Version)
	} else {
		for _, r := range results {
			writeOutf("Applied version %d (%v)\n", r.Source.Version, r.Duration)
		}
	}

	return nil
}

// DownCmd rolls back the last applied migration.
type DownCmd struct {
	DatabaseFlags
}

// Run rolls back the most recent applied migration.
func (cmd *DownCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := storage.NewGooseProvider(db)
	if err != nil {
		return err
	}

	result, err := provider.Down(ctx)
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}

	if result.Source == nil {
		writeOutf("No migrations to roll back.\n")
	} else {
		writeOutf("Rolled back version %d (%v)\n", result.Source.Version, result.Duration)
	}

	return nil
}

// DownToCmd rolls back down to a specific version (inclusive).
type DownToCmd struct {
	DatabaseFlags

	Version int64 `arg:"" help:"Target migration version to roll back to"`
}

// Run rolls back applied migrations down to (and including) the target version.
func (cmd *DownToCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := storage.NewGooseProvider(db)
	if err != nil {
		return err
	}

	results, err := provider.DownTo(ctx, cmd.Version)
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}

	if len(results) == 0 {
		writeOutf("Already at version %d or lower.\n", cmd.Version)
	} else {
		for _, r := range results {
			writeOutf("Rolled back version %d (%v)\n", r.Source.Version, r.Duration)
		}
	}

	return nil
}

// VersionCmd prints the current migration version.
type VersionCmd struct {
	DatabaseFlags
}

// Run prints the current migration version.
func (cmd *VersionCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := storage.NewGooseProvider(db)
	if err != nil {
		return err
	}

	version, err := provider.GetDBVersion(ctx)
	if err != nil {
		return fmt.Errorf("failed to read version: %w", err)
	}

	writeOutf("Version: %d\n", version)

	return nil
}

// StatusCmd shows the status of all migrations.
type StatusCmd struct {
	DatabaseFlags
}

// Run prints each migration's applied/pending state.
func (cmd *StatusCmd) Run(g *config.Globals) error {
	setupLogger(g)

	ctx := context.Background()

	db, err := cmd.openDB(ctx)
	if err != nil {
		return err
	}
	defer db.Close()

	provider, err := storage.NewGooseProvider(db)
	if err != nil {
		return err
	}

	statuses, err := provider.Status(ctx)
	if err != nil {
		return fmt.Errorf("failed to get status: %w", err)
	}

	writeOutf("%-10s %-30s %-10s %s\n", "VERSION", "NAME", "STATE", "APPLIED AT")

	for _, s := range statuses {
		appliedAt := ""
		if !s.AppliedAt.IsZero() {
			appliedAt = s.AppliedAt.Format("2006-01-02 15:04:05")
		}

		writeOutf("%-10d %-30s %-10s %s\n", s.Source.Version, s.Source.Path, s.State, appliedAt)
	}

	return nil
}

// setupLogger configures structured logging based on global CLI flags.
func setupLogger(g *config.Globals) {
	logLevel := config.ParseLogLevel(g.LogLevel, g.Verbose)
	logger := slog.New(slog.NewJSONHandler(os.Stdout, config.NewLogHandlerOptions(logLevel)))
	slog.SetDefault(logger)
}

func writeOutf(format string, args ...any) {
	fmt.Fprintf(os.Stdout, format, args...)
}
