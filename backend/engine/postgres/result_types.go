package postgres

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"time"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// pgx's database/sql shim labels a result column with the upper-cased pgtype
// name when its type map knows the OID ("INT4", "_TEXT") and with the bare
// OID otherwise ("24" for regproc, "16433" for a user enum). Neither is what
// a person expects to read in a result header, so ExecuteQuery normalizes
// both into pg_type spelling: "int4", "text[]", "regproc", "crm.customer_status".

// typeNameLookupTimeout bounds the pg_type round-trip for unnamed OIDs. The
// lookup borrows a second pooled connection while the query's own connection
// is busy streaming rows, so it must never wait on a starved pool for long.
const typeNameLookupTimeout = 2 * time.Second

// builtinTypeNames covers the pg_catalog types pgx v5 leaves out of its
// default type map. Built-in OIDs are fixed at initdb and identical on every
// server, so these need no round-trip. Names are spelled as pg_type.typname,
// with the catalog's "_" prefix on array types.
var builtinTypeNames = map[uint32]string{
	22:   "int2vector",
	24:   "regproc",
	30:   "oidvector",
	194:  "pg_node_tree",
	775:  "_macaddr8",
	790:  "money",
	791:  "_money",
	1006: "_int2vector",
	1008: "_regproc",
	1013: "_oidvector",
	1263: "_cstring",
	1266: "timetz",
	1270: "_timetz",
	1790: "refcursor",
	2201: "_refcursor",
	2202: "regprocedure",
	2203: "regoper",
	2204: "regoperator",
	2205: "regclass",
	2206: "regtype",
	2207: "_regprocedure",
	2208: "_regoper",
	2209: "_regoperator",
	2210: "_regclass",
	2211: "_regtype",
	2275: "cstring",
	2277: "anyarray",
	2278: "void",
	2949: "_txid_snapshot",
	2970: "txid_snapshot",
	3220: "pg_lsn",
	3221: "_pg_lsn",
	3361: "pg_ndistinct",
	3402: "pg_dependencies",
	3615: "tsquery",
	3642: "gtsvector",
	3644: "_gtsvector",
	3645: "_tsquery",
	3734: "regconfig",
	3735: "_regconfig",
	3769: "regdictionary",
	3770: "_regdictionary",
	4089: "regnamespace",
	4090: "_regnamespace",
	4096: "regrole",
	4097: "_regrole",
	4191: "regcollation",
	4192: "_regcollation",
	5017: "pg_mcv_list",
	5038: "pg_snapshot",
	5039: "_pg_snapshot",
	6150: "_int4multirange",
	6151: "_nummultirange",
	6152: "_tsmultirange",
	6153: "_tstzmultirange",
	6155: "_datemultirange",
	6157: "_int8multirange",
}

// resolveTypeNamesQuery names the OIDs the driver could not. format_type
// spells types the way psql does and schema-qualifies anything outside the
// search_path ("crm.customer_status", "core.email[]").
const resolveTypeNamesQuery = `
SELECT t.oid::int8, pg_catalog.format_type(t.oid, NULL)
FROM pg_catalog.pg_type t
WHERE t.oid::int8 = ANY($1::int8[])`

// displayTypeName rewrites pg_type's internal array spelling ("_text") into
// the SQL spelling ("text[]") and reports whether the type is an array.
func displayTypeName(typname string) (string, bool) {
	if elem, ok := strings.CutPrefix(typname, "_"); ok && elem != "" {
		return elem + "[]", true
	}

	return typname, strings.HasSuffix(typname, "[]")
}

// applyResultTypeName sets a column's raw type and derived category.
func applyResultTypeName(column *api.TableResultColumn, typname string) {
	name, isArray := displayTypeName(typname)
	column.RawType = name
	column.DataType = pgTypeToDataType(name, isArray)
}

// classifyResultTypes assigns names to every column from what the driver
// reported and returns the OIDs that still need a catalog lookup, keyed to
// the column positions that use them.
func classifyResultTypes(columnTypes []*sql.ColumnType, columns []*api.TableResultColumn) map[uint32][]int {
	pending := make(map[uint32][]int)

	for i, ct := range columnTypes {
		typname := strings.ToLower(ct.DatabaseTypeName())

		if oid, err := strconv.ParseUint(typname, 10, 32); err == nil {
			if name, ok := builtinTypeNames[uint32(oid)]; ok {
				typname = name
			} else {
				pending[uint32(oid)] = append(pending[uint32(oid)], i)
			}
		}

		applyResultTypeName(columns[i], typname)
	}

	return pending
}

// resolveResultTypeNames asks pg_type for the names in pending and writes
// them onto columns. It runs on a separate pooled connection because the
// query's own connection is mid-stream. Any failure leaves the bare OID in
// place: a numeric label is a cosmetic defect, blocking the result is not.
func resolveResultTypeNames(ctx context.Context, db *sql.DB, pending map[uint32][]int, columns []*api.TableResultColumn) {
	if len(pending) == 0 {
		return
	}

	oids := make([]int64, 0, len(pending))
	for oid := range pending {
		oids = append(oids, int64(oid))
	}

	lookupCtx, cancel := context.WithTimeout(ctx, typeNameLookupTimeout)
	defer cancel()

	rows, err := db.QueryContext(lookupCtx, resolveTypeNamesQuery, oids)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var (
			oid  int64
			name string
		)

		if err := rows.Scan(&oid, &name); err != nil {
			return
		}

		if oid < 0 || oid > int64(^uint32(0)) {
			continue
		}

		for _, i := range pending[uint32(oid)] {
			applyResultTypeName(columns[i], name)
		}
	}

	// Names applied before an iteration error stand; the rest keep their OID.
	_ = rows.Err()
}
