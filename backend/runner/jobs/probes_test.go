package jobs

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestConnectionsProbe_CommitWritesSample(t *testing.T) {
	t.Parallel()

	session := &fakeInstanceSession{
		connMetrics: &engine.ConnectionMetrics{Active: 3, Idle: 5, Total: 8, Max: 100},
	}
	store := &fakeConnectionSampleStore{}

	job := NewConnectionsProbe(probeConfig(ConnectionsProbeName), &fakeSessionOpener{session: session}, store, singleInstanceSource())

	result, err := job.Run(context.Background(), "instances/test")
	require.NoError(t, err)
	runCommit(t, result)

	require.Len(t, store.samples, 1)
	sample := store.samples[0]
	assert.Equal(t, "test", sample.InstanceID)
	assert.Equal(t, int64(3), sample.Active)
	assert.Equal(t, int64(5), sample.Idle)
	assert.Equal(t, int64(8), sample.Total)
	assert.Equal(t, int64(100), sample.MaxConn)
	assert.False(t, sample.ObservedAt.IsZero())
}

func TestCacheProbe_CommitWritesSample(t *testing.T) {
	t.Parallel()

	statsReset := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	session := &fakeInstanceSession{
		cacheCounters: &engine.CacheCounters{BlocksHit: 900, BlocksRead: 100, StatsReset: &statsReset},
	}
	store := &fakeCacheSampleStore{}

	job := NewCacheProbe(probeConfig(CacheProbeName), &fakeSessionOpener{session: session}, store, singleInstanceSource())

	result, err := job.Run(context.Background(), "instances/test")
	require.NoError(t, err)
	runCommit(t, result)

	require.Len(t, store.samples, 1)
	sample := store.samples[0]
	assert.Equal(t, int64(900), sample.BlocksHit)
	assert.Equal(t, int64(100), sample.BlocksRead)
	require.NotNil(t, sample.StatsReset)
	assert.Equal(t, statsReset, *sample.StatsReset)
}

func TestStorageProbe_CommitWritesTotalAndPerDatabase(t *testing.T) {
	t.Parallel()

	session := &fakeInstanceSession{
		databaseSizes: []engine.DatabaseSize{
			{DatabaseName: "appdb", SizeBytes: 700},
			{DatabaseName: "postgres", SizeBytes: 300},
		},
	}
	instanceStore := &fakeStorageSampleStore{}
	databaseStore := &fakeDatabaseSizeSampleStore{}

	job := NewStorageProbe(probeConfig(StorageProbeName), &fakeSessionOpener{session: session}, instanceStore, databaseStore, singleInstanceSource())

	result, err := job.Run(context.Background(), "instances/test")
	require.NoError(t, err)
	runCommit(t, result)

	require.Len(t, instanceStore.samples, 1)
	assert.Equal(t, int64(1000), instanceStore.samples[0].TotalSizeBytes)

	require.Len(t, databaseStore.samples, 1)
	perDatabase := databaseStore.samples[0]
	require.Len(t, perDatabase, 2)
	assert.Equal(t, "appdb", perDatabase[0].DatabaseName)
	assert.Equal(t, int64(700), perDatabase[0].SizeBytes)
	assert.Equal(t, "postgres", perDatabase[1].DatabaseName)
	assert.Equal(t, int64(300), perDatabase[1].SizeBytes)

	// Total and per-database rows must share the observation timestamp so
	// charts can join them.
	assert.Equal(t, instanceStore.samples[0].ObservedAt, perDatabase[0].ObservedAt)
}

func TestIOProbe_CommitWritesSample(t *testing.T) {
	t.Parallel()

	statsReset := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	session := &fakeInstanceSession{
		versionNum: 170000,
		ioCounters: &engine.IOCounters{
			Reads: 1, ReadBytes: 8192, Writes: 2, WriteBytes: 16384,
			Extends: 3, ExtendBytes: 24576, Fsyncs: 4, StatsReset: &statsReset,
		},
	}
	store := &fakeIOSampleStore{}

	job := NewIOProbe(probeConfig(IOProbeName), &fakeSessionOpener{session: session}, store, singleInstanceSource())

	result, err := job.Run(context.Background(), "instances/test")
	require.NoError(t, err)
	runCommit(t, result)

	require.Len(t, store.samples, 1)
	sample := store.samples[0]
	assert.Equal(t, int64(1), sample.Reads)
	assert.Equal(t, int64(8192), sample.ReadBytes)
	assert.Equal(t, int64(2), sample.Writes)
	assert.Equal(t, int64(16384), sample.WriteBytes)
	assert.Equal(t, int64(3), sample.Extends)
	assert.Equal(t, int64(24576), sample.ExtendBytes)
	assert.Equal(t, int64(4), sample.Fsyncs)
	require.NotNil(t, sample.StatsReset)
	assert.Equal(t, statsReset, *sample.StatsReset)
}

func TestIOProbe_SkipsServersWithoutPgStatIO(t *testing.T) {
	t.Parallel()

	session := &fakeInstanceSession{versionNum: 150004}
	store := &fakeIOSampleStore{}

	job := NewIOProbe(probeConfig(IOProbeName), &fakeSessionOpener{session: session}, store, singleInstanceSource())

	result, err := job.Run(context.Background(), "instances/test")
	require.NoError(t, err)
	assert.Nil(t, result.Commit)
	assert.Empty(t, store.samples)
}

func TestVacuumProbe_CommitWritesSample(t *testing.T) {
	t.Parallel()

	statsReset := time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)
	session := &fakeInstanceSession{
		dbSession: &fakeDatabaseSession{
			vacuumCounters: &engine.VacuumCounters{
				LiveTuples: 1000, DeadTuples: 50,
				VacuumCount: 7, AutovacuumCount: 42, StatsReset: &statsReset,
			},
		},
	}
	store := &fakeVacuumSampleStore{}

	job := NewVacuumProbe(probeConfig(VacuumProbeName), &fakeSessionOpener{session: session}, store, NewDatabaseTargetSource(singleInstanceSource(), &mockCatalogDatabaseLister{}))

	result, err := job.Run(context.Background(), "instances/test/databases/appdb")
	require.NoError(t, err)
	runCommit(t, result)

	require.Len(t, store.samples, 1)
	sample := store.samples[0]
	assert.Equal(t, "test", sample.InstanceID)
	assert.Equal(t, "appdb", sample.DatabaseName)
	assert.Equal(t, int64(1000), sample.LiveTuples)
	assert.Equal(t, int64(50), sample.DeadTuples)
	assert.Equal(t, int64(7), sample.VacuumCount)
	assert.Equal(t, int64(42), sample.AutovacuumCount)
	require.NotNil(t, sample.StatsReset)
	assert.Equal(t, statsReset, *sample.StatsReset)
}
