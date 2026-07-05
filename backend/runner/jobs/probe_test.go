package jobs

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// fakeInstanceSession embeds the interfaces so only the methods a probe
// exercises need stubbing; calling anything else panics loudly. Like the real
// session, it acts as its own prober.
type fakeInstanceSession struct {
	engine.InstanceSession
	engine.InstanceProber

	versionNum      int32
	versionErr      error
	versionNumCalls int

	connMetrics   *engine.ConnectionMetrics
	cacheCounters *engine.CacheCounters
	databaseSizes []engine.DatabaseSize
	ioCounters    *engine.IOCounters

	dbSession    *fakeDatabaseSession
	dbSessionErr error

	closeCalled bool
}

func (s *fakeInstanceSession) Prober() engine.InstanceProber { return s }

func (s *fakeInstanceSession) GetServerVersionNum(_ context.Context) (int32, error) {
	s.versionNumCalls++
	return s.versionNum, s.versionErr
}

func (s *fakeInstanceSession) GetConnectionMetrics(_ context.Context) (*engine.ConnectionMetrics, error) {
	return s.connMetrics, nil
}

func (s *fakeInstanceSession) GetCacheCounters(_ context.Context) (*engine.CacheCounters, error) {
	return s.cacheCounters, nil
}

func (s *fakeInstanceSession) ListDatabaseSizes(_ context.Context) ([]engine.DatabaseSize, error) {
	return s.databaseSizes, nil
}

func (s *fakeInstanceSession) GetIOCounters(_ context.Context) (*engine.IOCounters, error) {
	return s.ioCounters, nil
}

func (s *fakeInstanceSession) OpenEphemeralDatabase(_ context.Context, _ string) (engine.DatabaseSession, error) {
	if s.dbSessionErr != nil {
		return nil, s.dbSessionErr
	}

	return s.dbSession, nil
}

func (s *fakeInstanceSession) Close() error {
	s.closeCalled = true
	return nil
}

// fakeDatabaseSession embeds the interfaces for the same reason as
// fakeInstanceSession.
type fakeDatabaseSession struct {
	engine.DatabaseSession
	engine.DatabaseProber

	vacuumCounters *engine.VacuumCounters

	closeCalled bool
}

func (s *fakeDatabaseSession) Prober() engine.DatabaseProber { return s }

func (s *fakeDatabaseSession) GetVacuumCounters(_ context.Context) (*engine.VacuumCounters, error) {
	return s.vacuumCounters, nil
}

func (s *fakeDatabaseSession) Close() error {
	s.closeCalled = true
	return nil
}

type fakeSessionOpener struct {
	session *fakeInstanceSession
	openErr error
}

func (o *fakeSessionOpener) OpenInstance(_ context.Context, _ resource.InstanceName) (engine.InstanceSession, error) {
	if o.openErr != nil {
		return nil, o.openErr
	}

	return o.session, nil
}

type sampleRecorder[S any] struct {
	mu      sync.Mutex
	samples []S
	err     error
}

func (r *sampleRecorder[S]) record(sample S) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.err != nil {
		return r.err
	}

	r.samples = append(r.samples, sample)

	return nil
}

type fakeConnectionSampleStore struct {
	sampleRecorder[model.InstanceConnectionSample]
}

func (s *fakeConnectionSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample model.InstanceConnectionSample) error {
	return s.record(sample)
}

type fakeCacheSampleStore struct {
	sampleRecorder[model.InstanceCacheSample]
}

func (s *fakeCacheSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample model.InstanceCacheSample) error {
	return s.record(sample)
}

type fakeStorageSampleStore struct {
	sampleRecorder[model.InstanceStorageSample]
}

func (s *fakeStorageSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample model.InstanceStorageSample) error {
	return s.record(sample)
}

type fakeDatabaseSizeSampleStore struct {
	sampleRecorder[[]model.DatabaseSizeSample]
}

func (s *fakeDatabaseSizeSampleStore) InsertManyTx(_ context.Context, _ storage.QueryExecutor, samples []model.DatabaseSizeSample) error {
	return s.record(samples)
}

type fakeIOSampleStore struct {
	sampleRecorder[model.InstanceIoSample]
}

func (s *fakeIOSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample model.InstanceIoSample) error {
	return s.record(sample)
}

type fakeVacuumSampleStore struct {
	sampleRecorder[model.DatabaseVacuumSample]
}

func (s *fakeVacuumSampleStore) InsertTx(_ context.Context, _ storage.QueryExecutor, sample model.DatabaseVacuumSample) error {
	return s.record(sample)
}

func singleInstanceSource() *InstanceTargetSource {
	return NewInstanceTargetSource(&mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/test"}},
	}})
}

