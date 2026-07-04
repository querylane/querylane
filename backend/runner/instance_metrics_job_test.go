package runner

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

type fakeInstanceSession struct {
	overview    *engine.InstanceOverview
	overviewErr error
	closeCalled bool
}

func (s *fakeInstanceSession) GetServerInfo(_ context.Context) (*engine.ServerInfo, error) {
	return nil, errors.New("not used in tests")
}

func (s *fakeInstanceSession) GetInstanceOverview(_ context.Context) (*engine.InstanceOverview, error) {
	return s.overview, s.overviewErr
}

func (s *fakeInstanceSession) CheckInstanceHealth(_ context.Context) (*engine.InstanceHealth, error) {
	return &engine.InstanceHealth{}, nil
}

func (s *fakeInstanceSession) ListDatabases(_ context.Context, _ aip.Params) ([]engine.Database, string, error) {
	return nil, "", nil
}

func (s *fakeInstanceSession) ListRoles(_ context.Context, _ aip.Params) ([]engine.Role, string, error) {
	return nil, "", nil
}

func (s *fakeInstanceSession) GetRole(_ context.Context, _ string) (*engine.Role, error) {
	return nil, nil //nolint:nilnil // unused in metrics tests
}

func (s *fakeInstanceSession) GetDatabase(_ context.Context, _ string) (*engine.Database, error) {
	return nil, nil //nolint:nilnil // unused in metrics tests
}

func (s *fakeInstanceSession) OpenDatabase(_ context.Context, _ string) (engine.DatabaseSession, error) {
	return nil, errors.New("not used in tests")
}

func (s *fakeInstanceSession) Close() error {
	s.closeCalled = true
	return nil
}

type fakeMetricsSessionOpener struct {
	session *fakeInstanceSession
	openErr error
}

func (o *fakeMetricsSessionOpener) OpenInstance(_ context.Context, _ resource.InstanceName) (engine.InstanceSession, error) {
	if o.openErr != nil {
		return nil, o.openErr
	}

	return o.session, nil
}

type fakeConnectionSampleStore struct {
	mu      sync.Mutex
	samples []storage.InstanceConnectionSample
	err     error
}

func (s *fakeConnectionSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample storage.InstanceConnectionSample) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.err != nil {
		return s.err
	}

	s.samples = append(s.samples, sample)

	return nil
}

type fakeStorageSampleStore struct {
	mu      sync.Mutex
	samples []storage.InstanceStorageSample
	err     error
}

func (s *fakeStorageSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample storage.InstanceStorageSample) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.err != nil {
		return s.err
	}

	s.samples = append(s.samples, sample)

	return nil
}

type fakeCacheSampleStore struct {
	mu      sync.Mutex
	samples []storage.InstanceCacheSample
	err     error
}

func (s *fakeCacheSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample storage.InstanceCacheSample) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.err != nil {
		return s.err
	}

	s.samples = append(s.samples, sample)

	return nil
}

func newTestMetricsJob(
	opener InstanceSessionOpener,
	conn *fakeConnectionSampleStore,
	storageStore *fakeStorageSampleStore,
	cache *fakeCacheSampleStore,
) *InstanceMetricsJob {
	reader := &mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/test"}},
	}}

	cfg := Config{
		Name:          "test_metrics",
		Interval:      30 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   1,
	}

	return NewInstanceMetricsJob(cfg, opener, conn, storageStore, cache, NewInstanceTargetSource(reader))
}

