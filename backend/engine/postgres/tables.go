package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	tableTypeSQLPlaceholder = "/*QUERYLANE_TABLE_TYPE_SQL*/"
	tableSizeSQLPlaceholder = "/*QUERYLANE_TABLE_SIZE_SQL*/"
)

const defaultMaterializedViewRefreshTimeout = 30 * time.Second

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

	viewDependencyRelationTypeSQLExpr = `CASE relkind
		WHEN 'r' THEN 'RELATION_TYPE_TABLE'
		WHEN 'v' THEN 'RELATION_TYPE_VIEW'
		WHEN 'm' THEN 'RELATION_TYPE_MATERIALIZED_VIEW'
		WHEN 'f' THEN 'RELATION_TYPE_FOREIGN_TABLE'
		WHEN 'p' THEN 'RELATION_TYPE_PARTITIONED_TABLE'
		ELSE 'RELATION_TYPE_UNSPECIFIED'
	END`

	viewDependencySchema = rawsql.Bind(
		aip.NewSchema(
			"console.querylane.dev/ViewDependency",
			aip.Fields[engine.ViewDependency]{
				"name": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *engine.ViewDependency) any { return m.ResourceID },
					Filterable: true,
				},
				"schema_name": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *engine.ViewDependency) any { return m.SchemaName },
					Filterable: true,
				},
				"display_name": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *engine.ViewDependency) any { return m.Name },
					Filterable: true,
				},
				"direction": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *engine.ViewDependency) any { return m.Direction.String() },
					Filterable: true,
					FilterValues: []string{
						"DIRECTION_UPSTREAM",
						"DIRECTION_DOWNSTREAM",
					},
				},
				"relation_type": {
					Codec:      aip.StringCodec{},
					GetValue:   func(m *engine.ViewDependency) any { return m.RelationType.String() },
					Filterable: true,
					FilterValues: []string{
						"RELATION_TYPE_TABLE",
						"RELATION_TYPE_VIEW",
						"RELATION_TYPE_MATERIALIZED_VIEW",
						"RELATION_TYPE_FOREIGN_TABLE",
						"RELATION_TYPE_PARTITIONED_TABLE",
					},
				},
			},
			aip.WithDefaultOrder("direction", aip.Asc),
			aip.WithDefaultOrder("schema_name", aip.Asc),
			aip.WithDefaultOrder("display_name", aip.Asc),
			aip.WithTieBreaker("name", aip.Asc),
		),
		rawsql.Exprs{
			"name":          "dependency_id",
			"schema_name":   "schema_name",
			"display_name":  "display_name",
			"direction":     "direction",
			"relation_type": viewDependencyRelationTypeSQLExpr,
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

// ListViewDependencies returns paginated direct upstream and downstream relations.
func (*Postgres) ListViewDependencies(ctx context.Context, db *sql.DB, schemaName, viewName string, params aip.Params) ([]engine.ViewDependency, string, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, "", classifyQueryError("begin view dependencies query", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := setStatementTimeout(ctx, tx, defaultReadTimeout, postgreserrors.ProfileDefault); err != nil {
		return nil, "", err
	}

	dependencies, nextPageToken, err := rawsql.Execute(ctx, viewDependencySchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: listViewDependenciesQuery,
		Args:      []any{schemaName, viewName},
	}, "list view dependencies"), scanViewDependency, tx)
	if err != nil {
		return nil, "", err
	}

	if err := tx.Commit(); err != nil {
		return nil, "", classifyQueryError("commit view dependencies query", err)
	}

	return dependencies, nextPageToken, nil
}

// RefreshMaterializedView replaces the stored rows for a materialized view.
func (*Postgres) RefreshMaterializedView(ctx context.Context, db *sql.DB, schemaName, viewName string, concurrently bool) error {
	statementTimeout := defaultMaterializedViewRefreshTimeout
	if deadline, ok := ctx.Deadline(); ok {
		statementTimeout = max(time.Until(deadline), time.Millisecond)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return classifyQueryError("begin materialized view refresh", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := setStatementTimeout(ctx, tx, statementTimeout, postgreserrors.ProfileDefault); err != nil {
		return err
	}

	statement := "REFRESH MATERIALIZED VIEW "
	if concurrently {
		statement += "CONCURRENTLY "
	}

	statement += quoteIdent(schemaName) + "." + quoteIdent(viewName)

	if _, err := tx.ExecContext(ctx, statement); err != nil {
		return classifyQueryError("refresh materialized view", err)
	}

	if err := tx.Commit(); err != nil {
		return classifyQueryError("commit materialized view refresh", err)
	}

	return nil
}

func scanViewDependency(rows *sql.Rows) (engine.ViewDependency, error) {
	var (
		dependency engine.ViewDependency
		direction  string
		relkind    string
	)

	err := rows.Scan(
		&dependency.ResourceID,
		&dependency.SchemaName,
		&dependency.Name,
		&direction,
		&relkind,
	)
	dependency.Direction = mapViewDependencyDirection(direction)
	dependency.RelationType = mapViewDependencyRelationType(relkind)

	return dependency, err
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

func mapViewDependencyDirection(direction string) api.ViewDependency_Direction {
	if direction == "DIRECTION_UPSTREAM" {
		return api.ViewDependency_DIRECTION_UPSTREAM
	}

	if direction == "DIRECTION_DOWNSTREAM" {
		return api.ViewDependency_DIRECTION_DOWNSTREAM
	}

	return api.ViewDependency_DIRECTION_UNSPECIFIED
}

func mapViewDependencyRelationType(relkind string) api.ViewDependency_RelationType {
	switch relkind {
	case "r":
		return api.ViewDependency_RELATION_TYPE_TABLE
	case "v":
		return api.ViewDependency_RELATION_TYPE_VIEW
	case "m":
		return api.ViewDependency_RELATION_TYPE_MATERIALIZED_VIEW
	case "f":
		return api.ViewDependency_RELATION_TYPE_FOREIGN_TABLE
	case "p":
		return api.ViewDependency_RELATION_TYPE_PARTITIONED_TABLE
	default:
		return api.ViewDependency_RELATION_TYPE_UNSPECIFIED
	}
}

func mapTableType(pgType string) api.Table_TableType {
	return engine.ParseTableType(pgType)
}