func probeConfig(name string) runner.Config {
	return runner.Config{
		Name:          name,
		Interval:      30 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   1,
	}
}

// runCommit executes the RunResult's commit as the manager would.
func runCommit(t *testing.T, result runner.RunResult) {
	t.Helper()

	require.NotNil(t, result.Commit)
	require.NoError(t, result.Commit(context.Background(), nil))
}

func TestInstanceProbeJob_Run(t *testing.T) {
	t.Parallel()

	collectErr := errors.New("permission denied")

	tests := []struct {
		name        string
		minVersion  int32
		session     *fakeInstanceSession
		openErr     error
		collectErr  error
		wantCommit  bool
		wantCollect bool
	}{
		{
			name:        "collects_and_commits",
			session:     &fakeInstanceSession{},
			wantCommit:  true,
			wantCollect: true,
		},
		{
			name:    "session_open_failure_exits_cleanly",
			openErr: errors.New("connection refused"),
		},
		{
			name:        "collect_failure_exits_cleanly",
			session:     &fakeInstanceSession{},
			collectErr:  collectErr,
			wantCollect: true,
		},
		{
			name:        "version_at_gate_collects",
			minVersion:  160000,
			session:     &fakeInstanceSession{versionNum: 160000},
			wantCommit:  true,
			wantCollect: true,
		},
		{
			name:       "version_below_gate_skips",
			minVersion: 160000,
			session:    &fakeInstanceSession{versionNum: 150004},
		},
		{
			name:       "version_lookup_failure_skips",
			minVersion: 160000,
			session:    &fakeInstanceSession{versionErr: errors.New("query failed")},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			collected := false
			probe := InstanceProbe{
				Config:     probeConfig("probe_test"),
				MinVersion: tt.minVersion,
				Collect: func(_ context.Context, _ engine.InstanceProber, instanceID string, _ time.Time) (runner.Commit, error) {
					collected = true

					assert.Equal(t, "test", instanceID)

					if tt.collectErr != nil {
						return nil, tt.collectErr
					}

					return func(context.Context, storage.QueryExecutor) error { return nil }, nil
				},
			}

			opener := &fakeSessionOpener{session: tt.session, openErr: tt.openErr}
			job := NewInstanceProbeJob(probe, opener, singleInstanceSource())

			result, err := job.Run(context.Background(), "instances/test")
			require.NoError(t, err)
			assert.Equal(t, tt.wantCollect, collected)
			assert.Equal(t, tt.wantCommit, result.Commit != nil)

			if tt.session != nil && tt.openErr == nil {
				assert.True(t, tt.session.closeCalled)
			}
		})
	}
}

func TestInstanceProbeJob_VersionGateCachesLookups(t *testing.T) {
	t.Parallel()

	session := &fakeInstanceSession{versionNum: 170000}
	probe := InstanceProbe{
		Config:     probeConfig("probe_test"),
		MinVersion: 160000,
		Collect: func(context.Context, engine.InstanceProber, string, time.Time) (runner.Commit, error) {
			return func(context.Context, storage.QueryExecutor) error { return nil }, nil
		},
	}

	job := NewInstanceProbeJob(probe, &fakeSessionOpener{session: session}, singleInstanceSource())

	for range 3 {
		result, err := job.Run(context.Background(), "instances/test")
		require.NoError(t, err)
		require.NotNil(t, result.Commit)
	}

	assert.Equal(t, 1, session.versionNumCalls,
		"repeat runs within the cache TTL must not re-query the server version")
}

func TestInstanceProbeJob_VersionLookupErrorIsNotCached(t *testing.T) {
	t.Parallel()

	session := &fakeInstanceSession{versionErr: errors.New("query failed")}
	probe := InstanceProbe{
		Config:     probeConfig("probe_test"),
		MinVersion: 160000,
		Collect: func(context.Context, engine.InstanceProber, string, time.Time) (runner.Commit, error) {
			return func(context.Context, storage.QueryExecutor) error { return nil }, nil
		},
	}

	job := NewInstanceProbeJob(probe, &fakeSessionOpener{session: session}, singleInstanceSource())

	for range 2 {
		result, err := job.Run(context.Background(), "instances/test")
		require.NoError(t, err)
		assert.Nil(t, result.Commit)
	}

	assert.Equal(t, 2, session.versionNumCalls, "failed lookups must be retried, not cached")
}

