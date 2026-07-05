package jobs

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
)

func TestSampleRetentionRun(t *testing.T) {
	t.Parallel()

	cfg := runner.Config{Name: SampleRetentionJobName, Interval: time.Hour, LeaseDuration: 5 * time.Minute, Concurrency: 1}

	t.Run("prunes samples during run and leases during commit", func(t *testing.T) {
		t.Parallel()

		var sampleCalls, leaseCalls int

		job := NewSampleRetention(cfg, noopQueryExecutor{}, 30*24*time.Hour, 40*24*time.Hour)
		job.pruneSamples = func(_ context.Context, db storage.QueryExecutor, age time.Duration, batchSize int64) (map[string]int64, error) {
			sampleCalls++

			assert.Equal(t, noopQueryExecutor{}, db, "sample sweep must run on the job's own DB handle, not the commit transaction")
			assert.Equal(t, 30*24*time.Hour, age)
			assert.Positive(t, batchSize)

			return map[string]int64{"instance_io_sample": 3}, nil
		}
		job.pruneLeases = func(_ context.Context, _ storage.QueryExecutor, age time.Duration) (int64, error) {
			leaseCalls++

			assert.Equal(t, 40*24*time.Hour, age)

			return 1, nil
		}

		result, err := job.Run(t.Context(), retentionTarget)
		require.NoError(t, err)
		require.NotNil(t, result.Commit)

		assert.Equal(t, 1, sampleCalls, "samples are pruned during Run, before any commit")
		assert.Equal(t, 0, leaseCalls, "lease pruning waits for Commit")

		require.NoError(t, result.Commit(t.Context(), noopQueryExecutor{}))
		assert.Equal(t, 1, leaseCalls)
		assert.Equal(t, 1, sampleCalls, "Commit must not prune samples again")
	})

	t.Run("sample prune failure fails the run without a commit", func(t *testing.T) {
		t.Parallel()

		pruneErr := errors.New("sweep interrupted")

		job := NewSampleRetention(cfg, noopQueryExecutor{}, 30*24*time.Hour, 40*24*time.Hour)
		job.pruneSamples = func(context.Context, storage.QueryExecutor, time.Duration, int64) (map[string]int64, error) {
			return nil, pruneErr
		}
		job.pruneLeases = func(context.Context, storage.QueryExecutor, time.Duration) (int64, error) {
			t.Fatal("lease pruning must not run when the sample sweep failed")
			return 0, nil
		}

		result, err := job.Run(t.Context(), retentionTarget)
		require.ErrorIs(t, err, pruneErr)
		assert.Nil(t, result.Commit)
	})

	t.Run("lease prune failure fails the commit", func(t *testing.T) {
		t.Parallel()

		leaseErr := errors.New("lease prune failed")

		job := NewSampleRetention(cfg, noopQueryExecutor{}, 30*24*time.Hour, 40*24*time.Hour)
		job.pruneSamples = func(context.Context, storage.QueryExecutor, time.Duration, int64) (map[string]int64, error) {
			return map[string]int64{}, nil
		}
		job.pruneLeases = func(context.Context, storage.QueryExecutor, time.Duration) (int64, error) {
			return 0, leaseErr
		}

		result, err := job.Run(t.Context(), retentionTarget)
		require.NoError(t, err)
		require.NotNil(t, result.Commit)

		assert.ErrorIs(t, result.Commit(t.Context(), noopQueryExecutor{}), leaseErr)
	})
}
