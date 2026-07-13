package postgres

import (
	"context"
	"database/sql"
	"time"

	"google.golang.org/protobuf/types/known/durationpb"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// ReadRows orchestrates a single paged read of a user table. It runs the
// catalog lookup and row-identity discovery in parallel, validates the
// request, derives a paginationPlan (which selects KEYSET vs. OFFSET),
// then hands the actual row scan off to a rowReader.
func (d *Postgres) ReadRows(ctx context.Context, db *sql.DB, params engine.ReadRowsParams) (*engine.ReadRowsResult, error) {
	catalog, rowIdentity, identityCols, err := d.loadReadRowsCatalog(ctx, db, params)
	if err != nil {
		return nil, err
	}

	if err := validateReadRowsRequest(catalog, params); err != nil {
		return nil, err
	}

	plan, err := d.buildPlan(catalog, rowIdentity, identityCols, params)
	if err != nil {
		return nil, err
	}

	query, args, err := buildReadRowsQuery(params, plan)
	if err != nil {
		return nil, err
	}

	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, classifyQueryError("begin read-only tx", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := setStatementTimeout(ctx, tx, defaultReadTimeout, postgreserrors.ProfileDefault); err != nil {
		return nil, err
	}

	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, classifyQueryError("query rows", err)
	}

	publicResultCols := buildResultColumnsForPlan(plan)
	maxRespBytes := resolveMaxResponseBytes(params.MaxResponseBytes)

	reader := newRowReader(d, params, plan, publicResultCols, rowIdentity, params.PageSize, maxRespBytes)

	scan, err := func() (*scanResult, error) {
		defer rows.Close()

		return reader.collect(rows)
	}()
	if err != nil {
		return nil, err
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("rows iteration", err)
	}

	rowCount, err := d.resolveReadRowsRowCount(ctx, tx, params)
	if err != nil {
		return nil, err
	}

	resultRows := scan.rows
	lastCursors := scan.cursors
	nextPageToken := ""

	switch {
	case len(resultRows) > params.PageSize:
		// We fetched pageSize+1 to detect "more"; trim and mint a cursor.
		resultRows = resultRows[:params.PageSize]
		lastCursors = lastCursors[:params.PageSize]

		token, terr := reader.mintNextPageToken(lastCursors[len(lastCursors)-1], len(resultRows))
		if terr != nil {
			return nil, terr
		}

		nextPageToken = token

	case scan.budgetCutoff && len(resultRows) > 0:
		// Stopped early on max_response_bytes; advance OFFSET by len(resultRows),
		// not params.PageSize.
		token, terr := reader.mintNextPageToken(lastCursors[len(lastCursors)-1], len(resultRows))
		if terr != nil {
			return nil, terr
		}

		nextPageToken = token
	}

	return &engine.ReadRowsResult{
		Columns:            publicResultCols,
		Rows:               resultRows,
		NextPageToken:      nextPageToken,
		RowCount:           rowCount,
		RowIdentity:        rowIdentity,
		PaginationStrategy: plan.strategy,
		ObservedAt:         time.Now(),
		Limits: &api.ResponseLimits{
			MaxPageSize:            maxPageSize,
			MaxCellBytes:           maxPreviewBytes,
			EffectiveCellBytes:     int32(plan.maxCellChars), //nolint:gosec // bounded by maxPreviewBytes
			MaxResponseBytes:       maxResponseBytesCap,
			EffectiveResponseBytes: scan.wireBytes,
			MaxFilterDepth:         maxFilterDepth,
			MaxFilterNodes:         maxFilterNodes,
			QueryTimeout:           durationpb.New(defaultReadTimeout),
		},
	}, nil
}