func TestInstanceProbeJob_StructuralFailureSuppressesTarget(t *testing.T) {
	t.Parallel()

	var collectCalls int

	probe := InstanceProbe{
		Config: probeConfig("probe_test"),
		Collect: func(context.Context, engine.InstanceProber, string, time.Time) (runner.Commit, error) {
			collectCalls++
			// A fork missing the catalog view the probe needs surfaces as
			// ErrQueryInvalid (undefined table/function/column).
			return nil, fmt.Errorf("query cache counters: %w", engine.ErrQueryInvalid)
		},
	}

	job := NewInstanceProbeJob(probe, &fakeSessionOpener{session: &fakeInstanceSession{}}, singleInstanceSource())

	for range 3 {
		result, err := job.Run(context.Background(), "instances/test")
		require.NoError(t, err)
		assert.Nil(t, result.Commit)
	}

	assert.Equal(t, 1, collectCalls,
		"a structural failure must suppress the target so later cycles skip Collect")
}

func TestInstanceProbeJob_TransientFailureIsNotSuppressed(t *testing.T) {
	t.Parallel()

	var collectCalls int

	probe := InstanceProbe{
		Config: probeConfig("probe_test"),
		Collect: func(context.Context, engine.InstanceProber, string, time.Time) (runner.Commit, error) {
			collectCalls++
			// A lock timeout or momentary permission blip is transient and must
			// keep being retried every cycle.
			return nil, fmt.Errorf("query cache counters: %w", engine.ErrQueryTimeout)
		},
	}

	job := NewInstanceProbeJob(probe, &fakeSessionOpener{session: &fakeInstanceSession{}}, singleInstanceSource())

	for range 3 {
		result, err := job.Run(context.Background(), "instances/test")
		require.NoError(t, err)
		assert.Nil(t, result.Commit)
	}

	assert.Equal(t, 3, collectCalls, "transient failures must be retried, not suppressed")
}

func TestInstanceProbeJob_Run_InvalidTargetReturnsError(t *testing.T) {
	t.Parallel()

	probe := InstanceProbe{
		Config: probeConfig("probe_test"),
		Collect: func(context.Context, engine.InstanceProber, string, time.Time) (runner.Commit, error) {
			t.Fatal("collect must not run for invalid targets")
			return nil, errors.New("unreachable")
		},
	}

	job := NewInstanceProbeJob(probe, &fakeSessionOpener{session: &fakeInstanceSession{}}, singleInstanceSource())

	_, err := job.Run(context.Background(), "not-a-resource-name")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse instance target")
}

func TestDatabaseProbeJob_Run(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		session     *fakeInstanceSession
		openErr     error
		wantCommit  bool
		wantCollect bool
	}{
		{
			name:        "collects_and_commits",
			session:     &fakeInstanceSession{dbSession: &fakeDatabaseSession{}},
			wantCommit:  true,
			wantCollect: true,
		},
		{
			name:    "instance_session_open_failure_exits_cleanly",
			openErr: errors.New("connection refused"),
		},
		{
			name:    "database_open_failure_exits_cleanly",
			session: &fakeInstanceSession{dbSessionErr: errors.New("database was dropped")},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			collected := false
			probe := DatabaseProbe{
				Config: probeConfig("probe_test"),
				Collect: func(_ context.Context, _ engine.DatabaseProber, dbName resource.DatabaseName, _ time.Time) (runner.Commit, error) {
					collected = true

					assert.Equal(t, "test", dbName.InstanceID)
					assert.Equal(t, "appdb", dbName.DatabaseID)

					return func(context.Context, storage.QueryExecutor) error { return nil }, nil
				},
			}

			opener := &fakeSessionOpener{session: tt.session, openErr: tt.openErr}
			job := NewDatabaseProbeJob(probe, opener, NewDatabaseTargetSource(singleInstanceSource(), &mockCatalogDatabaseLister{}))

			result, err := job.Run(context.Background(), "instances/test/databases/appdb")
			require.NoError(t, err)
			assert.Equal(t, tt.wantCollect, collected)
			assert.Equal(t, tt.wantCommit, result.Commit != nil)

			if tt.session != nil && tt.session.dbSession != nil {
				assert.True(t, tt.session.dbSession.closeCalled)
			}
		})
	}
}

func TestDatabaseProbeJob_Run_InvalidTargetReturnsError(t *testing.T) {
	t.Parallel()

	probe := DatabaseProbe{
		Config: probeConfig("probe_test"),
		Collect: func(context.Context, engine.DatabaseProber, resource.DatabaseName, time.Time) (runner.Commit, error) {
			t.Fatal("collect must not run for invalid targets")
			return nil, errors.New("unreachable")
		},
	}

	job := NewDatabaseProbeJob(probe, &fakeSessionOpener{session: &fakeInstanceSession{}}, NewDatabaseTargetSource(singleInstanceSource(), &mockCatalogDatabaseLister{}))

	_, err := job.Run(context.Background(), "instances/test")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse database target")
}
