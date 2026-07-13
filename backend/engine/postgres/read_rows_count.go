package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	exactRowCountSavepoint = "querylane_exact_row_count"
	// v1alpha1 ceiling: keep exact counts bounded until row-count policy is
	// configurable per instance or request.
	exactRowCountEstimateThreshold int64 = 1_000_000
	// v1alpha1 ceiling: keep exact counts bounded until row-count policy is
	// configurable per instance or request.
	exactRowCountTimeout = 2 * time.Second
)

func (d *Postgres) resolveReadRowsRowCount(ctx context.Context, tx *sql.Tx, params engine.ReadRowsParams) (*api.RowCount, error) {
	switch params.RowCountMode {
	case api.RowCountMode_ROW_COUNT_MODE_UNSPECIFIED, api.RowCountMode_ROW_COUNT_MODE_NONE:
		return &api.RowCount{Status: api.RowCount_STATUS_NOT_REQUESTED}, nil
	case api.RowCountMode_ROW_COUNT_MODE_ESTIMATE:
		stats, found, err := readRowCountStats(ctx, tx, params)
		if err != nil {
			return nil, err
		}

		if !found {
			return &api.RowCount{Status: api.RowCount_STATUS_UNAVAILABLE}, nil
		}

		return &api.RowCount{Status: api.RowCount_STATUS_ESTIMATED, Value: stats.estimate}, nil
	case api.RowCountMode_ROW_COUNT_MODE_EXACT:
		stats, found, err := readRowCountStats(ctx, tx, params)
		if err != nil {
			return nil, err
		}

		if !found {
			return &api.RowCount{Status: api.RowCount_STATUS_UNAVAILABLE}, nil
		}

		if declined := buildExactRowCountFromStats(stats); declined != nil {
			return declined, nil
		}

		count, err := readExactRowCount(ctx, tx, params)
		if err != nil {
			if isExactRowCountTimeout(err) {
				return &api.RowCount{Status: api.RowCount_STATUS_UNAVAILABLE}, nil
			}

			return nil, err
		}

		return &api.RowCount{Status: api.RowCount_STATUS_AVAILABLE, Value: count}, nil
	default:
		return &api.RowCount{Status: api.RowCount_STATUS_UNAVAILABLE}, nil
	}
}

func isExactRowCountTimeout(err error) bool {
	return errors.Is(err, engine.ErrQueryTimeout) || postgreserrors.IsKind(err, postgreserrors.KindTimeout)
}

func buildExactRowCountFromStats(stats rowCountStats) *api.RowCount {
	if stats.relkind == postgresRelkindForeignTable {
		return &api.RowCount{Status: api.RowCount_STATUS_UNAVAILABLE}
	}

	if stats.estimate > exactRowCountEstimateThreshold {
		return &api.RowCount{Status: api.RowCount_STATUS_ESTIMATED, Value: stats.estimate}
	}

	return nil
}

type rowCountStats struct {
	estimate int64
	relkind  string
}

const postgresRelkindForeignTable = "f"

func readRowCountStats(ctx context.Context, tx *sql.Tx, params engine.ReadRowsParams) (rowCountStats, bool, error) {
	var stats rowCountStats

	err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(GREATEST(c.reltuples, 0)::bigint, 0), c.relkind::text
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1
			AND c.relname = $2
			AND c.relkind IN ('r', 'p', 'f')
	`, params.SchemaName, params.TableName).Scan(&stats.estimate, &stats.relkind)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return rowCountStats{}, false, nil
		}

		return rowCountStats{}, false, classifyQueryError("read row count stats", err)
	}

	return stats, true, nil
}

func readExactRowCount(ctx context.Context, tx *sql.Tx, params engine.ReadRowsParams) (int64, error) {
	if err := beginExactRowCountSavepoint(ctx, tx); err != nil {
		return 0, err
	}

	if err := setStatementTimeout(ctx, tx, exactRowCountTimeout, postgreserrors.ProfileDefault); err != nil {
		if rollbackErr := rollbackExactRowCountSavepoint(ctx, tx); rollbackErr != nil {
			return 0, rollbackErr
		}

		return 0, err
	}

	query, args, err := buildExactRowCountQuery(params)
	if err != nil {
		if rollbackErr := rollbackExactRowCountSavepoint(ctx, tx); rollbackErr != nil {
			return 0, rollbackErr
		}

		return 0, err
	}

	var count int64
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		classified := classifyQueryError("exact row count", err)

		if rollbackErr := rollbackExactRowCountSavepoint(ctx, tx); rollbackErr != nil {
			return 0, rollbackErr
		}

		return 0, classified
	}

	if err := setStatementTimeout(ctx, tx, defaultReadTimeout, postgreserrors.ProfileDefault); err != nil {
		if rollbackErr := rollbackExactRowCountSavepoint(ctx, tx); rollbackErr != nil {
			return 0, rollbackErr
		}

		return 0, err
	}

	if err := releaseExactRowCountSavepoint(ctx, tx); err != nil {
		return 0, err
	}

	return count, nil
}

func beginExactRowCountSavepoint(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "SAVEPOINT "+exactRowCountSavepoint); err != nil {
		return classifyQueryError("begin exact row count savepoint", err)
	}

	return nil
}

func rollbackExactRowCountSavepoint(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT "+exactRowCountSavepoint); err != nil {
		return classifyQueryError("rollback exact row count savepoint", err)
	}

	return releaseExactRowCountSavepoint(ctx, tx)
}

func releaseExactRowCountSavepoint(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, "RELEASE SAVEPOINT "+exactRowCountSavepoint); err != nil {
		return classifyQueryError("release exact row count savepoint", err)
	}

	return nil
}

func buildExactRowCountQuery(params engine.ReadRowsParams) (string, []any, error) {
	args := &argList{}

	var b strings.Builder

	fmt.Fprintf(&b, "SELECT COUNT(*) FROM %s.%s", quoteIdent(params.SchemaName), quoteIdent(params.TableName))

	if params.Filter != nil && params.Filter.GetNode() != nil {
		clause, err := buildFilterNode(args, params.Filter)
		if err != nil {
			return "", nil, err
		}

		if clause != "" {
			b.WriteString(" WHERE ")
			b.WriteString(clause)
		}
	}

	return b.String(), args.values(), nil
}
