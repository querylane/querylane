// Package postgres implements the PostgreSQL-specific engine: live system
// catalog queries (databases, schemas, tables, views, columns, constraints,
// indexes, policies, triggers, server info) and paginated table-data reads.
//
// Each resource type lives in its own file: databases.go, tables.go,
// table_metadata.go, server_info.go. SQL strings come from queries.go.
package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/engine"
)

// Postgres implements the PostgreSQL-specific engine behavior.
type Postgres struct {
	tokens *engine.TokenCodec
}

// New creates a new PostgreSQL engine implementation. The token codec is
// used by ReadRows / ReadCellValue to mint and verify opaque tokens
// (page_token, full_value_token).
func New(tokens *engine.TokenCodec) *Postgres {
	if tokens == nil {
		panic("postgres.New: token codec is required") //nolint:forbidigo // programmer error during DI setup
	}

	return &Postgres{tokens: tokens}
}

// TestConnection validates that the PostgreSQL connection is working.
func (*Postgres) TestConnection(ctx context.Context, db *sql.DB) error {
	var result int

	err := db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.InvalidCatalogName {
			return fmt.Errorf("%w: %w", engine.ErrDatabaseNotFound, err)
		}

		return fmt.Errorf("connection test failed: %w", err)
	}

	if result != 1 {
		return fmt.Errorf("unexpected connection test result: %d", result)
	}

	return nil
}
