package postgres

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"slices"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const pageTokenTTL = 24 * time.Hour

// orderEntry is one column in a fully-resolved ORDER BY (visible columns
// plus any server-appended identity tiebreaker). dirAsc encodes direction
// to keep the SQL builder and the cursor predicate code in sync.
type orderEntry struct {
	column     string
	dirAsc     bool
	nullOrder  api.RowOrder_NullOrder
	tiebreaker bool // true when the entry was server-added (not in user OrderBy)
}

// paginationPlan captures everything the row scanner and SQL builder need
// to know about how the current page is being paged.
type paginationPlan struct {
	strategy api.PaginationStrategy

	// publicColumns is the list of columns the user receives (== order of
	// result.Columns and TableResultRow.values).
	publicColumns []engine.Column

	// cursorColumns are the columns projected as un-truncated trailing
	// "__qlcursor" aliases, one per plan.order entry. They are scanned
	// but not exposed; their values populate the keyset cursor (and the
	// row identity for full_value_token minting). Aligned with plan.order.
	cursorColumns []engine.Column

	// order is the resolved ORDER BY (visible + tiebreaker, deduplicated).
	order []orderEntry

	// offset is set when strategy == OFFSET; carries forward to the next
	// page token via PageTokenPayload.offset.
	offset int64

	// cursorValues is set when strategy == KEYSET on a continuation request:
	// the ORDER BY column values from the previous page's last row, used to
	// emit the WHERE predicate that advances past those values.
	cursorValues []*api.TableValue

	// hashes that bind a token to the request. Recomputed on every call
	// from the request itself so a token can't be reused against a
	// different filter/order/projection.
	filterHash     []byte
	orderHash      []byte
	projectionHash []byte

	// previewMode is true when CELL_VALUE_MODE is PREVIEW (the default)
	// and any public column is preview-eligible. The SQL builder rewrites
	// the projection to add `__qlsize` size companions for those columns.
	previewMode bool

	// maxCellChars is the effective per-cell character cap when
	// previewMode is true.
	maxCellChars int

	// previewColumns lists the indices into plan.publicColumns of columns
	// that get a __qlsize companion. The scanner uses this to know which
	// extra columns to consume after the public ones (and before the
	// internal tiebreaker columns).
	previewColumns []int

	// previewMask[i] mirrors previewColumns as a positional bitmap aligned
	// with publicColumns, so the per-row scanner can decide whether column
	// i has a size companion in O(1).
	previewMask []bool
}

// chooseStrategy returns KEYSET when the table has a primary-key identity
// AND every visible ORDER BY column is NOT NULL; otherwise OFFSET. Keyset
// on nullable sort columns silently breaks under tuple/lex predicates, so
// we fall back to OFFSET rather than claim KEYSET we can't deliver.
func chooseStrategy(identity *api.RowIdentity, params engine.ReadRowsParams, idx *columnIndex) api.PaginationStrategy {
	if identity == nil || identity.GetSource() != api.RowIdentity_SOURCE_PRIMARY_KEY {
		return api.PaginationStrategy_PAGINATION_STRATEGY_OFFSET
	}

	for _, ord := range params.OrderBy {
		col, ok := idx.get(ord.GetColumn())
		if !ok || col.IsNullable {
			return api.PaginationStrategy_PAGINATION_STRATEGY_OFFSET
		}
	}

	return api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET
}

// resolvePublicColumns returns the columns the user will receive. Empty
// SelectedColumns means "all in catalog ordinal order".
func resolvePublicColumns(catalog []engine.Column, selected []string) []engine.Column {
	if len(selected) == 0 {
		return catalog
	}

	idx := newColumnIndex(catalog)

	out := make([]engine.Column, 0, len(selected))

	for _, name := range selected {
		if col, ok := idx.get(name); ok {
			out = append(out, col)
		}
	}

	return out
}

// resolveCursorColumns returns an engine.Column per orderEntry, looked up
// in the catalog so the scanner can dispatch values with the correct
// TableValue kind. The ctid system column is synthesized (it never
// appears in the column catalog).
func resolveCursorColumns(order []orderEntry, idx *columnIndex) []engine.Column {
	out := make([]engine.Column, len(order))

	for i, e := range order {
		if e.column == ctidColumn {
			out[i] = engine.Column{Name: ctidColumn, DataType: api.DataType_DATA_TYPE_STRING, RawType: "tid"}
			continue
		}

		if col, ok := idx.get(e.column); ok {
			out[i] = col
			continue
		}

		// Validation has already rejected unknown columns; this path is
		// defensive. Synthesize a STRING column so scanning still works.
		out[i] = engine.Column{Name: e.column, DataType: api.DataType_DATA_TYPE_STRING}
	}

	return out
}

