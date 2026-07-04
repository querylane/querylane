package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// observedAtBetween returns the WHERE predicate
// `column >= since AND column < until` used by all *_sample.ListSamples calls.
func observedAtBetween(column postgres.ColumnTimestampz, since, until time.Time) postgres.BoolExpression {
	return column.GT_EQ(postgres.TimestampzT(since)).
		AND(column.LT(postgres.TimestampzT(until)))
}

// sampleLimit clamps a caller-supplied row cap to a safe Postgres LIMIT
// value. limit <= 0 is treated as "no cap" by returning a very large value
// rather than 0/-1, which Postgres rejects.
func sampleLimit(limit int) int64 {
	if limit <= 0 {
		return int64(1) << 31
	}

	return int64(limit)
}

// PruneSamplesOlderThanTx deletes rows from every per-instance sample table
// where observed_at is older than now() - age. The cutoff is computed
// Postgres-side so all replicas agree on it.
func PruneSamplesOlderThanTx(ctx context.Context, exec QueryExecutor, age time.Duration) error {
	cutoff := postgres.NOW().SUB(postgres.INTERVALd(age))

	stmts := []postgres.DeleteStatement{
		table.InstanceConnectionSample.DELETE().WHERE(table.InstanceConnectionSample.ObservedAt.LT(cutoff)),
		table.InstanceStorageSample.DELETE().WHERE(table.InstanceStorageSample.ObservedAt.LT(cutoff)),
		table.InstanceCacheSample.DELETE().WHERE(table.InstanceCacheSample.ObservedAt.LT(cutoff)),
	}

	for _, stmt := range stmts {
		if _, err := stmt.ExecContext(ctx, exec); err != nil {
			return fmt.Errorf("prune samples: %w", err)
		}
	}

	return nil
}
