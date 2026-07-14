package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	cellTokenTTL          = 5 * time.Minute
	defaultReadCellBytes  = 16 * 1024 * 1024
	maxReadCellBytesLimit = 64 * 1024 * 1024
)

// mintFullValueToken is the token-minting function used by the scanner.
// It signs a TableCellFullValueTokenPayload bound to the table resource
// name, column, and the row's identity values.
func (d *Postgres) mintFullValueToken(resourceName, column string, identity *api.RowIdentity, identityValues []*api.TableValue) (string, error) {
	payload := &api.TableCellFullValueTokenPayload{
		Version:        1,
		TableName:      resourceName,
		Column:         column,
		RowIdentity:    identity,
		IdentityValues: identityValues,
		IssuedAt:       timestamppb.Now(),
	}

	return d.tokens.Sign(engine.TokenKindFullValueCell, payload)
}

// ReadCellValue fetches the full (un-truncated) value of a single cell.
// The caller-supplied params carry the schema/table, the column, and the
// decoded identity from the token. The service layer is responsible for
// verifying the token and matching its table_name against the request's
// `name` field.
func (d *Postgres) ReadCellValue(ctx context.Context, db *sql.DB, params engine.ReadCellValueParams) (*engine.ReadCellValueResult, error) {
	maxBytes := params.MaxBytes
	if maxBytes <= 0 {
		maxBytes = defaultReadCellBytes
	}

	if maxBytes > maxReadCellBytesLimit {
		maxBytes = maxReadCellBytesLimit
	}

	identity := params.RowIdentity
	if identity == nil || len(identity.GetColumnNames()) == 0 {
		return nil, fmt.Errorf("%w: token missing row identity", engine.ErrInvalidPageToken)
	}

	if len(params.IdentityValues) != len(identity.GetColumnNames()) {
		return nil, fmt.Errorf("%w: token identity values mismatch", engine.ErrInvalidPageToken)
	}

	// Look up the column to know whether it's preview-eligible (so we can
	// truncate to maxBytes in a type-appropriate way) and get its data type.
	cols, err := d.ListTableColumns(ctx, db, params.SchemaName, params.TableName)
	if err != nil {
		return nil, err
	}

	idx := newColumnIndex(cols)

	col, ok := idx.get(params.Column)
	if !ok {
		return nil, engine.NewInvalidQueryError("full_value_token", fmt.Sprintf("unknown column %q", params.Column))
	}

	// Build SELECT of (truncated_or_full, octet_length) WHERE pk_cols = (...)
	q := buildReadCellValueSQL(params.SchemaName, params.TableName, col, identity, maxBytes)

	args := extractTableValues(params.IdentityValues)

	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, classifyQueryError("begin read-only tx", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := setStatementTimeout(ctx, tx, defaultReadTimeout, postgreserrors.ProfileDefault); err != nil {
		return nil, err
	}

	row := tx.QueryRowContext(ctx, q, args...)

	var (
		raw  any
		size sql.NullInt64
	)

	if err := row.Scan(&raw, &size); err != nil {
		return nil, classifyQueryError("read cell value", err)
	}

	value := convertToValueTyped(raw, &api.TableResultColumn{
		DataType: col.DataType,
		RawType:  col.RawType,
	})

	cell := &api.TableCell{Value: value}

	if size.Valid {
		cell.FullSizeBytes = size.Int64
		if size.Int64 > int64(cellByteLength(value)) {
			cell.Truncated = true
		}
	}

	return &engine.ReadCellValueResult{Cell: cell}, nil
}

// buildReadCellValueSQL projects the column with optional truncation, plus
// its octet_length, and selects the row identified by identity.
func buildReadCellValueSQL(schemaName, tableName string, col engine.Column, identity *api.RowIdentity, maxBytes int64) string {
	var b strings.Builder

	expr := truncationProjection(col, int(maxBytes))
	if !previewEligible(col) {
		expr = quoteIdent(col.Name) + ", octet_length(" + quoteIdent(col.Name) + "::text) AS " + quoteIdent(col.Name+sizeAliasSuffix)
	}

	b.WriteString("SELECT ")
	b.WriteString(expr)
	b.WriteString(" FROM ")
	b.WriteString(quoteIdent(schemaName))
	b.WriteByte('.')
	b.WriteString(quoteIdent(tableName))
	b.WriteString(" WHERE ")

	for i, name := range identity.GetColumnNames() {
		if i > 0 {
			b.WriteString(" AND ")
		}

		if name == ctidColumn {
			fmt.Fprintf(&b, "ctid = $%d::tid", i+1)
			continue
		}

		fmt.Fprintf(&b, "%s = $%d", quoteIdent(name), i+1)
	}

	b.WriteString(" LIMIT 1")

	return b.String()
}
