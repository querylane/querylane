package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/engine"
)

// argList accumulates parameterised SQL arguments and hands out the
// corresponding $N placeholder for each. It replaces the old style of
// threading an `argIdx int` through every SQL-building function — that idiom
// kept piece-of-state in a return value, which made signatures noisy and
// off-by-one errors easy.
type argList struct {
	args []any
}

// add appends v and returns the placeholder text ("$N") that refers to it.
func (a *argList) add(v any) string {
	a.args = append(a.args, v)
	return fmt.Sprintf("$%d", len(a.args))
}

// addAll appends each value and returns one placeholder per value, in order.
func (a *argList) addAll(values []any) []string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = a.add(v)
	}

	return out
}

// values returns the accumulated arguments ready to pass to QueryContext.
func (a *argList) values() []any {
	return a.args
}

func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// columnRef returns a SQL expression that references a column for projection
// or comparison. `ctid` is a system pseudo-column referenced bare; all others
// are double-quoted to preserve case and escape embedded quotes.
func columnRef(name string) string {
	if name == ctidColumn {
		return ctidColumn
	}

	return quoteIdent(name)
}

// setStatementTimeout applies a per-statement timeout to the transaction.
// PostgreSQL accepts only integer milliseconds for statement_timeout.
func setStatementTimeout(ctx context.Context, tx *sql.Tx, d time.Duration) error {
	stmt := fmt.Sprintf("SET LOCAL statement_timeout = '%dms'", d.Milliseconds())
	if _, err := tx.ExecContext(ctx, stmt); err != nil {
		return classifyQueryError("set statement_timeout", err)
	}

	return nil
}

func classifyQueryError(op string, err error) error {
	if err == nil {
		return nil
	}

	switch {
	case errors.Is(err, context.Canceled):
		return fmt.Errorf("%s: %w", op, engine.ErrQueryCanceled)
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Errorf("%s: %w", op, engine.ErrQueryTimeout)
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if classified := classifyPostgresError(op, pgErr); classified != nil {
			return classified
		}
	}

	return fmt.Errorf("%s: %w", op, err)
}
