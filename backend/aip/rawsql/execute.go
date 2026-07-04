package rawsql

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/querylane/querylane/backend/aip"
)

// Query describes a SQL-backed list query before AIP clauses are applied.
type Query struct {
	// BaseQuery is the handwritten SELECT without ORDER BY or LIMIT. Its
	// placeholders MUST be numbered $1..$len(Args) contiguously: generated
	// filter/cursor placeholders continue at $len(Args)+1, so a gap or an
	// out-of-range placeholder silently misaligns the bound arguments.
	BaseQuery string

	// Args are the bound values for BaseQuery's own placeholders.
	Args []any

	// HasWhere must be true iff BaseQuery already contains a WHERE clause.
	// Wrong in either direction produces invalid SQL or a query that silently
	// drops the base condition's AND grouping.
	HasWhere bool

	// ErrorMapper optionally classifies driver errors (e.g. SQLSTATE mapping)
	// before they are wrapped and returned.
	ErrorMapper func(error) error
}

// Queryer is the subset of database/sql used by Execute.
type Queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// RowScanner converts the current sql.Rows record into a model.
type RowScanner[Model any] func(*sql.Rows) (Model, error)

// Execute runs a complete paginated list query using handwritten SQL.
func Execute[Model any](
	ctx context.Context,
	schema *Schema[Model],
	params aip.Params,
	query Query,
	scan RowScanner[Model],
	db Queryer,
) ([]Model, string, error) {
	plan, err := aip.BuildPlan(schema.core, params)
	if err != nil {
		return nil, "", err
	}

	clauses, err := BuildClauses(schema, plan, len(query.Args)+1)
	if err != nil {
		return nil, "", err
	}

	sqlQuery, args := assembleQuery(query, clauses)

	rows, err := db.QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return nil, "", mapQueryError(query, "query execution failed", err)
	}
	defer rows.Close()

	var results []Model

	for rows.Next() {
		model, scanErr := scan(rows)
		if scanErr != nil {
			return nil, "", mapQueryError(query, "failed to scan query row", scanErr)
		}

		results = append(results, model)
	}

	if err := rows.Err(); err != nil {
		return nil, "", mapQueryError(query, "error iterating query rows", err)
	}

	nextToken, err := schema.core.NextPageToken(plan, results)
	if err != nil {
		return nil, "", err
	}

	if len(results) > int(plan.PageSize) {
		results = results[:plan.PageSize]
	}

	return results, nextToken, nil
}

func mapQueryError(query Query, message string, err error) error {
	mapped := err
	if query.ErrorMapper != nil {
		if classified := query.ErrorMapper(err); classified != nil {
			mapped = classified
		}
	}

	return fmt.Errorf("%s: %w", message, mapped)
}

func assembleQuery(query Query, clauses *Clauses) (string, []any) {
	var builder strings.Builder
	builder.WriteString(query.BaseQuery)

	if clauses.Where != "" {
		if query.HasWhere {
			builder.WriteString(" AND ")
		} else {
			builder.WriteString(" WHERE ")
		}

		builder.WriteString(clauses.Where)
	}

	if clauses.OrderBy != "" {
		builder.WriteString(" ORDER BY ")
		builder.WriteString(clauses.OrderBy)
	}

	builder.WriteString(" LIMIT ")
	builder.WriteString(strconv.FormatInt(int64(clauses.Limit), 10))

	args := make([]any, 0, len(query.Args)+len(clauses.Args))
	args = append(args, query.Args...)
	args = append(args, clauses.Args...)

	return builder.String(), args
}
