package postgres

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// ownedObjectSchema declares the orderable/pageable fields for owned objects.
// The default order is (schema_name, object_name) for a readable display.
//
// The three fields (object_type, schema_name, object_name) together uniquely
// identify a row: a function and a table can share a (schema, name) prefix, and
// the synthesized DATABASE row sorts among the empty-schema rows — so object_type
// is required as a tie-breaker for a unique total order under any allowed
// ordering. A distinct resource type keeps page tokens from validating against
// the other grant-shaped RPCs.
var ownedObjectSchema = rawsql.Bind(
	aip.NewSchema(
		"console.querylane.dev/OwnedObject",
		aip.Fields[engine.OwnedObject]{
			"schema_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.OwnedObject) any { return m.SchemaName },
				Filterable: true,
			},
			"object_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.OwnedObject) any { return m.ObjectName },
				Filterable: true,
			},
			"object_type": {
				Codec:        aip.StringCodec{},
				GetValue:     func(m *engine.OwnedObject) any { return m.ObjectType },
				Filterable:   true,
				FilterValues: engine.GrantObjectTypeTokens,
			},
		},
		aip.WithDefaultOrder("schema_name", aip.Asc),
		aip.WithDefaultOrder("object_name", aip.Asc),
		aip.WithTieBreaker("object_type", aip.Asc),
		aip.WithTieBreaker("schema_name", aip.Asc),
		aip.WithTieBreaker("object_name", aip.Asc),
	),
	rawsql.Exprs{
		"schema_name": "g.schema_name",
		"object_name": "g.object_name",
		"object_type": "g.object_type",
	},
)

// ListRoleOwnedObjects returns a paginated list of objects owned by a role
// within the connected database.
func (d *Postgres) ListRoleOwnedObjects(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]engine.OwnedObject, string, error) {
	return rawsql.Execute(ctx, ownedObjectSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: listRoleOwnedObjectsQuery,
		Args:      []any{roleName},
	}, "list role owned objects"), scanOwnedObject, db)
}

func scanOwnedObject(rows *sql.Rows) (engine.OwnedObject, error) {
	var obj engine.OwnedObject

	err := rows.Scan(
		&obj.ObjectType,
		&obj.SchemaName,
		&obj.ObjectName,
	)
	if err != nil {
		return obj, err
	}

	return obj, nil
}
