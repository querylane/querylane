package postgres

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
)

var errValidateUnsupported = errors.New("statement validation needs a pgx connection")

// ValidateQuery asks PostgreSQL to parse and analyze a statement without
// executing it, using the extended protocol's Parse and Describe messages
// on the unnamed prepared statement. Analysis resolves every table, column,
// function and type the statement mentions, so unknown objects surface with
// a character position exactly like syntax errors do, and nothing is planned
// or run. The unnamed statement is replaced by the connection's next Parse,
// so nothing lingers on the pooled connection.
func (*Postgres) ValidateQuery(ctx context.Context, db *sql.DB, params engine.ValidateQueryParams) (*engine.ValidateQueryResult, error) {
	if params.Timeout > 0 {
		var cancel context.CancelFunc

		ctx, cancel = context.WithTimeout(ctx, params.Timeout)
		defer cancel()
	}

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

		_, prepareErr := pgxConn.PgConn().Prepare(ctx, "", params.Statement, nil)

		diagnostic, prepareErr = diagnosticFromError(prepareErr)

		return prepareErr
	})
	if err != nil {
		return nil, classifySQLConsoleError("validate query", err)
	}

	return &engine.ValidateQueryResult{Diagnostic: diagnostic}, nil
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
