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

// prunedSampleColumns lists the observed_at column of every sample table
// subject to age-based retention. The DELETE statements and the retention
// guard test (TestIntegrationPruneCoversAllSampleTables) both derive from
// this list, so a new *_sample table missing here fails the test instead of
// silently accumulating rows forever.
var prunedSampleColumns = []struct {
	sampleTable postgres.Table
	observedAt  postgres.ColumnTimestampz
}{
	{table.InstanceConnectionSample, table.InstanceConnectionSample.ObservedAt},
	{table.InstanceStorageSample, table.InstanceStorageSample.ObservedAt},
	{table.InstanceCacheSample, table.InstanceCacheSample.ObservedAt},
	{table.InstanceIoSample, table.InstanceIoSample.ObservedAt},
	{table.DatabaseSizeSample, table.DatabaseSizeSample.ObservedAt},
	{table.DatabaseVacuumSample, table.DatabaseVacuumSample.ObservedAt},
}

// PruneSamplesOlderThan deletes rows from every sample table where
// observed_at is older than now() - age, returning deleted rows per table.
// The cutoff is computed Postgres-side so all replicas agree on it.
//
// Deletes run in batches of roughly batchSize rows, each as its own
// statement, so db should be a *sql.DB: every batch then commits
// independently and partial progress survives a cancelled sweep. One
// unbounded DELETE would otherwise have to remove an arbitrarily large
// backlog (e.g. the entire retained window expiring during a long shutdown)
// inside the retention job's lease window — too slow to finish there, rolled
// back, and retried against an even larger backlog every cycle.
func PruneSamplesOlderThan(ctx context.Context, db QueryExecutor, age time.Duration, batchSize int64) (map[string]int64, error) {
	batchSize = max(batchSize, 1)
	pruned := make(map[string]int64, len(prunedSampleColumns))

	for _, sample := range prunedSampleColumns {
		pruned[sample.observedAt.TableName()] = 0

		for {
			cutoff := postgres.NOW().SUB(postgres.INTERVALd(age))

			// The batch boundary is the batchSize-th oldest expired
			// observed_at. Deleting up to it removes at least batchSize rows
			// (ties included), so every iteration makes progress; once fewer
			// than batchSize expired rows remain the subquery is empty and
			// COALESCE falls back to the cutoff, draining the tail.
			boundary := postgres.TimestampzExp(postgres.COALESCE(
				postgres.SELECT(sample.observedAt).
					FROM(sample.sampleTable).
					WHERE(sample.observedAt.LT(cutoff)).
					ORDER_BY(sample.observedAt.ASC()).
					OFFSET(batchSize-1).
					LIMIT(1),
				cutoff,
			))

			stmt := sample.sampleTable.DELETE().
				WHERE(sample.observedAt.LT(cutoff).AND(sample.observedAt.LT_EQ(boundary)))

			res, err := stmt.ExecContext(ctx, db)
			if err != nil {
				return nil, fmt.Errorf("prune samples: %w", err)
			}

			rows, err := res.RowsAffected()
			if err != nil {
				return nil, fmt.Errorf("prune samples rows affected: %w", err)
			}

			if rows == 0 {
				break
			}

			pruned[sample.observedAt.TableName()] += rows
		}
	}

	return pruned, nil
}
