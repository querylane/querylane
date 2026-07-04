package postgres

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// defaultPrivilegeCoreSchema declares the orderable/pageable fields for role
// default privileges. The default order is (creator_role_name, schema_name,
// object_type, privilege) for a readable display.
//
// Those four fields together uniquely identify a row within a single grantee:
// pg_default_acl is keyed by (defaclrole, defaclnamespace, defaclobjtype) and the
// exploded privilege keyword completes the identity. All four are tie-breakers so
// the keyset is a unique total order under any allowed ordering. with_grant_option
// is intentionally not orderable. A distinct resource type keeps page tokens from
// validating against the other grant-shaped RPCs.
var (
	defaultPrivilegeCoreSchema = aip.NewSchema(
		"console.querylane.dev/RoleDefaultPrivilege",
		aip.Fields[engine.RoleDefaultPrivilege]{
			"creator_role_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleDefaultPrivilege) any { return m.CreatorRoleName },
				Filterable: true,
			},
			"schema_name": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleDefaultPrivilege) any { return m.SchemaName },
				Filterable: true,
			},
			"object_type": {
				Codec:        aip.StringCodec{},
				GetValue:     func(m *engine.RoleDefaultPrivilege) any { return m.ObjectType },
				Filterable:   true,
				FilterValues: engine.DefaultPrivilegeObjectTypeTokens,
			},
			// Unbounded: the privilege vocabulary is Postgres-version-dependent
			// (e.g. MAINTAIN arrived in PG17), so an unknown privilege harmlessly
			// matches nothing rather than erroring on a newer server.
			"privilege": {
				Codec:      aip.StringCodec{},
				GetValue:   func(m *engine.RoleDefaultPrivilege) any { return m.Privilege },
				Filterable: true,
			},
		},
		aip.WithDefaultOrder("creator_role_name", aip.Asc),
		aip.WithDefaultOrder("schema_name", aip.Asc),
		aip.WithDefaultOrder("object_type", aip.Asc),
		aip.WithDefaultOrder("privilege", aip.Asc),
		aip.WithTieBreaker("creator_role_name", aip.Asc),
		aip.WithTieBreaker("schema_name", aip.Asc),
		aip.WithTieBreaker("object_type", aip.Asc),
		aip.WithTieBreaker("privilege", aip.Asc),
	)

	defaultPrivilegeSchema = rawsql.Bind(defaultPrivilegeCoreSchema, rawsql.Exprs{
		"creator_role_name": "g.creator_role_name",
		"schema_name":       "g.schema_name",
		"object_type":       "g.object_type",
		"privilege":         "g.privilege",
	})
)

// ListRoleDefaultPrivileges returns a paginated list of default privileges
// (ALTER DEFAULT PRIVILEGES) that grant access to a role on objects created
// later by other roles within the connected database.
func (d *Postgres) ListRoleDefaultPrivileges(ctx context.Context, db *sql.DB, roleName string, params aip.Params) ([]engine.RoleDefaultPrivilege, string, error) {
	return rawsql.Execute(ctx, defaultPrivilegeSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: listRoleDefaultPrivilegesQuery,
		Args:      []any{roleName},
	}, "list role default privileges"), scanRoleDefaultPrivilege, db)
}

func scanRoleDefaultPrivilege(rows *sql.Rows) (engine.RoleDefaultPrivilege, error) {
	var priv engine.RoleDefaultPrivilege

	err := rows.Scan(
		&priv.CreatorRoleName,
		&priv.ObjectType,
		&priv.SchemaName,
		&priv.Privilege,
		&priv.WithGrantOption,
	)
	if err != nil {
		return priv, err
	}

	return priv, nil
}
