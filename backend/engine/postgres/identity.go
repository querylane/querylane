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

	// Foreign tables (including inherited foreign partitions) have no local
	// storage/tuple generation we can bind a physical identity to. In particular,
	// postgres_fdw can expose ctid with xmin=0 and no filenode: not a safe token.
	var hasForeignRelation bool
	if err := db.QueryRowContext(ctx, hasForeignDescendantQuery, schemaName, tableName).Scan(&hasForeignRelation); err != nil {
		return nil, nil, classifyQueryError("discover physical row identity capability", err)
	}
	if hasForeignRelation {
		return &api.RowIdentity{}, nil, nil
	}

	// Fallback: expose one opaque ctid identity column. The cursor projection
	// binds its value to tableoid, filenode, xmin and ctid so cell tokens reject
	// physical rewrites and tuple replacement rather than reading another row.
	ctidCols := []identityColumn{
		{name: ctidColumn, rawType: "tid"},
		// ctids can collide across partitions/inherited relations.
		{name: "tableoid", rawType: "oid"},
	}

	return &api.RowIdentity{
		Source:      api.RowIdentity_SOURCE_OPAQUE_ROW_KEY,
		ColumnNames: []string{ctidColumn},
	}, ctidCols, nil
}
