package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
)

// RunInTransaction executes the given function within a database transaction.
// If the function returns an error, the transaction is rolled back.
// Otherwise, the transaction is committed.
func RunInTransaction(ctx context.Context, db *sql.DB, fn func(QueryExecutor) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()

			panic(p) //nolint:forbidigo // necessary for transaction panic recovery
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("failed to rollback transaction: %w (original error: %w)", rbErr, err)
		}

		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// ParsePostgresError converts PostgreSQL errors to domain-specific errors.
// This provides a consistent way to handle common database errors across repositories.
func ParsePostgresError(err error, uniqueViolationErr error) error {
	if err == nil {
		return nil
	}

	var pgxErr *pgconn.PgError
	if !errors.As(err, &pgxErr) {
		return err
	}

	mappedErr := postgresDomainError(pgxErr.Code, uniqueViolationErr)
	if mappedErr == nil {
		return err
	}

	return mappedPostgresError{err: mappedErr, cause: err}
}

type mappedPostgresError struct {
	err   error
	cause error
}

func (e mappedPostgresError) Error() string {
	return e.err.Error()
}

func (e mappedPostgresError) Unwrap() error {
	return e.err
}

func (e mappedPostgresError) As(target any) bool {
	return errors.As(e.cause, target)
}

// postgresErrorClass keeps future or extension class-level SQLSTATEs mapped even
// when pgerrcode only enumerates known exact codes for that class.
func postgresErrorClass(code string) string {
	if len(code) < 2 {
		return ""
	}

	return code[:2]
}

func postgresDomainError(code string, uniqueViolationErr error) error {
	switch {
	case code == pgerrcode.UniqueViolation:
		if uniqueViolationErr != nil {
			return uniqueViolationErr
		}

		return ErrAlreadyExists
	case code == pgerrcode.ForeignKeyViolation || code == pgerrcode.RestrictViolation:
		return ErrInvalidReference
	case pgerrcode.IsIntegrityConstraintViolation(code) || postgresErrorClass(code) == "23":
		return ErrInvalidInput
	case pgerrcode.IsTransactionRollback(code):
		return ErrConcurrentModification
	}

	return nil
}

// PaginationToken represents a cursor-based pagination token.
type PaginationToken struct {
	Timestamp time.Time
	ID        string
}

// ParsePaginationToken parses a pagination token from a string.
// Returns zero values if the token is empty or invalid.
func ParsePaginationToken(token string) (PaginationToken, error) {
	if token == "" {
		return PaginationToken{}, nil
	}

	timestamp, err := time.Parse(time.RFC3339, token)
	if err != nil {
		return PaginationToken{}, fmt.Errorf("invalid pagination token: %w", err)
	}

	return PaginationToken{Timestamp: timestamp}, nil
}

// ToString converts a pagination token to its string representation.
func (p PaginationToken) ToString() string {
	if p.Timestamp.IsZero() {
		return ""
	}

	return p.Timestamp.Format(time.RFC3339)
}
