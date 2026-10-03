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
	"github.com/querylane/querylane/backend/postgreserrors"
)

var errValidateUnsupported = errors.New("statement validation needs a pgx connection")

// validateLockTimeout bounds how long Parse/analysis may wait for a relation
// lock. Analysis takes AccessShare locks, so a table held by a migration
// would otherwise park a pooled connection for the whole statement timeout
// on every editor pause.
const validateLockTimeout = time.Second

// ValidateQuery asks PostgreSQL to parse and analyze a statement without
// executing it, using the extended protocol's Parse and Describe messages
// on the unnamed prepared statement. Analysis resolves every table, column,
// function and type the statement mentions, so unknown objects surface with
// a character position exactly like syntax errors do, and nothing is planned
// or run. The unnamed statement is replaced by the connection's next Parse,
// so nothing lingers on the pooled connection.
//
// The check runs inside a throwaway read-only transaction so lock_timeout,
// statement_timeout (params.Timeout, the server-side bound; the caller's
// context carries the client grace on top) and the optional search_path are
// all SET LOCAL and vanish with the ROLLBACK.
func (*Postgres) ValidateQuery(ctx context.Context, db *sql.DB, params engine.ValidateQueryParams) (*engine.ValidateQueryResult, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, classifySQLConsoleError("acquire connection", err)
	}
	defer conn.Close()

	var diagnostic *engine.QueryDiagnostic

	err = conn.Raw(func(driverConn any) error {
		pgxConn, ok := engine.UnwrapPostgresConn(driverConn)
		if !ok {
			return errValidateUnsupported
		}

		pgConn := pgxConn.PgConn()

		_, setupErr := pgConn.Exec(ctx, validationSetup(params)).ReadAll()
		// BEGIN may have run even when a later SET failed, so the rollback is
		// registered before checking the setup error.
		defer rollbackValidation(ctx, pgConn)

		if setupErr != nil {
			return setupErr
		}

		_, prepareErr := pgConn.Prepare(ctx, "", params.Statement, nil)

		diagnostic, prepareErr = diagnosticFromError(prepareErr)

		return prepareErr
	})
	if err != nil {
		return nil, classifySQLConsoleError("validate query", err)
	}

	return &engine.ValidateQueryResult{Diagnostic: diagnostic}, nil
}

// validationSetup opens the throwaway transaction and scopes its settings.
func validationSetup(params engine.ValidateQueryParams) string {
	statements := []string{
		"BEGIN READ ONLY",
		fmt.Sprintf("SET LOCAL lock_timeout = '%dms'", validateLockTimeout.Milliseconds()),
	}
	if params.Timeout > 0 {
		statements = append(statements, fmt.Sprintf("SET LOCAL statement_timeout = '%dms'", params.Timeout.Milliseconds()))
	}

	if params.DefaultSchema != "" {
		// Name resolution happens at Parse time, so the schema has to be on
		// the search_path then.
		statements = append(statements, searchPathStatement(params.DefaultSchema))
	}

	return strings.Join(statements, "; ")
}

// rollbackValidationTimeout bounds the cleanup ROLLBACK, which must run even
// when the request context is already done.
const rollbackValidationTimeout = 5 * time.Second

// rollbackValidation ends the throwaway validation transaction. A failed
// rollback leaves the connection in an unknown state, so it is closed and the
// pool discards it rather than handing out a connection that is still inside
// a transaction.
func rollbackValidation(ctx context.Context, pgConn *pgconn.PgConn) {
	rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), rollbackValidationTimeout)
	defer cancel()

	if _, err := pgConn.Exec(rollbackCtx, "ROLLBACK").ReadAll(); err != nil {
		_ = pgConn.Close(rollbackCtx)
	}
}

// diagnosticFromError turns a PostgreSQL rejection of the statement itself
// (syntax errors, unknown objects, bad literals: everything the classifier
// files under invalid argument) into a diagnostic. Any other failure, such as
// a dropped connection or a cancelled context, stays an error.
func diagnosticFromError(err error) (*engine.QueryDiagnostic, error) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return nil, err
	}

	classification := postgreserrors.Classify(pgErr, postgreserrors.ProfileSQLConsole)
	if classification.Kind != postgreserrors.KindInvalidArgument {
		return nil, err
	}

	fields := classification.ClientFields

	return &engine.QueryDiagnostic{
		SQLState: classification.SQLState,
		Message:  fields.Message,
		Detail:   fields.Detail,
		Hint:     fields.Hint,
		Position: fields.Position,
	}, nil
}
