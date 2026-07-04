package postgres

import (
	"database/sql"

	"google.golang.org/protobuf/proto"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// scanResult carries the outcome of rowReader.collect, including
// budget bookkeeping the caller needs when minting next_page_token.
type scanResult struct {
	rows         []*api.TableResultRow
	cursors      [][]*api.TableValue
	wireBytes    int64 // approximate proto.Size sum of rows
	budgetCutoff bool  // true when scanning stopped on max_response_bytes
}

// rowReader owns the per-invocation state for one ReadRows call: the
// resolved plan, the public/cursor column metadata, the row identity, and
// the page/byte budgets. Methods on it (collect, scanOne,
// mintNextPageToken) consume that state instead of taking it as
// arguments — mirroring the queryStream pattern used by ExecuteQuery.
type rowReader struct {
	pg               *Postgres
	params           engine.ReadRowsParams
	plan             *paginationPlan
	publicCols       []*api.TableResultColumn
	cursorResultCols []*api.TableResultColumn
	identity         *api.RowIdentity
	identityNames    []string
	identityCursors  []int // -1 if an identity column isn't projected as a cursor
	pageSize         int
	maxResponseBytes int64
}

func newRowReader(pg *Postgres, params engine.ReadRowsParams, plan *paginationPlan, publicCols []*api.TableResultColumn, identity *api.RowIdentity, pageSize int, maxResponseBytes int64) *rowReader {
	cursorResultCols := make([]*api.TableResultColumn, len(plan.cursorColumns))
	for i, c := range plan.cursorColumns {
		cursorResultCols[i] = &api.TableResultColumn{
			DataType: c.DataType,
			RawType:  c.RawType,
		}
	}

	identityNames := identity.GetColumnNames()
	identityCursors := make([]int, len(identityNames))

	for k, name := range identityNames {
		identityCursors[k] = -1

		for i, col := range plan.cursorColumns {
			if col.Name == name {
				identityCursors[k] = i
				break
			}
		}
	}

	return &rowReader{
		pg:               pg,
		params:           params,
		plan:             plan,
		publicCols:       publicCols,
		cursorResultCols: cursorResultCols,
		identity:         identity,
		identityNames:    identityNames,
		identityCursors:  identityCursors,
		pageSize:         pageSize,
		maxResponseBytes: maxResponseBytes,
	}
}

// collect scans rows projected as:
//
//	[ public_0, (public_0__qlsize)?, public_1, (public_1__qlsize)?, …,
//	  cursor_0, cursor_1, … ]
//
// Size companions appear iff the column is preview-eligible AND previewMode
// is on. The scanner consumes them, compares against the scanned cell's
// length, and sets truncated/full_size_bytes/full_value_token when the
// stored value exceeds the projected prefix. Trailing cursor columns
// (un-truncated copies of every ORDER BY column) drive keyset cursors and
// full_value_token identity, independent of any public preview truncation.
//
// Reads at most pageSize+1 rows so the caller can detect "more" with a
// single LIMIT pageSize+1 query, and stops earlier if the cumulative
// proto wire size exceeds maxResponseBytes — in that case the caller is
// expected to mint next_page_token from the last included row even though
// it didn't request the full pageSize.
//
// If a single row exceeds the budget on its own, the scanner force-includes
// it after re-truncating its preview-eligible cells to emergencyCellBytes
// so the response stays parseable.
func (r *rowReader) collect(rows *sql.Rows) (*scanResult, error) {
	maxScan := r.pageSize + 1

	out := &scanResult{
		rows:    make([]*api.TableResultRow, 0, maxScan),
		cursors: make([][]*api.TableValue, 0, maxScan),
	}

	for rows.Next() {
		if len(out.rows) >= maxScan {
			break
		}

		row, cursorValues, identityValues, err := r.scanOne(rows)
		if err != nil {
			return nil, err
		}

		rowSize := int64(proto.Size(row))

		// Budget: stop adding rows once cumulative wire size exceeds
		// maxResponseBytes. If we've already emitted at least one row,
		// drop this row entirely and let the caller mint a token from the
		// previous one. If this is the very first row, force-include it
		// after applying emergency truncation so we always make progress.
		if r.maxResponseBytes > 0 && out.wireBytes+rowSize > r.maxResponseBytes {
			if len(out.rows) > 0 {
				out.budgetCutoff = true
				break
			}

			// Single huge row: re-truncate preview-eligible cells in place.
			changed, err := applyEmergencyTruncation(r.pg, row, r.plan.publicColumns, r.identity, identityValues, r.params.ResourceName)
			if err != nil {
				return nil, err
			}

			if changed {
				rowSize = int64(proto.Size(row))
			}
			// Mark cutoff so the caller knows pagination must continue.
			out.budgetCutoff = true
		}

		out.rows = append(out.rows, row)
		out.cursors = append(out.cursors, cursorValues)
		out.wireBytes += rowSize

		if out.budgetCutoff {
			break
		}
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("rows iteration", err)
	}

	return out, nil
}

// scanOne reads one wire row into a public TableResultRow and parallel
// cursor / identity TableValue slices. The wire layout is the one
// described on collect.
func (r *rowReader) scanOne(rows *sql.Rows) (*api.TableResultRow, []*api.TableValue, []*api.TableValue, error) {
	publicCount := len(r.publicCols)
	cursorCount := len(r.cursorResultCols)
	sizeCount := len(r.plan.previewColumns)
	wireCount := publicCount + sizeCount + cursorCount

	values := make([]any, wireCount)

	wirePos := 0
	for i := range publicCount {
		values[wirePos] = new(any)
		wirePos++

		if i < len(r.plan.previewMask) && r.plan.previewMask[i] {
			values[wirePos] = new(sql.NullInt64)
			wirePos++
		}
	}

	for range cursorCount {
		values[wirePos] = new(any)
		wirePos++
	}

	if err := rows.Scan(values...); err != nil {
		return nil, nil, nil, classifyQueryError("scan row", err)
	}

	cells := make([]*api.TableCell, publicCount)
	cellSizes := make([]int64, publicCount)

	wirePos = 0
	for i := range publicCount {
		ptr, _ := values[wirePos].(*any)
		cells[i] = &api.TableCell{Value: convertToValueTyped(*ptr, r.publicCols[i])}
		wirePos++

		if i < len(r.plan.previewMask) && r.plan.previewMask[i] {
			if sz, _ := values[wirePos].(*sql.NullInt64); sz != nil && sz.Valid {
				cellSizes[i] = sz.Int64
			}

			wirePos++
		}
	}

	cursorValues := make([]*api.TableValue, cursorCount)
	for i := range cursorCount {
		ptr, _ := values[wirePos].(*any)
		cursorValues[i] = convertToValueTyped(*ptr, r.cursorResultCols[i])
		wirePos++
	}

	identityValues := make([]*api.TableValue, len(r.identityNames))
	for k, idx := range r.identityCursors {
		if idx >= 0 && cursorValues[idx] != nil {
			identityValues[k] = cursorValues[idx]
			continue
		}

		identityValues[k] = &api.TableValue{Kind: &api.TableValue_NullValue{}}
	}

	for i, cell := range cells {
		full := cellSizes[i]
		if full <= 0 {
			continue
		}

		if int64(cellByteLength(cell.GetValue())) >= full {
			continue
		}

		cell.Truncated = true
		cell.FullSizeBytes = full

		tok, err := r.pg.mintFullValueToken(r.params.ResourceName, r.plan.publicColumns[i].Name, r.identity, identityValues)
		if err != nil {
			return nil, nil, nil, err
		}

		cell.FullValueToken = tok
	}

	return &api.TableResultRow{Values: cells}, cursorValues, identityValues, nil
}

// mintNextPageToken signs a continuation token from the last included row.
// emittedRows may be smaller than params.PageSize when max_response_bytes
// cuts the page short — the OFFSET branch must advance by what was actually
// returned, not by the requested page size.
func (r *rowReader) mintNextPageToken(lastCursors []*api.TableValue, emittedRows int) (string, error) {
	if r.plan.strategy == api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET {
		return r.pg.signPageToken(r.plan, r.params, lastCursors, 0)
	}

	return r.pg.signPageToken(r.plan, r.params, nil, r.plan.offset+int64(emittedRows))
}
