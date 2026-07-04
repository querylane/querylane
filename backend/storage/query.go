package storage

import (
	"context"
	"database/sql"
)

// QueryExecutor defines the interface for both *sql.DB and *sql.Tx.
// This allows repositories to work with either a database connection or a transaction
// in a transparent way, enabling transaction-based testing and transactional operations.
type QueryExecutor interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}
