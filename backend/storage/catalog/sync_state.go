package catalog

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// Sync status constants.
const (
	SyncStatusSyncing = "syncing"
	SyncStatusSynced  = "synced"
	SyncStatusError   = "error"
)

// SyncState tracks the freshness of a cached scope.
type SyncState struct {
	Status       string
	LastSyncedAt *time.Time
	SyncError    *string
	UpdatedAt    time.Time
}

// SyncClaimOptions controls when ClaimSync is allowed to take ownership.
type SyncClaimOptions struct {
	Force       bool
	StaleBefore time.Time
}

// SyncStore provides distributed locking and freshness tracking for catalog sync.
type SyncStore interface {
	GetSyncState(ctx context.Context, scope string) (*SyncState, error)
	ClaimSync(ctx context.Context, scope string, opts SyncClaimOptions) (bool, error)
	MarkSynced(ctx context.Context, scope string) error
	MarkSyncError(ctx context.Context, scope string, syncErr error) error
}

// PGSyncStore implements SyncStore against PostgreSQL.
type PGSyncStore struct {
	db              *sql.DB
	syncLockTimeout time.Duration
}

// NewSyncStore creates a new sync state store.
func NewSyncStore(db *sql.DB, syncLockTimeout time.Duration) *PGSyncStore {
	return &PGSyncStore{
		db:              db,
		syncLockTimeout: syncLockTimeout,
	}
}

// GetSyncState reads the current sync state for a scope.
func (s *PGSyncStore) GetSyncState(ctx context.Context, scope string) (*SyncState, error) {
	stmt := postgres.SELECT(
		table.CatalogSyncState.Status,
		table.CatalogSyncState.LastSyncedAt,
		table.CatalogSyncState.Error,
		table.CatalogSyncState.UpdatedAt,
	).FROM(table.CatalogSyncState).
		WHERE(table.CatalogSyncState.Scope.EQ(postgres.String(scope)))

	var row model.CatalogSyncState
	if err := stmt.QueryContext(ctx, s.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, err
	}

	return &SyncState{
		Status:       row.Status,
		LastSyncedAt: row.LastSyncedAt,
		SyncError:    row.Error,
		UpdatedAt:    row.UpdatedAt,
	}, nil
}

// ClaimSync atomically sets the sync state to 'syncing' for the given scope.
// Returns true if this instance claimed the lock. Handles crash recovery via
// the configured lock timeout. Non-force claims only succeed when the current
// row is missing fresh synced data.
//
// The stale-lock cutoff is computed with the database clock (now() -
// syncLockTimeout): updated_at is always written by the DB (the table's
// updated_at trigger), so comparing it against a client-side time.Now() would
// reintroduce clock skew between replicas. opts.StaleBefore stays a caller
// value because it expresses the caller's own freshness policy.
//
// Known limitation: the lock carries no owner token, so MarkSynced and
// MarkSyncError match on scope alone. A claimant that overruns
// syncLockTimeout and loses the lock to another replica can still overwrite
// the new owner's terminal state. Closing that gap needs an owner column on
// catalog_sync_state (schema migration plus regenerated jet models) and is
// intentionally out of scope here.
func (s *PGSyncStore) ClaimSync(ctx context.Context, scope string, opts SyncClaimOptions) (bool, error) {
	now := postgres.NOW()
	staleLockCutoff := now.SUB(postgres.INTERVALd(s.syncLockTimeout))
	shouldClaim := table.CatalogSyncState.Status.EQ(postgres.String(SyncStatusSyncing)).
		AND(table.CatalogSyncState.UpdatedAt.LT(staleLockCutoff)).
		OR(
			table.CatalogSyncState.Status.NOT_EQ(postgres.String(SyncStatusSyncing)).
				AND(
					postgres.Bool(opts.Force).
						OR(table.CatalogSyncState.Status.NOT_EQ(postgres.String(SyncStatusSynced))).
						OR(table.CatalogSyncState.LastSyncedAt.IS_NULL()).
						OR(table.CatalogSyncState.LastSyncedAt.LT(postgres.TimestampzT(opts.StaleBefore))),
				),
		)

	stmt := table.CatalogSyncState.
		INSERT(
			table.CatalogSyncState.Scope,
			table.CatalogSyncState.Status,
			table.CatalogSyncState.CreatedAt,
			table.CatalogSyncState.UpdatedAt,
		).
		VALUES(
			scope,
			SyncStatusSyncing,
			now,
			now,
		).
		ON_CONFLICT(table.CatalogSyncState.Scope).
		DO_UPDATE(
			postgres.SET(
				table.CatalogSyncState.Status.SET(postgres.String(SyncStatusSyncing)),
				table.CatalogSyncState.UpdatedAt.SET(now),
			).WHERE(shouldClaim),
		)

	res, err := stmt.ExecContext(ctx, s.db)
	if err != nil {
		return false, err
	}

	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}

	return n > 0, nil
}

// MarkSynced updates the sync state to 'synced' with the database-side
// timestamp, matching the clock that writes updated_at (trigger) and that
// ClaimSync compares against. Not owner-guarded; see ClaimSync.
func (s *PGSyncStore) MarkSynced(ctx context.Context, scope string) error {
	stmt := table.CatalogSyncState.
		UPDATE(
			table.CatalogSyncState.Status,
			table.CatalogSyncState.Error,
			table.CatalogSyncState.LastSyncedAt,
			table.CatalogSyncState.UpdatedAt,
		).
		SET(
			postgres.String(SyncStatusSynced),
			nullStringExp(),
			postgres.NOW(),
			postgres.NOW(),
		).
		WHERE(table.CatalogSyncState.Scope.EQ(postgres.String(scope)))

	res, err := stmt.ExecContext(ctx, s.db)
	if err != nil {
		return err
	}

	n, err := res.RowsAffected()
	if err != nil {
		return err
	}

	if n == 0 {
		return storage.ErrNotFound
	}

	return nil
}

// MarkSyncError updates the sync state to 'error' with the error message.
// Timestamps are database-side for the same reason as in MarkSynced. Not
// owner-guarded; see ClaimSync.
func (s *PGSyncStore) MarkSyncError(ctx context.Context, scope string, syncErr error) error {
	stmt := table.CatalogSyncState.
		UPDATE(
			table.CatalogSyncState.Status,
			table.CatalogSyncState.Error,
			table.CatalogSyncState.UpdatedAt,
		).
		SET(
			postgres.String(SyncStatusError),
			postgres.String(syncErr.Error()),
			postgres.NOW(),
		).
		WHERE(table.CatalogSyncState.Scope.EQ(postgres.String(scope)))

	_, err := stmt.ExecContext(ctx, s.db)

	return err
}

// nullStringExp returns a fresh NULL expression for string columns. The
// shared postgres.NULL global must not be wrapped (StringExp mutates the
// wrapped expression's root pointer — a data race under concurrent statement
// building).
func nullStringExp() postgres.StringExpression {
	return postgres.StringExp(postgres.Raw("NULL"))
}