// resolveOrder builds the full ORDER BY: user-supplied columns first
// (preserving direction), then identity tiebreaker columns ASC.
// Tiebreaker entries that already appear in the visible order are skipped.
func resolveOrder(orderBy []*api.RowOrder, identity []identityColumn) []orderEntry {
	out := make([]orderEntry, 0, len(orderBy)+len(identity))
	seen := make(map[string]struct{}, len(orderBy)+len(identity))

	for _, ord := range orderBy {
		col := ord.GetColumn()
		if _, dup := seen[col]; dup {
			continue
		}

		seen[col] = struct{}{}
		out = append(out, orderEntry{
			column:    col,
			dirAsc:    ord.GetDirection() != api.RowOrder_DIRECTION_DESC,
			nullOrder: ord.GetNullOrder(),
		})
	}

	for _, id := range identity {
		if _, dup := seen[id.name]; dup {
			continue
		}

		seen[id.name] = struct{}{}
		out = append(out, orderEntry{
			column:     id.name,
			dirAsc:     true,
			tiebreaker: true,
		})
	}

	return out
}

// canonicalFilterHash hashes the deterministic-marshalled proto bytes of
// the filter tree. nil filter hashes to a known empty constant so cursor
// tokens minted with a nil filter compare equal across requests.
func canonicalFilterHash(f *api.RowFilter) ([]byte, error) {
	if f == nil {
		sum := sha256.Sum256(nil)
		return sum[:], nil
	}

	b, err := proto.MarshalOptions{Deterministic: true}.Marshal(f)
	if err != nil {
		return nil, fmt.Errorf("hash filter: %w", err)
	}

	sum := sha256.Sum256(b)

	return sum[:], nil
}

// canonicalOrderHash hashes the resolved ORDER BY (visible + tiebreaker).
// The textual encoding is deterministic and stable across versions.
func canonicalOrderHash(order []orderEntry) []byte {
	var b strings.Builder

	for i, e := range order {
		if i > 0 {
			b.WriteByte(';')
		}

		b.WriteString(e.column)
		b.WriteByte(':')

		if e.dirAsc {
			b.WriteString("asc")
		} else {
			b.WriteString("desc")
		}

		switch e.nullOrder { //nolint:exhaustive // unspecified means PG default
		case api.RowOrder_NULL_ORDER_FIRST:
			b.WriteString(":nf")
		case api.RowOrder_NULL_ORDER_LAST:
			b.WriteString(":nl")
		}

		if e.tiebreaker {
			b.WriteString(":tb")
		}
	}

	sum := sha256.Sum256([]byte(b.String()))

	return sum[:]
}

// canonicalProjectionHash hashes the public column names, sorted, so the
// hash is independent of user-supplied ordering. Empty projection (all
// columns from catalog) hashes to a stable list of catalog names.
func canonicalProjectionHash(public []engine.Column) []byte {
	names := make([]string, len(public))
	for i, c := range public {
		names[i] = c.Name
	}

	slices.Sort(names)

	sum := sha256.Sum256([]byte(strings.Join(names, ";")))

	return sum[:]
}

