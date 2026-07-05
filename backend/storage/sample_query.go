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
	sampleTable postgres.WritableTable
	observedAt  postgres.ColumnTimestampz
}{
	{table.InstanceConnectionSample, table.InstanceConnectionSample.ObservedAt},
	{table.InstanceStorageSample, table.InstanceStorageSample.ObservedAt},
	{table.InstanceCacheSample, table.InstanceCacheSample.ObservedAt},
	{table.InstanceIoSample, table.InstanceIoSample.ObservedAt},
	{table.DatabaseSizeSample, table.DatabaseSizeSample.ObservedAt},
	{table.DatabaseVacuumSample, table.DatabaseVacuumSample.ObservedAt},
}

// PruneSamplesOlderThanTx deletes rows from every sample table where
// observed_at is older than now() - age, returning deleted rows per table.
// The cutoff is computed Postgres-side so all replicas agree on it.
func PruneSamplesOlderThanTx(ctx context.Context, exec QueryExecutor, age time.Duration) (map[string]int64, error) {
	cutoff := postgres.NOW().SUB(postgres.INTERVALd(age))
	pruned := make(map[string]int64, len(prunedSampleColumns))

	for _, sample := range prunedSampleColumns {
		stmt := sample.sampleTable.DELETE().WHERE(sample.observedAt.LT(cutoff))

		res, err := stmt.ExecContext(ctx, exec)
		if err != nil {
			return nil, fmt.Errorf("prune samples: %w", err)
		}

		rows, err := res.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("prune samples rows affected: %w", err)
		}

		pruned[sample.observedAt.TableName()] = rows
	}

	return pruned, nil
}
