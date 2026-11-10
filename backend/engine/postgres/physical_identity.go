package postgres

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// A ctid alone is neither a row version nor unique across partitions. Bind
// opaque cell identities to the physical relation, its storage generation,
// and tuple version. Rewrites (including REPACK) change the filenode; updates
// change xmin/ctid. The expression is evaluated in the same SELECT as the cell.
const physicalRowIdentitySQL = `concat_ws(':', tableoid::text, pg_catalog.pg_relation_filenode(tableoid)::text, xmin::text, ctid::text)`

func validPhysicalIdentity(value *api.TableValue) bool {
	parts := strings.Split(value.GetStringValue(), ":")
	if len(parts) != 4 {
		return false
	}
	for _, part := range parts[:3] {
		if _, err := strconv.ParseUint(part, 10, 32); err != nil {
			return false
		}
	}
	tid := parts[3]
	if !strings.HasPrefix(tid, "(") || !strings.HasSuffix(tid, ")") {
		return false
	}
	coords := strings.Split(tid[1:len(tid)-1], ",")
	if len(coords) != 2 {
		return false
	}
	for _, coord := range coords {
		if _, err := strconv.ParseUint(coord, 10, 32); err != nil {
			return false
		}
	}
	return true
}

// bindPhysicalPagination acquires AccessShare locks via a zero-row SELECT
// (LOCK TABLE rejects materialized views) and holds them until rollback,
// preventing a rewrite between checking the storage generation and reading
// rows. Include all descendants: different partitions can have the same ctid.
// Offset pagination remains a live view, not a snapshot of concurrent DML.
func bindPhysicalPagination(ctx context.Context, tx *sql.Tx, plan *paginationPlan, params engine.ReadRowsParams) error {
	query := fmt.Sprintf("SELECT 1 FROM %s.%s LIMIT 0", quoteIdent(params.SchemaName), quoteIdent(params.TableName)) //nolint:gosec // G201: both identifiers are double-quoted and escaped; SQL parameters cannot name relations.
	_, err := tx.ExecContext(ctx, query)
	if err != nil {
		return classifyQueryError("lock physical row identity", err)
	}
	var generation string
	err = tx.QueryRowContext(ctx, `WITH RECURSIVE relations(oid) AS (
 SELECT pg_catalog.to_regclass(format('%I.%I', $1::text, $2::text))::oid
 UNION
 SELECT i.inhrelid FROM pg_catalog.pg_inherits i JOIN relations r ON i.inhparent = r.oid
 )
 SELECT string_agg(c.oid::text || ':' || c.relfilenode::text, ',' ORDER BY c.oid)
 FROM relations r JOIN pg_catalog.pg_class c ON c.oid = r.oid`, params.SchemaName, params.TableName).Scan(&generation)
	if err != nil {
		return classifyQueryError("query physical storage generation", err)
	}
	sum := sha256.New()
	_, _ = sum.Write(plan.projectionHash)
	_, _ = fmt.Fprint(sum, generation)
	plan.projectionHash = sum.Sum(nil)
	return nil
}
