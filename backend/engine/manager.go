package engine

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

const (
	connectionTestTimeout = 10 * time.Second
)

var (
	// errInstancePoolClosed is returned when a database pool is requested from
	// an instance pool that was evicted or shut down.
	errInstancePoolClosed = errors.New("instance connection pool is closed")

	// errManagerClosed is returned when a pool is requested from a manager
	// that was shut down.
	errManagerClosed = errors.New("engine manager is closed")
)

// pendingDBPool coalesces concurrent creations of the same database pool.
// The creator stores the outcome before closing done, so waiters observe the
// real result instead of inferring failure from an absent cache entry.
type pendingDBPool struct {
	done chan struct{}
	db   *sql.DB
	err  error
}

// instancePool holds the instance-level connection pool and all database-level
// pools opened through it.
type instancePool struct {
	mu      sync.Mutex
	db      *sql.DB
	dbPools map[string]*sql.DB
	pending map[string]*pendingDBPool
	config  PoolConfig
	driver  healthDriver
	secrets SecretResolver

	// closed marks the pool as terminally shut down. It guards against a
	// concurrent getOrCreateDBPool finishing its dial after eviction and
	// inserting a database pool nobody will ever close.
	closed bool

	// fingerprint digests the resolved instance DSN the pool was opened with.
	// A cached pool whose fingerprint no longer matches the freshly-resolved
	// config is stale (host or credentials changed) and must be rebuilt.
	fingerprint [sha256.Size]byte
}

// close closes the instance pool and all database pools. The pool is
// terminally closed: subsequent getOrCreateDBPool calls fail instead of
// repopulating the orphaned pool.
func (p *instancePool) close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.closed = true

	var errs []error

	for name, db := range p.dbPools {
		if err := db.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close database pool %s: %w", name, err))
		}

		delete(p.dbPools, name)
	}

	if err := p.db.Close(); err != nil {
		errs = append(errs, fmt.Errorf("close instance pool: %w", err))
	}

	return errors.Join(errs...)
}

// getOrCreateDBPool returns an existing database pool or creates a new one.
// Concurrent calls for the same database name will block until the first
// caller finishes creating the pool.
func (p *instancePool) getOrCreateDBPool(ctx context.Context, cfg *api.PostgresConfig, databaseName string) (*sql.DB, error) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil, errInstancePoolClosed
	}

	if db, ok := p.dbPools[databaseName]; ok {
		p.mu.Unlock()
		return db, nil
	}

	// Another goroutine is already creating this pool; wait for it.
	if pending, ok := p.pending[databaseName]; ok {
		p.mu.Unlock()

		select {
		case <-pending.done:
		case <-ctx.Done():
			return nil, ctx.Err()
		}

		if pending.err != nil {
			return nil, pending.err
		}

		return pending.db, nil
	}

	// Mark this database as being created.
	pending := &pendingDBPool{done: make(chan struct{})}
	p.pending[databaseName] = pending
	p.mu.Unlock()

	// Coalesced waiters depend on this dial, so it must not die with the
	// first caller's request context. Detach cancellation and bound the dial
	// with the package connection-test timeout instead.
	dialCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), connectionTestTimeout)
	defer cancel()

	db, err := p.openDatabasePool(dialCtx, cfg, databaseName)

	p.mu.Lock()
	delete(p.pending, databaseName)

	// The pool may have been evicted while we were dialing. Caching the new
	// database pool would orphan it, so reject the late creation instead.
	if err == nil && p.closed {
		_ = db.Close()
		db = nil
		err = errInstancePoolClosed
	}

	if err == nil {
		p.dbPools[databaseName] = db
	}
	p.mu.Unlock()

	pending.db = db
	pending.err = err
	close(pending.done)

	if err != nil {
		return nil, err
	}

	return db, nil
}

// openEphemeralDatabasePool dials a single-connection pool that is NOT cached
// in dbPools; the caller owns it and must Close it. Background probes use
// this so sampling hundreds of databases never materializes hundreds of
// standing pools (and idle server connections) the way the cached
// getOrCreateDBPool path would.
func (p *instancePool) openEphemeralDatabasePool(ctx context.Context, cfg *api.PostgresConfig, databaseName string) (*sql.DB, error) {
	clonedCfg := clonePostgresConfig(cfg)
	if clonedCfg == nil {
		return nil, errors.New("missing postgres config")
	}

	clonedCfg.Database = databaseName

	dsn, err := ConfigToDSNWithSecretResolver(ctx, clonedCfg, p.secrets)
	if err != nil {
		return nil, fmt.Errorf("resolve engine connection config: %w", err)
	}

	if dsn == "" {
		return nil, errors.New("invalid engine connection config")
	}

	db, err := OpenPostgresDB(dsn)
	if err != nil {
		return nil, fmt.Errorf("open engine connection: %w", err)
	}

	// One lazily-dialed connection, released as soon as it goes idle. No
	// TestConnection round-trip: the caller's first query surfaces the same
	// failure with one fewer round-trip.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(0)

	return db, nil
}

