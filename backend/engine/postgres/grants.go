package postgres

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// newGrantCoreSchema builds the shared AIP schema for grant rows. Role grants
// and PUBLIC grants have the identical engine.RoleGrant row shape, so they share
// these field and order declarations; each caller passes a distinct resourceType
// so a page token issued by one list RPC can't be replayed against the other.
//
// The default order is (schema_name, object_name, privilege) for a readable
// display. The five fields (object_type, schema_name, object_name, privilege,
// grantor) together uniquely identify a row: a role can hold the same privilege
// on the same object from different grantors, and the same name can recur across
// object types/schemas. All five are declared as tie-breakers so that whatever
// order_by a client supplies, appendUniqueFields fills in the remaining identity
// fields — the keyset is a unique total order under ANY allowed ordering, not
// just the default (otherwise e.g. order_by=privilege would paginate over the
// non-unique (privilege, ...) prefix and dup/skip rows).
func newGrantCoreSchema(resourceType string) *aip.Schema[engine.RoleGrant] {
	return aip.NewSchema(
		resourceType,
		aip.Fields[engine.RoleGrant]{
			"schema_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleGrant) any { return m.SchemaName },
				Filterable: true,
			},
			"object_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleGrant) any { return m.ObjectName },
				Filterable: true,
			},
			// privilege is deliberately unbounded (no FilterValues): the privilege
			// vocabulary is Postgres-version-dependent (e.g. MAINTAIN since PG17),
			// so an unknown privilege matches nothing instead of erroring.
			"privilege": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleGrant) any { return m.Privilege },
				Filterable: true,
			},
			"object_type": {
				Codec:        aip.StringCodec{},
				GetValue:     func(m *engine.RoleGrant) any { return m.ObjectType },
				Filterable:   true,
				FilterValues: engine.GrantObjectTypeTokens,
			},
			"grantor": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleGrant) any { return m.Grantor },
				Filterable: true,
			},
		},
		aip.WithDefaultOrder("schema_name", aip.Asc),
		aip.WithDefaultOrder("object_name", aip.Asc),
		aip.WithDefaultOrder("privilege", aip.Asc),
		aip.WithTieBreaker("object_type", aip.Asc),
		aip.WithTieBreaker("schema_name", aip.Asc),
		aip.WithTieBreaker("object_name", aip.Asc),
		aip.WithTieBreaker("privilege", aip.Asc),
		aip.WithTieBreaker("grantor", aip.Asc),
	)
}

// grantExprs binds the shared grant fields to their SQL expressions; the
// role-grant and PUBLIC-grant queries expose the same aliases.
var grantExprs = rawsql.Exprs{
	"schema_name": "g.schema_name",
	"object_name": "g.object_name",
	"privilege":   "g.privilege",
	"object_type": "g.object_type",
	// grantor is COALESCE'd to '' in the grant queries — load-bearing for
	// filter correctness: a raw NULL would make `!=`/`:` silently drop rows.
	"grantor": "g.grantor",
}

// grantSchema paginates privileges granted directly to a role.
var (
	grantCoreSchema = newGrantCoreSchema("console.querylane.dev/RoleGrant")
	grantSchema     = rawsql.Bind(grantCoreSchema, grantExprs)
)

// ListRoleGrants returns a paginated list of object-level privileges granted
// directly to a role within the connected database.
func (d *Postgres) ListRoleGrants(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]engine.RoleGrant, string, error) {
	return rawsql.Execute(ctx, grantSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: listRoleGrantsQuery,
		Args:      []any{roleName},
	}, "list role grants"), scanRoleGrant, db)
}

func scanRoleGrant(rows *sql.Rows) (engine.RoleGrant, error) {
	var grant engine.RoleGrant

	err := rows.Scan(
		&grant.ObjectType,
		&grant.SchemaName,
		&grant.ObjectName,
		&grant.Privilege,
		&grant.WithGrantOption,
		&grant.Grantor,
	)
	if err != nil {
		return grant, err
	}

	return grant, nil
}
