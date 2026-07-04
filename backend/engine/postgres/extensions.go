package postgres

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

var extensionSchema = rawsql.Bind(
	aip.NewSchema(
		"console.querylane.dev/Extension",
		aip.Fields[engine.Extension]{
			"name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.Extension) any { return m.Name },
				Filterable: true,
			},
			"schema": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.Extension) any { return m.SchemaName },
				Filterable: true,
			},
			"installed": {
				Codec:      aip.BoolCodec{},
				GetValue:   func(m *engine.Extension) any { return m.Installed },
				Filterable: true,
			},
		},
		aip.WithNameOrdering(),
	),
	rawsql.Exprs{
		"name":      "ae.name",
		"schema":    "COALESCE(n.nspname, '')",
		"installed": "ae.installed_version IS NOT NULL",
	},
)

// ListExtensions returns extensions available in the connected database,
// including installed state from pg_extension.
func (d *Postgres) ListExtensions(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Extension, string, error) {
	return rawsql.Execute(ctx, extensionSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: extensionListQuery,
	}, "list extensions"), scanExtension, db)
}

func scanExtension(rows *sql.Rows) (engine.Extension, error) {
	var extension engine.Extension

	err := rows.Scan(
		&extension.Name,
		&extension.SchemaName,
		&extension.DefaultVersion,
		&extension.InstalledVersion,
		&extension.Comment,
		&extension.Installed,
	)

	return extension, err
}
