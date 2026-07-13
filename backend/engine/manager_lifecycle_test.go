package engine

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// nopHealthDriver accepts every connection without touching the database, so
// unit tests can exercise pool lifecycle without a reachable server.
type nopHealthDriver struct {
	testHealthDriver
}

func (d *nopHealthDriver) TestConnection(context.Context, *sql.DB) error { return nil }

// gateHealthDriver blocks TestConnection until released, letting tests freeze
// a pool dial mid-flight. Cancellation always wins over release so red and
// green outcomes are deterministic.
type gateHealthDriver struct {
	testHealthDriver

	started   chan struct{}
	release   chan struct{}
	startOnce sync.Once
	dialErr   error
}

func (d *gateHealthDriver) TestConnection(ctx context.Context, _ *sql.DB) error {
	d.startOnce.Do(func() { close(d.started) })

	select {
	case <-d.release:
	case <-ctx.Done():
		return ctx.Err()
	}

	if err := ctx.Err(); err != nil {
		return err
	}

	return d.dialErr
}

func newGateHealthDriver() *gateHealthDriver {
	return &gateHealthDriver{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
}

// lifecycleTestInstance returns an instance whose pools never dial: the nop
// health driver accepts them and database/sql opens lazily.
func lifecycleTestInstance(name string) *api.Instance {
	return &api.Instance{
		Name: name,
		Config: &api.PostgresConfig{
			Host:     "primary.internal",
			Port:     5432,
			Database: "postgres",
			Username: "postgres",
			Password: "secret",
			SslMode:  api.PostgresConfig_SSL_MODE_DISABLED,
		},
	}
}

func TestManager_GetOrCreatePool_ConfigChange(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		mutate      func(cfg *api.PostgresConfig)
		wantRebuild bool
	}{
		{
			name:        "unchanged config reuses pool",
			mutate:      func(*api.PostgresConfig) {},
			wantRebuild: false,
		},
		{
			name:        "host change rebuilds pool",
			mutate:      func(cfg *api.PostgresConfig) { cfg.Host = "replica.internal" },
			wantRebuild: true,
		},
		{
			name:        "credential change rebuilds pool",
			mutate:      func(cfg *api.PostgresConfig) { cfg.Password = "rotated" },
			wantRebuild: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			mgr := newHealthOnlyManager(&nopHealthDriver{})

			t.Cleanup(func() { _ = mgr.Close() })

			instanceName := mustParseInstanceName(t, "instances/fingerprint")
			instance := lifecycleTestInstance(instanceName.String())

			first, err := mgr.getOrCreatePool(ctx, instanceName, instance)
			require.NoError(t, err)

			updated := lifecycleTestInstance(instanceName.String())
			tt.mutate(updated.GetConfig())

			second, err := mgr.getOrCreatePool(ctx, instanceName, updated)
			require.NoError(t, err)

			if !tt.wantRebuild {
				assert.Same(t, first, second, "unchanged config must reuse the cached pool")
				return
			}

			assert.NotSame(t, first, second, "changed config must rebuild the pool")
			assert.ErrorContains(t, first.db.PingContext(ctx), "database is closed",
				"stale pool must be closed on rebuild")
		})
	}
}

// newLifecycleTestPool dials an instance pool through a manager backed by the
// nop health driver so unit tests can drive instancePool directly.
func newLifecycleTestPool(ctx context.Context, t *testing.T, instanceID string) *instancePool {
	t.Helper()

	mgr := newHealthOnlyManager(&nopHealthDriver{})

	t.Cleanup(func() { _ = mgr.Close() })

	instanceName := mustParseInstanceName(t, "instances/"+instanceID)

	pool, err := mgr.getOrCreatePool(ctx, instanceName, lifecycleTestInstance(instanceName.String()))
	require.NoError(t, err)

	return pool
}

func TestInstancePool_GetOrCreateDBPool_AfterClose(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool := newLifecycleTestPool(ctx, t, "closed-pool")
	require.NoError(t, pool.close())

	db, err := pool.getOrCreateDBPool(ctx, lifecycleTestInstance("instances/closed-pool").GetConfig(), "appdb")
	require.Error(t, err, "opening a database pool on a closed instance pool must fail")
	assert.Nil(t, db)

	pool.mu.Lock()
	leaked := len(pool.dbPools)
	pool.mu.Unlock()
	assert.Zero(t, leaked, "closed instance pool must not retain database pools")
}

func TestInstancePool_GetOrCreateDBPool_CloseDuringDial(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool := newLifecycleTestPool(ctx, t, "close-during-dial")
	gate := newGateHealthDriver()
	pool.driver = gate

	type result struct {
		db  *sql.DB
		err error
	}

	results := make(chan result, 1)

	go func() {
		db, err := pool.getOrCreateDBPool(ctx, lifecycleTestInstance("instances/close-during-dial").GetConfig(), "appdb")
		results <- result{db: db, err: err}
	}()

	<-gate.started
	require.NoError(t, pool.close())
	close(gate.release)

	res := <-results
	if res.db != nil {
		t.Cleanup(func() { _ = res.db.Close() })
	}

	require.Error(t, res.err, "database pool created during eviction must be rejected")
	assert.Nil(t, res.db)

	pool.mu.Lock()
	leaked := len(pool.dbPools)
	pool.mu.Unlock()
	assert.Zero(t, leaked, "evicted instance pool must not retain orphaned database pools")
}

