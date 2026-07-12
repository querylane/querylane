package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// SampleTableStats is the storage footprint of one metrics sample table.
type SampleTableStats struct {
	TableName string
	// EstimatedRowCount is the planner estimate (pg_class.reltuples), -1
	// when the table has never been vacuumed or analyzed. Sample tables can
	// hold millions of rows, so an exact count(*) is deliberately avoided.
	EstimatedRowCount int64
	TotalBytes        int64
	OldestObservedAt  *time.Time
	NewestObservedAt  *time.Time
}

// ListSampleTableStats reports size, row estimate, and retained sample range
// for every metrics sample table. The table set derives from
// prunedSampleColumns, the same list retention uses, so stats and retention
// cannot drift apart.
func ListSampleTableStats(ctx context.Context, db QueryExecutor) ([]SampleTableStats, error) {
	stats := make([]SampleTableStats, 0, len(prunedSampleColumns))

	for _, sample := range prunedSampleColumns {
		tableName := sample.observedAt.TableName()
		// Identifiers come from generated jet table constants, never user
		// input. min/max(observed_at) are cheap: observed_at is btree-indexed
		// on every sample table.
		query := fmt.Sprintf(
			`SELECT pg_total_relation_size('%[1]s'::regclass),
			        (SELECT reltuples::bigint FROM pg_class WHERE oid = '%[1]s'::regclass),
			        min(observed_at),
			        max(observed_at)
			 FROM %[1]s`,
			tableName,
		)

		var (
			totalBytes int64
			rowCount   int64
			oldest     sql.NullTime
			newest     sql.NullTime
		)
		if err := db.QueryRowContext(ctx, query).Scan(&totalBytes, &rowCount, &oldest, &newest); err != nil {
			return nil, fmt.Errorf("sample table stats for %s: %w", tableName, err)
		}

		stat := SampleTableStats{
			TableName:         tableName,
			EstimatedRowCount: rowCount,
			TotalBytes:        totalBytes,
		}
		if oldest.Valid {
			stat.OldestObservedAt = &oldest.Time
		}

		if newest.Valid {
			stat.NewestObservedAt = &newest.Time
		}

		stats = append(stats, stat)
	}

	return stats, nil
}
