package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// TestIntegrationPruneCoversAllSampleTables fails when a *_sample table
// exists in the schema but is missing from prunedSampleColumns — the drift
// that would otherwise make a new probe's samples accumulate forever.
func TestIntegrationPruneCoversAllSampleTables(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)

	rows, err := testDB.DB().QueryContext(t.Context(),
		`SELECT table_name
		 FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name LIKE '%\_sample'`)
	require.NoError(t, err)

	defer rows.Close()

	var schemaTables []string

	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))

		schemaTables = append(schemaTables, name)
	}

	require.NoError(t, rows.Err())
	require.NotEmpty(t, schemaTables)

	prunedTables := make([]string, 0, len(prunedSampleColumns))
	for _, pruned := range prunedSampleColumns {
		prunedTables = append(prunedTables, pruned.observedAt.TableName())
	}

	assert.ElementsMatch(t, schemaTables, prunedTables,
		"every *_sample table must be registered in prunedSampleColumns (sample_query.go)")
}

func TestIntegrationPruneSamplesOlderThan_PrunesAllSampleTables(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)
	ctx := t.Context()

	oldTime := time.Now().Add(-40 * 24 * time.Hour)
	freshTime := time.Now().Add(-time.Hour)

	ioStore := NewInstanceIOSampleStore(testDB.DB())
	sizeStore := NewDatabaseSizeSampleStore(testDB.DB())
	vacuumStore := NewDatabaseVacuumSampleStore(testDB.DB())

	err := RunInTransaction(ctx, testDB.DB(), func(exec QueryExecutor) error {
		for _, observedAt := range []time.Time{oldTime, freshTime} {
			if err := ioStore.InsertTx(ctx, exec, model.InstanceIoSample{
				InstanceID: "inst", ObservedAt: observedAt, Reads: 1,
			}); err != nil {
				return err
			}

			if err := sizeStore.InsertManyTx(ctx, exec, []model.DatabaseSizeSample{
				{InstanceID: "inst", DatabaseName: "appdb", ObservedAt: observedAt, SizeBytes: 42},
			}); err != nil {
				return err
			}

			if err := vacuumStore.InsertTx(ctx, exec, model.DatabaseVacuumSample{
				InstanceID: "inst", DatabaseName: "appdb", ObservedAt: observedAt, LiveTuples: 10,
			}); err != nil {
				return err
			}
		}

		return nil
	})
	require.NoError(t, err)

	err = RunInTransaction(ctx, testDB.DB(), func(exec QueryExecutor) error {
		pruned, pruneErr := PruneSamplesOlderThanTx(ctx, exec, 30*24*time.Hour)
		if pruneErr != nil {
			return pruneErr
		}

		// One old row per touched table; untouched tables report zero.
		assert.Equal(t, int64(1), pruned["instance_io_sample"])
		assert.Equal(t, int64(1), pruned["database_size_sample"])
		assert.Equal(t, int64(1), pruned["database_vacuum_sample"])
		assert.Equal(t, int64(0), pruned["instance_connection_sample"])

		return nil
	})
	require.NoError(t, err)

	since := time.Now().Add(-100 * 24 * time.Hour)
	until := time.Now()

	ioSamples, err := ioStore.ListSamples(ctx, "inst", since, until, 0)
	require.NoError(t, err)
	require.Len(t, ioSamples, 1)
	assert.WithinDuration(t, freshTime, ioSamples[0].ObservedAt, time.Second)

	sizeSamples, err := sizeStore.ListSamples(ctx, "inst", "appdb", since, until, 0)
	require.NoError(t, err)
	require.Len(t, sizeSamples, 1)
	assert.Equal(t, int64(42), sizeSamples[0].SizeBytes)

	vacuumSamples, err := vacuumStore.ListSamples(ctx, "inst", "appdb", since, until, 0)
	require.NoError(t, err)
	require.Len(t, vacuumSamples, 1)
	assert.Equal(t, int64(10), vacuumSamples[0].LiveTuples)
}

// TestIntegrationPruneStaleRunnerExecutionState verifies that
// runner_execution_state rows whose targets stopped running (deleted
// instances/databases) age out, while active targets and held leases are
// untouched.
func TestIntegrationPruneStaleRunnerExecutionState(t *testing.T) {
	t.Parallel()

	testDB := NewTestDB(t)
	ctx := t.Context()

	_, err := testDB.DB().ExecContext(ctx,
		`INSERT INTO runner_execution_state (runner_name, target_name, last_started_at)
		 VALUES
		   ('probe_cache', 'instances/departed', now() - interval '40 days'),
		   ('probe_cache', 'instances/active', now() - interval '1 hour')`)
	require.NoError(t, err)

	_, err = testDB.DB().ExecContext(ctx,
		`INSERT INTO runner_execution_state (runner_name, target_name)
		 VALUES ('probe_cache', 'instances/never-started')`)
	require.NoError(t, err)

	_, err = testDB.DB().ExecContext(ctx,
		`INSERT INTO runner_execution_state (runner_name, target_name, last_started_at, lease_owner, lease_expires_at)
		 VALUES ('probe_cache', 'instances/held-lease', now() - interval '40 days', 'worker-a', now() + interval '1 minute')`)
	require.NoError(t, err)

	err = RunInTransaction(ctx, testDB.DB(), func(exec QueryExecutor) error {
		pruned, pruneErr := PruneStaleRunnerExecutionStateTx(ctx, exec, 30*24*time.Hour)
		if pruneErr != nil {
			return pruneErr
		}

		assert.Equal(t, int64(1), pruned, "only the departed row is prunable")

		return nil
	})
	require.NoError(t, err)

	rows, err := testDB.DB().QueryContext(ctx,
		`SELECT target_name FROM runner_execution_state WHERE runner_name = 'probe_cache' ORDER BY target_name`)
	require.NoError(t, err)

	defer rows.Close()

	var remaining []string

	for rows.Next() {
		var target string
		require.NoError(t, rows.Scan(&target))

		remaining = append(remaining, target)
	}

	require.NoError(t, rows.Err())

	// NULL last_started_at (claimed but never run) is kept: NULL < cutoff is
	// not true, and the row may belong to a target awaiting its first run.
	// A held lease is never deleted no matter how old its last start is.
	assert.Equal(t, []string{"instances/active", "instances/held-lease", "instances/never-started"}, remaining)
}
