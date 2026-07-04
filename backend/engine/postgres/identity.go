package postgres

import (
	"context"
	"database/sql"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// identityColumn carries the schema-level information the engine needs to
// scan and compare a table's identity columns.
type identityColumn struct {
	name    string
	rawType string
}

// discoverRowIdentity returns the row-identity description for a table.
//
// PK if present (validated + ready). Otherwise ctid as the opaque fallback.
//
// v1 deliberately skips unique-index identity: a unique index over nullable
// columns can have multiple "identity" rows (NULLs are not equal to
// themselves under standard semantics), and a falsely-confident unique
// identity would silently corrupt cursor / row_key tokens.
func discoverRowIdentity(ctx context.Context, db *sql.DB, schemaName, tableName string) (*api.RowIdentity, []identityColumn, error) {
	rows, err := db.QueryContext(ctx, discoverRowIdentityQuery, schemaName, tableName)
	if err != nil {
		return nil, nil, classifyQueryError("discover row identity", err)
	}
	defer rows.Close()

	var (
		names []string
		cols  []identityColumn
	)

	for rows.Next() {
		var (
			name    string
			rawType string
			pos     int
		)

		if err := rows.Scan(&name, &rawType, &pos); err != nil {
			return nil, nil, classifyQueryError("scan row identity", err)
		}

		names = append(names, name)
		cols = append(cols, identityColumn{name: name, rawType: rawType})
	}

	if err := rows.Err(); err != nil {
		return nil, nil, classifyQueryError("iterate row identity rows", err)
	}

	if len(names) > 0 {
		return &api.RowIdentity{
			Source:      api.RowIdentity_SOURCE_PRIMARY_KEY,
			ColumnNames: names,
		}, cols, nil
	}

	// Fallback: ctid is the physical row pointer; valid only within a single
	// VACUUM-FULL/CLUSTER-stable window. The proto field stays consistent
	// with the engine's bookkeeping so downstream code can use the same
	// `[]identityColumn` slice for projection/scanning.
	return &api.RowIdentity{
			Source:      api.RowIdentity_SOURCE_OPAQUE_ROW_KEY,
			ColumnNames: []string{ctidColumn},
		}, []identityColumn{
			{name: ctidColumn, rawType: "tid"},
		}, nil
}
