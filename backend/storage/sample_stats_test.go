package storage

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegrationListSampleTableStats(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	testDB := NewTestDB(t)
	ctx := t.Context()

	_, err := testDB.DB().ExecContext(ctx,
		`INSERT INTO instance_connection_sample (instance_id, observed_at, active, idle, total, max_conn)
		 VALUES
		   ('prod', now() - interval '2 hours', 3, 5, 8, 100),
		   ('prod', now() - interval '1 hour',  4, 4, 8, 100)`)
	require.NoError(t, err)

	stats, err := ListSampleTableStats(ctx, testDB.DB())
	require.NoError(t, err)

	// Exactly the retention-covered sample tables, in the same order.
	require.Len(t, stats, len(prunedSampleColumns))

	names := make([]string, 0, len(stats))
	for _, s := range stats {
		names = append(names, s.TableName)
		assert.Positive(t, s.TotalBytes, "table %s reports on-disk size even when empty", s.TableName)
	}

	assert.True(t, slices.Contains(names, "instance_connection_sample"))
	assert.True(t, slices.Contains(names, "database_vacuum_sample"))

	idx := slices.IndexFunc(stats, func(s SampleTableStats) bool {
		return s.TableName == "instance_connection_sample"
	})
	require.NotEqual(t, -1, idx)
	seeded := stats[idx]
	require.NotNil(t, seeded.OldestObservedAt)
	require.NotNil(t, seeded.NewestObservedAt)
	assert.True(t, seeded.NewestObservedAt.After(*seeded.OldestObservedAt))

	// Empty tables report no sample range instead of erroring.
	emptyIdx := slices.IndexFunc(stats, func(s SampleTableStats) bool {
		return s.TableName == "database_vacuum_sample"
	})
	require.NotEqual(t, -1, emptyIdx)
	assert.Nil(t, stats[emptyIdx].OldestObservedAt)
	assert.Nil(t, stats[emptyIdx].NewestObservedAt)
}