func (p *instancePool) openDatabasePool(ctx context.Context, cfg *api.PostgresConfig, databaseName string) (*sql.DB, error) {
	clonedCfg := clonePostgresConfig(cfg)
	if clonedCfg == nil {
		return nil, errors.New("missing postgres config")
	}

	clonedCfg.Database = databaseName

	dsn, err := ConfigToDSNWithSecretResolver(ctx, clonedCfg, p.secrets)
	if err != nil {
		return nil, fmt.Errorf("resolve engine connection config: %w", err)
	}

	if dsn == "" {
		return nil, errors.New("invalid engine connection config")
	}

	db, err := OpenPostgresDB(dsn)
	if err != nil {
		return nil, fmt.Errorf("open engine connection: %w", err)
	}

	p.configurePool(db)

	testCtx, cancel := context.WithTimeout(ctx, connectionTestTimeout)
	defer cancel()

	if err := p.driver.TestConnection(testCtx, db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("test engine connection: %w", err)
	}

	return db, nil
}

func (p *instancePool) configurePool(db *sql.DB) {
	p.config.apply(db)
}

// Manager provides connection pooling and lifecycle management for external database instances.
// It maintains a cache of instance-level pools and opens database-scoped sessions on demand.
type Manager struct {
	mu sync.Mutex
	// closed marks the manager as terminally shut down: pool creations that
	// finish after Close are closed instead of cached.
	closed                bool
	pools                 map[resource.InstanceName]*instancePool
	healthDriver          healthDriver
	probeDriver           probeDriver
	instanceCatalogDriver instanceCatalogDriver
	databaseCatalogDriver databaseCatalogDriver
	tablePartitionDriver  tablePartitionDriver
	tableDataDriver       tableDataDriver
	queryDriver           queryDriver
	config                PoolConfig
	secrets               SecretResolver
}

type managerDrivers struct {
	healthDriver          healthDriver
	probeDriver           probeDriver
	instanceCatalogDriver instanceCatalogDriver
	databaseCatalogDriver databaseCatalogDriver
	tablePartitionDriver  tablePartitionDriver
	tableDataDriver       tableDataDriver
	queryDriver           queryDriver
}

// NewManager creates a new connection manager with the provided configuration.
func NewManager(config PoolConfig, driver adminDriver) *Manager {
	return newManagerWithDrivers(config, managerDrivers{
		healthDriver:          driver,
		probeDriver:           driver,
		instanceCatalogDriver: driver,
		databaseCatalogDriver: driver,
		tablePartitionDriver:  driver,
		tableDataDriver:       driver,
		queryDriver:           driver,
	})
}

func newManagerWithDrivers(config PoolConfig, drivers managerDrivers) *Manager {
	return &Manager{
		pools:                 make(map[resource.InstanceName]*instancePool),
		healthDriver:          drivers.healthDriver,
		probeDriver:           drivers.probeDriver,
		instanceCatalogDriver: drivers.instanceCatalogDriver,
		databaseCatalogDriver: drivers.databaseCatalogDriver,
		tablePartitionDriver:  drivers.tablePartitionDriver,
		tableDataDriver:       drivers.tableDataDriver,
		queryDriver:           drivers.queryDriver,
		config:                config,
		secrets:               LocalSecretResolver{},
	}
}

// OpenInstance opens a session against already-resolved instance metadata.
func (m *Manager) OpenInstance(ctx context.Context, instanceName resource.InstanceName, instance *api.Instance) (InstanceSession, error) {
	pool, err := m.getOrCreatePool(ctx, instanceName, instance)
	if err != nil {
		return nil, err
	}

	return &instanceSession{
		cfg:                   clonePostgresConfig(instance.GetConfig()),
		db:                    pool.db,
		pool:                  pool,
		healthDriver:          m.healthDriver,
		probeDriver:           m.probeDriver,
		instanceCatalogDriver: m.instanceCatalogDriver,
		databaseCatalogDriver: m.databaseCatalogDriver,
		tablePartitionDriver:  m.tablePartitionDriver,
		tableDataDriver:       m.tableDataDriver,
		queryDriver:           m.queryDriver,
	}, nil
}

// TestConnection tests the connection to a database instance without creating
// a persistent pool. Used during instance creation (dry run) to validate config.
func (m *Manager) TestConnection(ctx context.Context, instance *api.Instance) error {
	if instance == nil {
		return errors.New("instance cannot be nil")
	}

	dsn, err := m.resolveInstanceDSN(ctx, instance)
	if err != nil {
		return err
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("failed to open connection: %w", err)
	}
	defer db.Close()

	testCtx, cancel := context.WithTimeout(ctx, connectionTestTimeout)
	defer cancel()

	return m.healthDriver.TestConnection(testCtx, db)
}