// keysetCursorPredicate emits the WHERE clause that advances past
// cursorValues for the given resolved order, appending the values to args
// in the order they're referenced. Returns the SQL text (or "" if the
// inputs are incompatible — see below).
//
// All-ASC compound order produces `(c1, …, ck) > ($N, …, $N+k-1)`. Mixed
// direction is expanded as `c1 OP1 $1 OR (c1 = $1 AND c2 OP2 $2) OR …`
// where OPi is `>` for ASC and `<` for DESC. NULLs are not handled here:
// chooseStrategy refuses KEYSET when any visible order column is nullable,
// and PK columns are NOT NULL by definition.
func keysetCursorPredicate(args *argList, order []orderEntry, cursorValues []any) string {
	if len(order) == 0 || len(order) != len(cursorValues) {
		return ""
	}

	allAsc := true

	for _, e := range order {
		if !e.dirAsc {
			allAsc = false

			break
		}
	}

	if allAsc {
		cols := make([]string, len(order))
		placeholders := args.addAll(cursorValues)

		for i, e := range order {
			cols[i] = quoteIdent(e.column)
		}

		return fmt.Sprintf("(%s) > (%s)", strings.Join(cols, ", "), strings.Join(placeholders, ", "))
	}

	// Mixed direction: lex expansion. Every $N slot in the i-th disjunct
	// reuses the same value, so add each cursor value once and remember its
	// placeholder.
	placeholders := args.addAll(cursorValues)

	var disjuncts []string

	for i := range order {
		conds := make([]string, 0, i+1)

		for j := range i {
			conds = append(conds, fmt.Sprintf("%s = %s", quoteIdent(order[j].column), placeholders[j]))
		}

		op := ">"
		if !order[i].dirAsc {
			op = "<"
		}

		conds = append(conds, fmt.Sprintf("%s %s %s", quoteIdent(order[i].column), op, placeholders[i]))

		if len(conds) == 1 {
			disjuncts = append(disjuncts, conds[0])
		} else {
			disjuncts = append(disjuncts, "("+strings.Join(conds, " AND ")+")")
		}
	}

	return strings.Join(disjuncts, " OR ")
}

// signPageToken encodes a continuation cursor signed with the engine's
// token codec. The caller-provided fields populate the payload; issued_at
// is set to time.Now() and the codec stamps the kind+HMAC.
func (d *Postgres) signPageToken(plan *paginationPlan, params engine.ReadRowsParams, cursorValues []*api.TableValue, offset int64) (string, error) {
	payload := &api.ReadRowsPageTokenPayload{
		Version:        1,
		TableName:      params.ResourceName,
		FilterHash:     plan.filterHash,
		OrderHash:      plan.orderHash,
		ProjectionHash: plan.projectionHash,
		PageSize:       int32(params.PageSize), //nolint:gosec // bounded by proto cap (500)
		IssuedAt:       timestamppb.Now(),
		Strategy:       plan.strategy,
	}

	if plan.strategy == api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET {
		payload.CursorValues = cursorValues
	} else {
		payload.Offset = offset
	}

	return d.tokens.Sign(engine.TokenKindReadRowsPage, payload)
}

// verifyPageToken validates a continuation token against the current
// request. It rejects any token whose hashes don't match (different
// filter, order, projection, or page_size), whose strategy disagrees with
// the engine's current choice, whose table_name is for a different table,
// or whose issued_at is older than pageTokenTTL.
func (d *Postgres) verifyPageToken(token string, plan *paginationPlan, params engine.ReadRowsParams) (*api.ReadRowsPageTokenPayload, error) {
	var payload api.ReadRowsPageTokenPayload
	if err := d.tokens.Verify(engine.TokenKindReadRowsPage, token, &payload); err != nil {
		return nil, fmt.Errorf("%w: %w", engine.ErrInvalidPageToken, err)
	}

	switch {
	case payload.GetTableName() != params.ResourceName:
		return nil, fmt.Errorf("%w: token bound to a different table", engine.ErrInvalidPageToken)
	case !bytes.Equal(payload.GetFilterHash(), plan.filterHash):
		return nil, fmt.Errorf("%w: filter changed since token was issued", engine.ErrInvalidPageToken)
	case !bytes.Equal(payload.GetOrderHash(), plan.orderHash):
		return nil, fmt.Errorf("%w: order_by changed since token was issued", engine.ErrInvalidPageToken)
	case !bytes.Equal(payload.GetProjectionHash(), plan.projectionHash):
		return nil, fmt.Errorf("%w: selected_columns changed since token was issued", engine.ErrInvalidPageToken)
	case payload.GetPageSize() != int32(params.PageSize): //nolint:gosec // bounded by proto cap (500)
		return nil, fmt.Errorf("%w: page_size changed since token was issued", engine.ErrInvalidPageToken)
	case payload.GetStrategy() != plan.strategy:
		return nil, fmt.Errorf("%w: pagination strategy changed since token was issued", engine.ErrInvalidPageToken)
	}

	if issued := payload.GetIssuedAt().AsTime(); time.Since(issued) > pageTokenTTL {
		return nil, fmt.Errorf("%w: token expired", engine.ErrInvalidPageToken)
	}

	return &payload, nil
}
