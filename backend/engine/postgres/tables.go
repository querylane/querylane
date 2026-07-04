package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	tableTypeSQLPlaceholder = "/*QUERYLANE_TABLE_TYPE_SQL*/"
	tableSizeSQLPlaceholder = "/*QUERYLANE_TABLE_SIZE_SQL*/"
)

var (
	tableTypeSQLExpr = `CASE
		WHEN c.relpersistence = 't' THEN 'TABLE_TYPE_TEMPORARY'
		WHEN c.relkind = 'f' THEN 'TABLE_TYPE_EXTERNAL'
		WHEN c.relkind = 'p' THEN 'TABLE_TYPE_PARTITIONED'
		WHEN c.relkind = 'r' THEN 'TABLE_TYPE_BASE_TABLE'
		ELSE 'TABLE_TYPE_UNSPECIFIED'
	END`

	tableSizeSQLExpr = `CASE
		WHEN c.relkind = 'f' THEN 0
		WHEN c.relkind = 'p' THEN COALESCE((
			SELECT SUM(
				CASE
					WHEN child.relkind = 'f' THEN 0
					ELSE pg_catalog.pg_total_relation_size(pt.relid)
				END
			)
			FROM pg_catalog.pg_partition_tree(c.oid) pt
			JOIN pg_catalog.pg_class child ON child.oid = pt.relid
			WHERE pt.relid <> c.oid
		), 0)
		ELSE COALESCE(pg_catalog.pg_total_relation_size(c.oid), 0)
	END`

	tableCoreSchema = aip.NewSchema(
		"console.querylane.dev/Table",
		aip.Fields[engine.Table]{
			"name": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *engine.Table) any { return m.Name },
			},
			"size_bytes": {
				Codec: aip.Int64Codec{},
				GetValue: func(m *engine.Table) any {
					return m.SizeBytes
				},
			},
			"table_type": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.Table) any { return m.TableType.String() },
				Filterable: true,
				FilterValues: []string{
					"TABLE_TYPE_BASE_TABLE",
					"TABLE_TYPE_PARTITIONED",
					"TABLE_TYPE_EXTERNAL",
					"TABLE_TYPE_TEMPORARY",
				},
			},
		},
		aip.WithNameOrdering(),
	)

	tableExprs = rawsql.Exprs{
		"name":       "c.relname",
		"size_bytes": tableSizeSQLExpr,
		"table_type": tableTypeSQLExpr,
	}

	tableSchema = rawsql.Bind(tableCoreSchema, tableExprs)

	viewSchema = rawsql.Bind(
		aip.NewSchema(
			"console.querylane.dev/View",
			aip.Fields[engine.View]{
				"name": {
					Codec:    aip.StringCodec{},
					GetValue: func(m *engine.View) any { return m.Name },
				},
			},
			aip.WithNameOrdering(),
		),
		rawsql.Exprs{
			"name": "v.view_name",
		},
	)
)

// ListTables returns a paginated list of tables in the specified PostgreSQL schema.
func (d *Postgres) ListTables(ctx context.Context, db *sql.DB, schemaName string, params aip.Params) ([]engine.Table, string, error) {
	return rawsql.Execute(ctx, tableSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: tableListQuery,
		Args:      []any{schemaName},
		HasWhere:  true,
	}, "list tables"), scanTable, db)
}

// GetTable retrieves details for a specific table.
func (d *Postgres) GetTable(ctx context.Context, db *sql.DB, schemaName, tableName string) (*engine.Table, error) {
	table, err := scanTableRow(db.QueryRowContext(ctx, getTableQuery, schemaName, tableName))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrTableNotFound, tableName)
		}

		return nil, fmt.Errorf("failed to query table: %w", err)
	}

	return &table, nil
}

// ListViews returns a paginated list of views in the specified PostgreSQL schema.
func (d *Postgres) ListViews(ctx context.Context, db *sql.DB, schemaName string, params aip.Params) ([]engine.View, string, error) {
	return rawsql.Execute(ctx, viewSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: viewListQuery,
		Args:      []any{schemaName},
	}, "list views"), scanView, db)
}

// GetView retrieves details for a specific view.
func (d *Postgres) GetView(ctx context.Context, db *sql.DB, schemaName, viewName string) (*engine.View, error) {
	view, err := scanViewRow(db.QueryRowContext(ctx, getViewQuery, schemaName, viewName))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrViewNotFound, viewName)
		}

		return nil, fmt.Errorf("failed to query view: %w", err)
	}

	return &view, nil
}

func tableExists(ctx context.Context, db *sql.DB, schemaName, tableName string) (bool, error) {
	var exists bool
	if err := db.QueryRowContext(ctx, tableExistsQuery, schemaName, tableName).Scan(&exists); err != nil {
		return false, fmt.Errorf("failed to check table existence: %w", err)
	}

	return exists, nil
}

func mapViewType(pgType string) api.View_ViewType {
	switch pgType {
	case "STANDARD":
		return api.View_VIEW_TYPE_STANDARD
	case "MATERIALIZED":
		return api.View_VIEW_TYPE_MATERIALIZED
	default:
		return api.View_VIEW_TYPE_UNSPECIFIED
	}
}

func mapTableType(pgType string) api.Table_TableType {
	return engine.ParseTableType(pgType)
}
