// Package sampledata provides embedded SQL that seeds a PostgreSQL database
// with realistic sample schemas, tables, and rows. It is used by both
// integration tests and demo environments.
package sampledata

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
)

//go:embed sql/*.sql
var sqlFS embed.FS

// Apply seeds the given database with sample schemas, tables, and data.
// SQL files are applied in lexicographic order (01_, 02_, 03_).
// Safe to call multiple times (all statements are idempotent).
func Apply(ctx context.Context, db *sql.DB) error {
	entries, err := fs.ReadDir(sqlFS, "sql")
	if err != nil {
		return fmt.Errorf("reading embedded sql directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		data, err := fs.ReadFile(sqlFS, "sql/"+entry.Name())
		if err != nil {
			return fmt.Errorf("reading %s: %w", entry.Name(), err)
		}

		if _, err := db.ExecContext(ctx, string(data)); err != nil {
			return fmt.Errorf("applying %s: %w", entry.Name(), err)
		}
	}

	return nil
}