func TestInstancePool_PendingCreationRetainsBudgetAcrossEvictionAndReplacement(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mgr := newHealthOnlyManager(&nopHealthDriver{})

	t.Cleanup(func() { _ = mgr.Close() })

	instanceName := mustParseInstanceName(t, "instances/pending-budget")
	instance := lifecycleTestInstance(instanceName.String())
	pool, err := mgr.getOrCreatePool(ctx, instanceName, instance)
	require.NoError(t, err)

	originalBudget := pool.budget

	gate := newGateHealthDriver()
	pool.driver = gate
	results := make(chan error, 1)

	go func() {
		_, openErr := pool.getOrCreateDBPool(ctx, instance.GetConfig(), "appdb")
		results <- openErr
	}()

	<-gate.started
	mgr.EvictInstance(instanceName)
	require.Equal(t, 1, managerBudgetCount(mgr), "the pending creation must retain the endpoint entry")

	replacement, err := mgr.getOrCreatePool(ctx, instanceName, instance)
	require.NoError(t, err)
	require.Same(t, originalBudget, replacement.budget,
		"a replacement generation must share the pending creator's physical budget")

	close(gate.release)
	require.ErrorIs(t, <-results, errInstancePoolClosed)

	mgr.EvictInstance(instanceName)
	require.Eventually(t, func() bool { return managerBudgetCount(mgr) == 0 }, time.Second, 10*time.Millisecond)
}

func TestInstancePool_GetOrCreateDBPool_CreatorCancellationLeavesDetachedCreationForWaiter(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool := newLifecycleTestPool(ctx, t, "detached-dial")
	gate := newGateHealthDriver()
	pool.driver = gate

	callerCtx, cancelCaller := context.WithCancel(context.Background())
	defer cancelCaller()

	type result struct {
		db  *sql.DB
		err error
	}

	creatorResults := make(chan result, 1)

	go func() {
		db, err := pool.getOrCreateDBPool(callerCtx, lifecycleTestInstance("instances/detached-dial").GetConfig(), "appdb")
		creatorResults <- result{db: db, err: err}
	}()

	<-gate.started
	cancelCaller()

	creatorResult := <-creatorResults
	require.ErrorIs(t, creatorResult.err, context.Canceled,
		"the first caller must not wait for detached pool creation after cancellation")
	assert.Nil(t, creatorResult.db)

	waiterResults := make(chan result, 1)

	go func() {
		db, err := pool.getOrCreateDBPool(ctx, lifecycleTestInstance("instances/detached-dial").GetConfig(), "appdb")
		waiterResults <- result{db: db, err: err}
	}()

	close(gate.release)

	waiterResult := <-waiterResults
	require.NoError(t, waiterResult.err, "detached creation must continue for coalesced waiters")
	require.NotNil(t, waiterResult.db)

	pool.mu.Lock()
	cached := pool.dbPools["appdb"]
	pool.mu.Unlock()
	assert.Same(t, waiterResult.db, cached, "the detached dial must still cache the pool for later callers")
}

func TestInstancePool_GetOrCreateDBPool_WaiterReceivesCreationError(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	errDial := errors.New("password authentication failed")
	pool := newLifecycleTestPool(ctx, t, "waiter-error")

	pending := &pendingDBPool{done: make(chan struct{})}

	pool.mu.Lock()
	pool.pending["appdb"] = pending
	pool.mu.Unlock()

	results := make(chan error, 1)

	go func() {
		_, err := pool.getOrCreateDBPool(ctx, lifecycleTestInstance("instances/waiter-error").GetConfig(), "appdb")
		results <- err
	}()

	// Simulate the coalesced creator failing with a concrete cause.
	pending.err = errDial
	close(pending.done)

	err := <-results
	require.Error(t, err)
	assert.ErrorIs(t, err, errDial, "waiters must receive the creator's real error, not a generic one")
}

func TestManager_GetOrCreatePool_AfterClose(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	mgr := newHealthOnlyManager(&nopHealthDriver{})
	require.NoError(t, mgr.Close())

	instanceName := mustParseInstanceName(t, "instances/closed-manager")

	pool, err := mgr.getOrCreatePool(ctx, instanceName, lifecycleTestInstance(instanceName.String()))
	require.Error(t, err, "a closed manager must not hand out pools")
	assert.Nil(t, pool)

	mgr.mu.Lock()
	leaked := len(mgr.pools)
	mgr.mu.Unlock()
	assert.Zero(t, leaked, "a closed manager must not cache new pools")
}

func TestManager_GetOrCreatePool_CloseDuringDial(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	gate := newGateHealthDriver()
	mgr := newHealthOnlyManager(gate)
	instanceName := mustParseInstanceName(t, "instances/close-during-instance-dial")

	type result struct {
		pool *instancePool
		err  error
	}

	results := make(chan result, 1)

	go func() {
		pool, err := mgr.getOrCreatePool(ctx, instanceName, lifecycleTestInstance(instanceName.String()))
		results <- result{pool: pool, err: err}
	}()

	<-gate.started
	require.NoError(t, mgr.Close())
	close(gate.release)

	res := <-results
	if res.pool != nil {
		t.Cleanup(func() { _ = res.pool.close() })
	}

	require.Error(t, res.err, "a pool finishing its dial after Close must be rejected")
	assert.Nil(t, res.pool)

	mgr.mu.Lock()
	leaked := len(mgr.pools)
	mgr.mu.Unlock()
	assert.Zero(t, leaked, "a closed manager must not retain pools created during shutdown")
}