func TestInstanceMetricsJob_Run_AllSubsystems(t *testing.T) {
	t.Parallel()

	overview := &engine.InstanceOverview{
		Connections: &engine.ConnectionMetrics{Active: 5, Idle: 10, Total: 15, Max: 100},
		Storage:     &engine.StorageMetrics{TotalSizeBytes: 1024 * 1024},
		Cache:       &engine.CacheMetrics{BlocksHit: 1000, BlocksRead: 50},
	}

	opener := &fakeMetricsSessionOpener{session: &fakeInstanceSession{overview: overview}}
	conn := &fakeConnectionSampleStore{}
	storageStore := &fakeStorageSampleStore{}
	cache := &fakeCacheSampleStore{}

	job := newTestMetricsJob(opener, conn, storageStore, cache)

	result, err := job.Run(context.Background(), "instances/healthy")
	require.NoError(t, err)
	require.NotNil(t, result.Commit)

	require.NoError(t, result.Commit(context.Background(), noopQueryExecutor{}))

	require.Len(t, conn.samples, 1)
	assert.Equal(t, "healthy", conn.samples[0].InstanceID)
	assert.Equal(t, int64(5), conn.samples[0].Active)

	require.Len(t, storageStore.samples, 1)
	assert.Equal(t, int64(1024*1024), storageStore.samples[0].TotalSizeBytes)

	require.Len(t, cache.samples, 1)
	assert.Equal(t, int64(1000), cache.samples[0].BlocksHit)
	assert.Equal(t, int64(50), cache.samples[0].BlocksRead)
}

func TestInstanceMetricsJob_Run_PartialSubsystems(t *testing.T) {
	t.Parallel()

	// Only connections succeeded; storage and cache returned nil pointers.
	overview := &engine.InstanceOverview{
		Connections: &engine.ConnectionMetrics{Active: 1, Idle: 2, Total: 3, Max: 100},
	}

	opener := &fakeMetricsSessionOpener{session: &fakeInstanceSession{overview: overview}}
	conn := &fakeConnectionSampleStore{}
	storageStore := &fakeStorageSampleStore{}
	cache := &fakeCacheSampleStore{}

	job := newTestMetricsJob(opener, conn, storageStore, cache)

	result, err := job.Run(context.Background(), "instances/partial")
	require.NoError(t, err)
	require.NotNil(t, result.Commit)

	require.NoError(t, result.Commit(context.Background(), noopQueryExecutor{}))

	assert.Len(t, conn.samples, 1)
	assert.Empty(t, storageStore.samples)
	assert.Empty(t, cache.samples)
}

func TestInstanceMetricsJob_Run_AllSubsystemsFailed(t *testing.T) {
	t.Parallel()

	// Empty overview — every subsystem returned nil. No commit should be produced.
	opener := &fakeMetricsSessionOpener{session: &fakeInstanceSession{overview: &engine.InstanceOverview{}}}

	job := newTestMetricsJob(opener, &fakeConnectionSampleStore{}, &fakeStorageSampleStore{}, &fakeCacheSampleStore{})

	result, err := job.Run(context.Background(), "instances/empty")
	require.NoError(t, err)
	assert.Nil(t, result.Commit)
}

func TestInstanceMetricsJob_Run_SessionOpenFailureExitsCleanly(t *testing.T) {
	t.Parallel()

	opener := &fakeMetricsSessionOpener{openErr: errors.New("connection refused")}

	job := newTestMetricsJob(opener, &fakeConnectionSampleStore{}, &fakeStorageSampleStore{}, &fakeCacheSampleStore{})

	result, err := job.Run(context.Background(), "instances/dead")
	require.NoError(t, err, "session-open failure must not propagate as a runner error")
	assert.Nil(t, result.Commit, "no commit when session could not be opened")
}

func TestInstanceMetricsJob_Run_OverviewQueryHardFailureExitsCleanly(t *testing.T) {
	t.Parallel()

	opener := &fakeMetricsSessionOpener{session: &fakeInstanceSession{overviewErr: errors.New("query timeout")}}

	job := newTestMetricsJob(opener, &fakeConnectionSampleStore{}, &fakeStorageSampleStore{}, &fakeCacheSampleStore{})

	result, err := job.Run(context.Background(), "instances/timeout")
	require.NoError(t, err)
	assert.Nil(t, result.Commit)
}

func TestInstanceMetricsJob_Run_InvalidTargetReturnsError(t *testing.T) {
	t.Parallel()

	opener := &fakeMetricsSessionOpener{session: &fakeInstanceSession{}}

	job := newTestMetricsJob(opener, &fakeConnectionSampleStore{}, &fakeStorageSampleStore{}, &fakeCacheSampleStore{})

	result, err := job.Run(context.Background(), "not-a-valid-resource")
	require.Error(t, err)
	assert.Nil(t, result.Commit)
}
