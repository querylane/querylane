package engine

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

var testInstanceSecretKeyEnvMu sync.Mutex

type testHealthDriver struct{}

func (d *testHealthDriver) GetServerInfo(_ context.Context, _ *sql.DB) (*ServerInfo, error) {
	return &ServerInfo{}, nil
}

func (d *testHealthDriver) GetInstanceOverview(_ context.Context, _ *sql.DB) (*InstanceOverview, error) {
	return &InstanceOverview{}, nil
}

func (d *testHealthDriver) CheckInstanceHealth(_ context.Context, _ *sql.DB) (*InstanceHealth, error) {
	return &InstanceHealth{}, nil
}

func (d *testHealthDriver) CheckInstanceActivity(_ context.Context, _ *sql.DB) (*InstanceHealth, error) {
	return &InstanceHealth{}, nil
}

func (d *testHealthDriver) TestConnection(ctx context.Context, db *sql.DB) error {
	var result int
	return db.QueryRowContext(ctx, "SELECT 1").Scan(&result)
}

type countingHealthDriver struct {
	testHealthDriver

	mu                  sync.Mutex
	testConnectionCalls int
	blockCall           int
	blockStarted        chan struct{}
	blockRelease        chan struct{}
}

func (d *countingHealthDriver) TestConnection(ctx context.Context, db *sql.DB) error {
	d.mu.Lock()
	d.testConnectionCalls++
	call := d.testConnectionCalls
	blockCall := d.blockCall
	blockStarted := d.blockStarted
	blockRelease := d.blockRelease
	d.mu.Unlock()

	if blockCall > 0 && call == blockCall {
		if blockStarted != nil {
			select {
			case <-blockStarted:
			default:
				close(blockStarted)
			}
		}

		if blockRelease != nil {
			select {
			case <-blockRelease:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return d.testHealthDriver.TestConnection(ctx, db)
}

func (d *countingHealthDriver) calls() int {
	d.mu.Lock()
	defer d.mu.Unlock()

	return d.testConnectionCalls
}

func newHealthOnlyManager(health healthDriver) *Manager {
	return newManagerWithDrivers(DefaultPoolConfig(), managerDrivers{healthDriver: health})
}

func newHealthOnlyResolver(repo storage.InstanceRepository, health healthDriver) *SessionResolver {
	return NewSessionResolver(repo, newHealthOnlyManager(health))
}

type testInstanceRepo struct {
	instance *api.Instance
	err      error
}

func (r *testInstanceRepo) CreateInstance(context.Context, *api.Instance, string) (*api.Instance, error) {
	return nil, errors.New("unexpected CreateInstance call in manager test")
}

func (r *testInstanceRepo) ListInstances(context.Context, int32, string, string, string) ([]*api.Instance, string, error) {
	return nil, "", errors.New("unexpected ListInstances call in manager test")
}

func (r *testInstanceRepo) GetInstance(_ context.Context, name string) (*api.Instance, error) {
	if r.err != nil {
		return nil, r.err
	}

	if r.instance == nil || r.instance.GetName() != name {
		return nil, storage.ErrNotFound
	}

	return r.instance, nil
}

func (r *testInstanceRepo) DeleteInstance(context.Context, string) error {
	return errors.New("unexpected DeleteInstance call in manager test")
}

func (r *testInstanceRepo) UpdateInstance(context.Context, *api.Instance, *fieldmaskpb.FieldMask) (*api.Instance, error) {
	return nil, errors.New("unexpected UpdateInstance call in manager test")
}

func (r *testInstanceRepo) UpdateInstanceWithValidation(context.Context, *api.Instance, *fieldmaskpb.FieldMask, storage.InstanceUpdateValidator) (*api.Instance, error) {
	return nil, errors.New("unexpected UpdateInstanceWithValidation call in manager test")
}

func TestManager_TestConnection(t *testing.T) {
	t.Parallel()

	eng := &testHealthDriver{}
	mgr := newHealthOnlyManager(eng)

	t.Run("nil instance", func(t *testing.T) {
		t.Parallel()

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		err := mgr.TestConnection(ctx, nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "instance cannot be nil")
	})

	t.Run("empty config", func(t *testing.T) {
		t.Parallel()

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		err := mgr.TestConnection(ctx, &api.Instance{
			Name:   "instances/invalid",
			Config: &api.PostgresConfig{},
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid connection config")
	})
}

func TestIntegrationManager_TestConnection_WithEmbeddedPostgres(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)
	eng := &testHealthDriver{}
	mgr := newHealthOnlyManager(eng)

	instance := &api.Instance{
		Name: "instances/embedded-postgres",
		Config: &api.PostgresConfig{
			Host:     "localhost",
			Port:     int32(testDB.Port()),
			Database: "postgres",
			Username: "postgres",
			Password: "postgres",
			SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := mgr.TestConnection(ctx, instance)
	assert.NoError(t, err)
}

func TestManager_Close(t *testing.T) {
	t.Parallel()

	eng := &testHealthDriver{}
	mgr := newHealthOnlyManager(eng)

	// Close with no pools should succeed
	err := mgr.Close()
	require.NoError(t, err)
}

func TestManager_EvictInstance_NoPool(t *testing.T) {
	t.Parallel()

	eng := &testHealthDriver{}
	mgr := newHealthOnlyManager(eng)

	// Evicting a non-existent pool should not panic
	mgr.EvictInstance(mustParseInstanceName(t, "instances/nonexistent"))
}

func TestIntegrationManager_OpenDatabase_ReusesDatabasePool(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceName := mustParseInstanceName(t, "instances/reuse-db-pool")
	instance := testInstance(t, testDB, instanceName)
	eng := &countingHealthDriver{}
	mgr := newHealthOnlyResolver(&testInstanceRepo{instance: instance}, eng)

	instSession, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	t.Cleanup(func() { _ = instSession.Close() })

	assert.Equal(t, 1, eng.calls(), "instance pool should be validated once")

	firstSession, err := instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)
	secondSession, err := instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)

	firstDBSession, ok := firstSession.(*databaseSession)
	require.True(t, ok)
	secondDBSession, ok := secondSession.(*databaseSession)
	require.True(t, ok)

	assert.Same(t, firstDBSession.db, secondDBSession.db)
	assert.Equal(t, 2, eng.calls(), "database pool should be validated only on first creation")
	require.NoError(t, firstSession.Close())
	require.NoError(t, secondSession.Close())
	require.NoError(t, firstDBSession.db.PingContext(ctx))
}

func TestIntegrationManager_OpenDatabase_ConcurrentReuse(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceName := mustParseInstanceName(t, "instances/concurrent-db-pool")
	instance := testInstance(t, testDB, instanceName)
	eng := &countingHealthDriver{
		blockCall:    2,
		blockStarted: make(chan struct{}),
		blockRelease: make(chan struct{}),
	}
	mgr := newHealthOnlyResolver(&testInstanceRepo{instance: instance}, eng)

	instSession, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	t.Cleanup(func() { _ = instSession.Close() })

	const goroutines = 4

	results := make(chan *databaseSession, goroutines)
	errs := make(chan error, goroutines)

	for range goroutines {
		go func() {
			session, openErr := instSession.OpenDatabase(ctx, "postgres")
			if openErr != nil {
				errs <- openErr
				return
			}

			dbSession, ok := session.(*databaseSession)
			if !ok {
				errs <- assert.AnError
				return
			}

			results <- dbSession
		}()
	}

	<-eng.blockStarted
	close(eng.blockRelease)

	var first *databaseSession

	for range goroutines {
		select {
		case err := <-errs:
			require.NoError(t, err)
		case session := <-results:
			if first == nil {
				first = session
				continue
			}

			assert.Same(t, first.db, session.db)
		}
	}

	require.NotNil(t, first)
	assert.Equal(t, 2, eng.calls(), "concurrent opens should still create one database pool")
}

func TestIntegrationManager_OpenDatabase_DifferentDatabasesUseDifferentPools(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := testDB.DB().ExecContext(ctx, `CREATE DATABASE analytics`)
	require.NoError(t, err)

	instanceName := mustParseInstanceName(t, "instances/multi-db-pool")
	instance := testInstance(t, testDB, instanceName)
	eng := &countingHealthDriver{}
	mgr := newHealthOnlyResolver(&testInstanceRepo{instance: instance}, eng)

	instSession, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	t.Cleanup(func() { _ = instSession.Close() })

	postgresSession, err := instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)
	analyticsSession, err := instSession.OpenDatabase(ctx, "analytics")
	require.NoError(t, err)

	postgresDBSession, ok := postgresSession.(*databaseSession)
	require.True(t, ok)
	analyticsDBSession, ok := analyticsSession.(*databaseSession)
	require.True(t, ok)

	assert.NotSame(t, postgresDBSession.db, analyticsDBSession.db)
	assert.Equal(t, 3, eng.calls(), "instance pool plus one validation per database pool")
}

func TestIntegrationManager_EvictInstance_ClosesDatabasePools(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceName := mustParseInstanceName(t, "instances/evict-db-pool")
	instance := testInstance(t, testDB, instanceName)
	eng := &countingHealthDriver{}
	mgr := newHealthOnlyResolver(&testInstanceRepo{instance: instance}, eng)

	instSession, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	dbSession, err := instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)

	dbSess, ok := dbSession.(*databaseSession)
	require.True(t, ok)

	db := dbSess.db

	mgr.EvictInstance(instanceName)

	require.Error(t, db.PingContext(ctx))

	instSession, err = mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	dbSession, err = instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)

	dbSess2, ok := dbSession.(*databaseSession)
	require.True(t, ok)
	assert.NotSame(t, db, dbSess2.db)
	assert.Equal(t, 4, eng.calls(), "eviction should force instance and database pool recreation")
}

func TestIntegrationManager_StalePoolOpenFailureKeepsLastKnownGoodPool(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceName := mustParseInstanceName(t, "instances/keep-good-pool")
	instance := testInstance(t, testDB, instanceName)
	repo := &testInstanceRepo{instance: instance}
	eng := &countingHealthDriver{}
	resolver := newHealthOnlyResolver(repo, eng)

	session, err := resolver.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	require.NoError(t, session.Close())

	badInstance, ok := proto.Clone(instance).(*api.Instance)
	require.True(t, ok)

	badInstance.Config.Port = 1
	repo.instance = badInstance

	_, err = resolver.OpenInstance(ctx, instanceName)
	require.Error(t, err)

	cached, err := resolver.manager.pingCachedPool(ctx, instanceName)
	require.True(t, cached, "failed replacement must not evict the working pool")
	require.NoError(t, err, "last-known-good pool should remain usable")
}

func TestSessionResolverRejectsUnavailableInstanceCredentials(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		state api.Instance_CredentialState
	}{
		{name: "unreadable", state: api.Instance_CREDENTIAL_STATE_UNREADABLE},
		{name: "key missing", state: api.Instance_CREDENTIAL_STATE_KEY_MISSING},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			instanceName := mustParseInstanceName(t, "instances/unavailable")
			repo := &testInstanceRepo{instance: &api.Instance{
				Name:            instanceName.String(),
				CredentialState: tc.state,
			}}
			resolver := newHealthOnlyResolver(repo, &countingHealthDriver{})

			_, err := resolver.OpenInstance(t.Context(), instanceName)

			require.ErrorIs(t, err, storage.ErrUnreadableInstanceCredentials)
		})
	}
}

