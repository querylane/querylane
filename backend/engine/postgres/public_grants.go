package postgres

import (
	"context"
	"database/sql"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
)

// publicGrantSchema shares grantSchema's field/order declarations (the row shape
// is identical: engine.RoleGrant scanned by scanRoleGrant) via newGrantCoreSchema,
// but uses a distinct resource type so a ListRoleGrants page token can't be
// replayed against ListPublicGrants.
var (
	publicGrantCoreSchema = newGrantCoreSchema("console.querylane.dev/PublicGrant")
	publicGrantSchema     = rawsql.Bind(publicGrantCoreSchema, grantExprs)
)

// ListPublicGrants returns a paginated list of privileges granted to PUBLIC
// within the connected database, including the synthesized database-level
// CONNECT/TEMPORARY defaults when datacl is unset.
func (d *Postgres) ListPublicGrants(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.RoleGrant, string, error) {
	return rawsql.Execute(ctx, publicGrantSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: listPublicGrantsQuery,
	}, "list public grants"), scanRoleGrant, db)
}