// EvictInstance removes and closes the cached instance pool for the specified instance.
func (m *Manager) EvictInstance(instanceName resource.InstanceName) {
	m.mu.Lock()

	pool, ok := m.pools[instanceName]
	if ok {
		delete(m.pools, instanceName)
	}
	m.mu.Unlock()

	if ok {
		if err := pool.close(); err != nil {
			slog.Error("failed to close evicted pools",
				slog.String("instance", instanceName.String()),
				slog.Any("error", err))
		}

		slog.Info("evicted connection pools", slog.String("instance", instanceName.String()))
	}
}

// Close shuts down the connection manager and closes all pools. The manager
// is terminally closed: subsequent pool requests fail with errManagerClosed.
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.closed = true

	var errs []error

	for name, pool := range m.pools {
		if err := pool.close(); err != nil {
			errs = append(errs, fmt.Errorf("close pool %s: %w", name.String(), err))
		}

		delete(m.pools, name)
	}

	return errors.Join(errs...)
}

func (m *Manager) pingCachedPool(ctx context.Context, instanceName resource.InstanceName) (bool, error) {
	pingCtx, cancel := context.WithTimeout(ctx, connectionTestTimeout)
	defer cancel()

	m.mu.Lock()
	pool, cached := m.pools[instanceName]
	m.mu.Unlock()

	if !cached {
		return false, nil
	}

	if err := m.healthDriver.TestConnection(pingCtx, pool.db); err != nil {
		return true, err
	}

	return true, nil
}

func (m *Manager) getOrCreatePool(ctx context.Context, instanceName resource.InstanceName, instance *api.Instance) (*instancePool, error) {
	dsn, err := m.resolveInstanceDSN(ctx, instance)
	if err != nil {
		return nil, err
	}

	fingerprint := dsnFingerprint(dsn)

	pool, ok, err := m.cachedPool(instanceName, fingerprint)
	if err != nil {
		return nil, err
	}

	if ok {
		return pool, nil
	}

	db, err := m.openPool(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("open instance pool: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// The manager may have shut down while we were dialing. Caching the new
	// pool would orphan it, so reject the late creation instead.
	if m.closed {
		_ = db.Close()
		return nil, errManagerClosed
	}

	if existing, ok := m.pools[instanceName]; ok {
		if existing.fingerprint == fingerprint {
			_ = db.Close()
			return existing, nil
		}

		delete(m.pools, instanceName)
		m.closeStalePool(instanceName, existing)
	}

	pool = &instancePool{
		db:          db,
		dbPools:     make(map[string]*sql.DB),
		pending:     make(map[string]*pendingDBPool),
		config:      m.config,
		driver:      m.healthDriver,
		secrets:     m.secrets,
		fingerprint: fingerprint,
	}
	m.pools[instanceName] = pool

	slog.Info("created connection pool",
		slog.String("instance", instanceName.String()),
		slog.String("engine", "postgresql"))

	return pool, nil
}

// cachedPool returns the cached pool for the instance when its fingerprint
// still matches the freshly-resolved config. A stale pool is left installed
// until a replacement successfully connects, so a bad hot reload cannot tear
// down the last-known-good connection. It fails on a closed manager.
func (m *Manager) cachedPool(instanceName resource.InstanceName, fingerprint [sha256.Size]byte) (*instancePool, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return nil, false, errManagerClosed
	}

	pool, ok := m.pools[instanceName]
	if ok && pool.fingerprint == fingerprint {
		return pool, true, nil
	}

	return nil, false, nil
}

// closeStalePool closes a pool whose connection config changed underneath it.
func (m *Manager) closeStalePool(instanceName resource.InstanceName, pool *instancePool) {
	if err := pool.close(); err != nil {
		slog.Error("failed to close stale pools",
			slog.String("instance", instanceName.String()),
			slog.Any("error", err))
	}

	slog.Info("evicted stale connection pools after config change",
		slog.String("instance", instanceName.String()))
}

// resolveInstanceDSN resolves the instance connection config, including the
// configured password source, into a DSN.
func (m *Manager) resolveInstanceDSN(ctx context.Context, instance *api.Instance) (string, error) {
	dsn, err := ConfigToDSNWithSecretResolver(ctx, instance.GetConfig(), m.secrets)
	if err != nil {
		return "", fmt.Errorf("resolve connection config for instance %s: %w", instance.GetName(), err)
	}

	if dsn == "" {
		return "", fmt.Errorf("invalid connection config for instance %s", instance.GetName())
	}

	return dsn, nil
}

// openPool opens and configures a database connection pool.
func (m *Manager) openPool(ctx context.Context, dsn string) (*sql.DB, error) {
	db, err := OpenPostgresDB(dsn)
	if err != nil {
		return nil, fmt.Errorf("open connection: %w", err)
	}

	m.config.apply(db)

	testCtx, cancel := context.WithTimeout(ctx, connectionTestTimeout)
	defer cancel()

	if err := m.healthDriver.TestConnection(testCtx, db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connection test failed: %w", err)
	}

	return db, nil
}