func TestIntegrationManager_Close_ClosesDatabasePools(t *testing.T) {
	t.Parallel()

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceName := mustParseInstanceName(t, "instances/close-db-pool")
	instance := testInstance(t, testDB, instanceName)
	eng := &countingHealthDriver{}
	mgr := newHealthOnlyResolver(&testInstanceRepo{instance: instance}, eng)

	instSession, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	dbSession, err := instSession.OpenDatabase(ctx, "postgres")
	require.NoError(t, err)

	dbSess, ok := dbSession.(*databaseSession)
	require.True(t, ok)

	db := dbSess.db

	require.NoError(t, mgr.Close())
	require.Error(t, db.PingContext(ctx))
}

func TestIntegrationManager_CheckInstanceConnection_PingsCachedPool(t *testing.T) {
	t.Parallel()

	setTestInstanceSecretKeyEnv(t)

	testDB := storage.NewTestDB(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	repo, err := storage.NewInstanceRepository(testDB.DB())
	require.NoError(t, err)

	instanceName := mustParseInstanceName(t, "instances/refresh-one")
	_, err = repo.CreateInstance(ctx, testInstance(t, testDB, instanceName), instanceName.InstanceID)
	require.NoError(t, err)

	eng := &countingHealthDriver{}
	mgr := newHealthOnlyResolver(repo, eng)

	session, err := mgr.OpenInstance(ctx, instanceName)
	require.NoError(t, err)
	require.NoError(t, session.Close())
	assert.Equal(t, 1, eng.calls(), "initial open should validate once")

	// A reachable pool is validated in place through the health seam. This keeps
	// cached-pool liveness consistent with open-pool validation without tearing
	// down in-flight sessions.
	require.NoError(t, mgr.CheckInstanceConnection(ctx, instanceName))
	assert.Equal(t, 2, eng.calls(), "ping should reuse the cached pool through the health seam")
}

// mustParseInstanceName is a test helper that panics on parse failure.
func mustParseInstanceName(t *testing.T, name string) resource.InstanceName {
	t.Helper()

	parsed, err := resource.ParseInstanceName(name)
	require.NoError(t, err)

	return parsed
}

func testInstance(t *testing.T, testDB *storage.TestDB, name resource.InstanceName) *api.Instance {
	t.Helper()

	return &api.Instance{
		Name: name.String(),
		Config: &api.PostgresConfig{
			Host:     "localhost",
			Port:     int32(testDB.Port()),
			Database: "postgres",
			Username: "postgres",
			Password: "postgres",
			SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
		},
	}
}

func setTestInstanceSecretKeyEnv(t *testing.T) {
	t.Helper()

	testInstanceSecretKeyEnvMu.Lock()
	t.Cleanup(testInstanceSecretKeyEnvMu.Unlock)

	const key = "QUERYLANE_INSTANCE_SECRET_KEY"

	previous, hadPrevious := os.LookupEnv(key)
	require.NoError(t, os.Setenv(key, "0123456789abcdef0123456789abcdef")) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
	t.Cleanup(func() {
		if hadPrevious {
			require.NoError(t, os.Setenv(key, previous)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
			return
		}

		require.NoError(t, os.Unsetenv(key))
	})
}
