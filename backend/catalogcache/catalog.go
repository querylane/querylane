// Package catalogcache provides a DB-backed metadata cache that syncs
// structural metadata (databases, schemas, tables, views, …) from user
// PostgreSQL instances into the meta database. Read requests are served from
// the cache with on-demand refresh when stale.
//
// This is the cache facade used by service handlers. The underlying CRUD
// against the meta database lives in storage/catalog.
package catalogcache

import (
	"context"
	"time"

	gocache "github.com/twmb/go-cache/cache"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// errorCooldown is how long a failed sync result is remembered in-process
// before another caller is allowed to retry against the live instance. Without
// it, every request that arrives while the upstream is down would re-attempt
// the sync and pile load onto a failing instance.
const errorCooldown = time.Second

// instanceSessionOpener opens a session to a user-managed instance.
type instanceSessionOpener interface {
	OpenInstance(ctx context.Context, instanceName resource.InstanceName) (engine.InstanceSession, error)
}

// catalogRepository provides CRUD access to cached catalog data.
type catalogRepository interface { //nolint:interfacebloat // cohesive catalog CRUD interface
	ListDatabases(ctx context.Context, instanceID string, params aip.Params) ([]model.CatalogDatabase, string, error)
	GetDatabase(ctx context.Context, instanceID, name string) (*model.CatalogDatabase, error)
	SyncDatabases(ctx context.Context, instanceID string, databases []model.CatalogDatabase) error

	ListSchemas(ctx context.Context, instanceID, databaseName string, params aip.Params) ([]model.CatalogSchema, string, error)
	GetSchema(ctx context.Context, instanceID, databaseName, name string) (*model.CatalogSchema, error)
	SyncSchemas(ctx context.Context, instanceID, databaseName string, schemas []model.CatalogSchema) error

	ListTables(ctx context.Context, instanceID, databaseName, schemaName string, params aip.Params) ([]model.CatalogTable, string, error)
	GetTable(ctx context.Context, instanceID, databaseName, schemaName, name string) (*model.CatalogTable, error)
	SyncTables(ctx context.Context, instanceID, databaseName, schemaName string, tables []model.CatalogTable) error

	ListTableColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogColumn, error)
	SyncColumns(ctx context.Context, instanceID, databaseName, schemaName, tableName string, columns []model.CatalogColumn) error

	ListViews(ctx context.Context, instanceID, databaseName, schemaName string, params aip.Params) ([]model.CatalogView, string, error)
	GetView(ctx context.Context, instanceID, databaseName, schemaName, name string) (*model.CatalogView, error)
	SyncViews(ctx context.Context, instanceID, databaseName, schemaName string, views []model.CatalogView) error

	ListTableConstraints(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableConstraint, error)
	SyncTableConstraints(ctx context.Context, instanceID, databaseName, schemaName, tableName string, constraints []model.CatalogTableConstraint) error
	ListTableIndexes(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableIndex, error)
	SyncTableIndexes(ctx context.Context, instanceID, databaseName, schemaName, tableName string, indexes []model.CatalogTableIndex) error
	ListTablePolicies(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTablePolicy, error)
	SyncTablePolicies(ctx context.Context, instanceID, databaseName, schemaName, tableName string, policies []model.CatalogTablePolicy) error
	ListTableTriggers(ctx context.Context, instanceID, databaseName, schemaName, tableName string) ([]model.CatalogTableTrigger, error)
	SyncTableTriggers(ctx context.Context, instanceID, databaseName, schemaName, tableName string, triggers []model.CatalogTableTrigger) error

	GetServerInfo(ctx context.Context, instanceID string) (*model.CatalogServerInfo, error)
	SyncServerInfo(ctx context.Context, info model.CatalogServerInfo) error

	InvalidateInstance(ctx context.Context, instanceID string) error
	InvalidateDatabase(ctx context.Context, instanceID, databaseName string) error
}

// catalogSyncStore provides distributed locking and freshness tracking.
type catalogSyncStore interface {
	GetSyncState(ctx context.Context, scope string) (*catalog.SyncState, error)
	ClaimSync(ctx context.Context, scope string, opts catalog.SyncClaimOptions) (bool, error)
	MarkSynced(ctx context.Context, scope string) error
	MarkSyncError(ctx context.Context, scope string, syncErr error) error
}

// Config controls catalog sync behaviour.
type Config struct {
	StalenessThreshold time.Duration // Max age before sync is triggered (default: 60s)
	SyncTimeout        time.Duration // Max duration for a single sync (default: 30s)
	SyncLockTimeout    time.Duration // Max time a 'syncing' lock is held before considered crashed (default: 1m)
}

// DefaultConfig returns production defaults.
func DefaultConfig() Config {
	return Config{
		StalenessThreshold: 60 * time.Second,
		SyncTimeout:        30 * time.Second,
		SyncLockTimeout:    time.Minute,
	}
}

// Catalog serves cached metadata from the meta DB and syncs on-demand from
// live user instances when data is stale or missing.
//
// instance_runtime_state is owned exclusively by the connectivity runner job;
// the catalog deliberately does not write to it. Catalog sync failures still
// surface to the caller through the RPC error, and the runner converges the
// stored connection state within one cycle.
type Catalog struct {
	repo      catalogRepository
	syncStore catalogSyncStore
	engine    instanceSessionOpener
	// syncCache does two jobs in one type: collapse concurrent in-process
	// callers for the same scope (singleflight semantics, MaxAge=0 so success
	// is NOT retained — catalog_sync_state in the meta DB is the single
	// source of truth for freshness), and dampen retry storms after a failed
	// sync via MaxErrorAge=errorCooldown. service/instance/overview.go and
	// cmd/server/meta_db_gate.go use the same library (twmb/go-cache) but with
	// their own MaxAge/MaxErrorAge tuned to their own freshness needs — only
	// the library is shared, not the configuration.
	syncCache *gocache.Cache[string, struct{}]
	config    Config
}

// New creates a Catalog backed by the given repository, sync store, and engine.
// Instance existence is not validated here: deleting an instance invalidates
// its catalog rows (InvalidateInstance), so subsequent reads cold-miss and the
// sync surfaces instance-not-found from the engine.
func New(cfg Config, repo catalogRepository, syncStore catalogSyncStore, engine instanceSessionOpener) *Catalog {
	return &Catalog{
		repo:      repo,
		syncStore: syncStore,
		engine:    engine,
		syncCache: gocache.New[string, struct{}](
			gocache.MaxAge(0),
			gocache.MaxStaleAge(0),
			gocache.MaxErrorAge(errorCooldown),
		),
		config: cfg,
	}
}
