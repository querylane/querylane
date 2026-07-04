package postgres

import (
	"context"
	"database/sql"

	"golang.org/x/sync/errgroup"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// loadReadRowsCatalog fetches the table's column metadata and row identity
// in parallel; both are needed before the request can be validated or
// planned.
func (d *Postgres) loadReadRowsCatalog(ctx context.Context, db *sql.DB, params engine.ReadRowsParams) ([]engine.Column, *api.RowIdentity, []identityColumn, error) {
	var (
		catalog      []engine.Column
		rowIdentity  *api.RowIdentity
		identityCols []identityColumn
	)

	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		cols, err := d.ListTableColumns(gctx, db, params.SchemaName, params.TableName)
		if err != nil {
			return err
		}

		catalog = cols

		return nil
	})
	g.Go(func() error {
		ident, cols, err := discoverRowIdentity(gctx, db, params.SchemaName, params.TableName)
		if err != nil {
			return err
		}

		rowIdentity = ident
		identityCols = cols

		return nil
	})

	if err := g.Wait(); err != nil {
		return nil, nil, nil, err
	}

	return catalog, rowIdentity, identityCols, nil
}

// buildPlan assembles the paginationPlan for one ReadRows call: chosen
// strategy, public columns, resolved ORDER BY (with identity tiebreakers),
// preview mask, cursor columns, canonical hashes, and any decoded
// continuation state.
func (d *Postgres) buildPlan(catalog []engine.Column, rowIdentity *api.RowIdentity, identityCols []identityColumn, params engine.ReadRowsParams) (*paginationPlan, error) {
	idx := newColumnIndex(catalog)
	publicCols := resolvePublicColumns(catalog, params.SelectedColumns)

	plan := &paginationPlan{
		strategy:      chooseStrategy(rowIdentity, params, idx),
		publicColumns: publicCols,
		order:         resolveOrder(params.OrderBy, identityCols),
		previewMode:   params.CellValueMode != api.CellValueMode_CELL_VALUE_MODE_FULL,
		maxCellChars:  resolveMaxCellChars(params.MaxCellBytes),
	}

	// Every ORDER BY column (visible or appended tiebreaker) gets a
	// trailing un-truncated cursor projection so keyset cursors are never
	// derived from preview-truncated public cells.
	plan.cursorColumns = resolveCursorColumns(plan.order, idx)

	if plan.previewMode {
		// Identity columns are excluded from preview truncation: their
		// scanned value is reused to mint full_value_token, and a truncated
		// prefix in the WHERE clause of a follow-up ReadCellValue would
		// match no rows. PK columns are typically short anyway.
		identityNames := make(map[string]struct{}, len(rowIdentity.GetColumnNames()))
		for _, name := range rowIdentity.GetColumnNames() {
			identityNames[name] = struct{}{}
		}

		plan.previewMask = make([]bool, len(plan.publicColumns))

		for i, col := range plan.publicColumns {
			if _, isIdentity := identityNames[col.Name]; isIdentity {
				continue
			}

			if previewEligible(col) {
				plan.previewColumns = append(plan.previewColumns, i)
				plan.previewMask[i] = true
			}
		}
	}

	filterHash, err := canonicalFilterHash(params.Filter)
	if err != nil {
		return nil, err
	}

	plan.filterHash = filterHash
	plan.orderHash = canonicalOrderHash(plan.order)
	plan.projectionHash = canonicalProjectionHash(plan.publicColumns)

	if params.PageToken != "" {
		payload, verr := d.verifyPageToken(params.PageToken, plan, params)
		if verr != nil {
			return nil, verr
		}

		switch payload.GetStrategy() { //nolint:exhaustive // verifyPageToken already enforced
		case api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET:
			plan.cursorValues = payload.GetCursorValues()
		case api.PaginationStrategy_PAGINATION_STRATEGY_OFFSET:
			plan.offset = payload.GetOffset()
		}
	}

	return plan, nil
}

// buildResultColumnsForPlan returns the public column metadata
// (corresponding to plan.publicColumns). Size-companion and cursor
// columns are stripped from what the client sees.
//
// Wire layout per row, left-to-right:
//
//	[ public_0, (public_0__qlsize)?, public_1, (public_1__qlsize)?, …,
//	  cursor_0, cursor_1, … ]
//
// The size companion appears iff the column is preview-eligible AND
// previewMode is on AND the column is not part of the row identity.
//
// Public column metadata comes from the catalog (plan.publicColumns), not
// rows.ColumnTypes(): under PREVIEW the SQL projection casts non-text
// preview-eligible columns through ::text, which would otherwise lose the
// original data_type/raw_type and downstream value kind.
func buildResultColumnsForPlan(plan *paginationPlan) []*api.TableResultColumn {
	out := make([]*api.TableResultColumn, len(plan.publicColumns))

	for i, col := range plan.publicColumns {
		out[i] = &api.TableResultColumn{
			ColumnName:  col.Name,
			DataType:    col.DataType,
			RawType:     col.RawType,
			IsNullable:  col.IsNullable,
			MayTruncate: i < len(plan.previewMask) && plan.previewMask[i],
		}
	}

	return out
}
