package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

var (
	dbSchema = rawsql.Bind(
		aip.NewSchema(
			"console.querylane.dev/Database",
			aip.Fields[engine.Database]{
				"name": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *engine.Database) any { return m.Name },
				},
				"owner": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *engine.Database) any { return m.Owner },
				},
			},
			aip.WithNameOrdering(),
		),
		rawsql.Exprs{
			"name":  "d.datname",
			"owner": "r.rolname",
		},
	)

	schemaSchema = rawsql.Bind(
		aip.NewSchema(
			"console.querylane.dev/Schema",
			aip.Fields[engine.Schema]{
				"name": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *engine.Schema) any { return m.Name },
				},
				"owner": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *engine.Schema) any { return m.Owner },
				},
			},
			aip.WithNameOrdering(),
		),
		rawsql.Exprs{
			"name":  "s.schema_name",
			"owner": "s.schema_owner",
		},
	)
)

// ListDatabases returns a paginated list of databases in the PostgreSQL instance.
// Excludes template databases.
func (d *Postgres) ListDatabases(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Database, string, error) {
	return rawsql.Execute(ctx, dbSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: databaseListQuery,
		HasWhere:  true,
	}, "list databases"), scanDatabase, db)
}

// GetDatabase retrieves details for a specific database.
func (d *Postgres) GetDatabase(ctx context.Context, db *sql.DB, databaseName string) (*engine.Database, error) {
	database, err := scanDatabaseRow(db.QueryRowContext(ctx, getDatabaseQuery, databaseName))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrDatabaseNotFound, databaseName)
		}

		return nil, fmt.Errorf("failed to query database: %w", err)
	}

	return &database, nil
}

// ListSchemas returns a paginated list of schemas in the connected PostgreSQL database.
func (d *Postgres) ListSchemas(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Schema, string, error) {
	return rawsql.Execute(ctx, schemaSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: schemaListQuery,
	}, "list schemas"), scanSchema, db)
}

// GetSchema retrieves details for a specific schema within the connected database.
func (d *Postgres) GetSchema(ctx context.Context, db *sql.DB, schemaName string) (*engine.Schema, error) {
	schema, err := scanSchemaRow(db.QueryRowContext(ctx, getSchemaQuery, schemaName))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrSchemaNotFound, schemaName)
		}

		return nil, fmt.Errorf("failed to query schema: %w", err)
	}

	return &schema, nil
}
