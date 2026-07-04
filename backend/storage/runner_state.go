package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/go-jet/jet/v2/postgres"

	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// ErrLeaseLost indicates that the worker no longer holds the execution lease
// for the runner-target pair — typically because the run overran its
// LeaseDuration and another replica reclaimed the row. Callers must treat the
// run's results as void: marking them inside the same transaction as the
// result write rolls everything back.
var ErrLeaseLost = errors.New("runner execution lease lost")

// RunnerExecutionKey uniquely identifies one runner-target pair.
type RunnerExecutionKey struct {
	RunnerName string
	TargetName string
}

// RunnerExecutionClaim controls lease acquisition for a runner-target pair.
type RunnerExecutionClaim struct {
	Key           RunnerExecutionKey
	LeaseOwner    string
	LeaseDuration time.Duration
	// RunInterval is the cadence the runner is configured for. The claim
	// succeeds only when the previous run finished at least RunInterval ago.
	RunInterval time.Duration
	Force       bool
}

// RunnerExecutionState tracks lease and bookkeeping for a runner-target pair.
type RunnerExecutionState struct {
	RunnerExecutionKey

	LeaseOwner     *string
	LeaseExpiresAt *time.Time
	LastStartedAt  *time.Time
	LastFinishedAt *time.Time
	LastSuccessAt  *time.Time
	LastError      *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// RunnerExecutionStore provides distributed coordination for runners.
type RunnerExecutionStore interface {
	TryClaimExecution(ctx context.Context, claim RunnerExecutionClaim) (bool, error)
	MarkExecutionSuccess(ctx context.Context, exec QueryExecutor, key RunnerExecutionKey, leaseOwner string) error
	MarkExecutionFailure(ctx context.Context, exec QueryExecutor, key RunnerExecutionKey, leaseOwner string, runErr error) error
}

type PGRunnerExecutionStore struct {
	db *sql.DB
}

// NewRunnerExecutionStore returns a store backed by db.
func NewRunnerExecutionStore(db *sql.DB) *PGRunnerExecutionStore {
	return &PGRunnerExecutionStore{db: db}
}

// claimSlop absorbs DB and ticker jitter so a target whose previous start
// landed a few ms past the strict now()-Interval boundary still claims on
// the next tick.
const claimSlop = 500 * time.Millisecond

// cadenceGate returns how long after the previous start a new run becomes
// due. Clamped at zero: for intervals shorter than claimSlop the subtraction
// would go negative, shifting the gate into the future and disabling cadence
// gating entirely.
func cadenceGate(runInterval time.Duration) time.Duration {
	return max(runInterval-claimSlop, 0)
}

// nullStringExp returns a fresh NULL expression for string columns.
// postgres.NULL is a shared package-level global: wrapping it via
// postgres.StringExp(postgres.NULL) mutates its root pointer, which is a data
// race when statements are built concurrently (the runner claims targets from
// multiple goroutines).
func nullStringExp() postgres.StringExpression {
	return postgres.StringExp(postgres.Raw("NULL"))
}

// nullTimestampzExp returns a fresh NULL expression for timestamptz columns.
// See nullStringExp for why the shared postgres.NULL must not be wrapped.
func nullTimestampzExp() postgres.TimestampzExpression {
	return postgres.TimestampzExp(postgres.Raw("NULL"))
}

// TryClaimExecution acquires the lease when the target is due and not already leased.
//
// All time arithmetic is Postgres-side so replicas with skewed clocks agree
// on lease expiry. Cadence is measured from last_started_at; comparing
// against last_finished_at would couple effective cadence to cycle duration.
func (s *PGRunnerExecutionStore) TryClaimExecution(ctx context.Context, claim RunnerExecutionClaim) (bool, error) {
	now := postgres.NOW()
	leaseExpiresAt := now.ADD(postgres.INTERVALd(claim.LeaseDuration))
	runAfter := now.SUB(postgres.INTERVALd(cadenceGate(claim.RunInterval)))

	leaseExpired := table.RunnerExecutionState.LeaseExpiresAt.IS_NULL().
		OR(table.RunnerExecutionState.LeaseExpiresAt.LT(now))
	runDue := postgres.Bool(claim.Force).
		OR(table.RunnerExecutionState.LastStartedAt.IS_NULL()).
		OR(table.RunnerExecutionState.LastStartedAt.LT_EQ(runAfter))

	stmt := table.RunnerExecutionState.
		INSERT(
			table.RunnerExecutionState.RunnerName,
			table.RunnerExecutionState.TargetName,
			table.RunnerExecutionState.LeaseOwner,
			table.RunnerExecutionState.LeaseExpiresAt,
			table.RunnerExecutionState.LastStartedAt,
		).
		VALUES(
			claim.Key.RunnerName,
			claim.Key.TargetName,
			claim.LeaseOwner,
			leaseExpiresAt,
			now,
		).
		ON_CONFLICT(
			table.RunnerExecutionState.RunnerName,
			table.RunnerExecutionState.TargetName,
		).
		DO_UPDATE(
			postgres.SET(
				table.RunnerExecutionState.LeaseOwner.SET(table.RunnerExecutionState.EXCLUDED.LeaseOwner),
				table.RunnerExecutionState.LeaseExpiresAt.SET(table.RunnerExecutionState.EXCLUDED.LeaseExpiresAt),
				table.RunnerExecutionState.LastStartedAt.SET(table.RunnerExecutionState.EXCLUDED.LastStartedAt),
				table.RunnerExecutionState.LastError.SET(nullStringExp()),
			).WHERE(leaseExpired.AND(runDue)),
		)

	res, err := stmt.ExecContext(ctx, s.db)
	if err != nil {
		return false, fmt.Errorf("claim runner execution: %w", err)
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("claim runner execution rows affected: %w", err)
	}

	return rowsAffected > 0, nil
}

// MarkExecutionSuccess clears the lease and records a successful run. It
// returns ErrLeaseLost when leaseOwner no longer holds the row's lease, so
// callers can roll back result writes made by an overrun job.
func (s *PGRunnerExecutionStore) MarkExecutionSuccess(ctx context.Context, exec QueryExecutor, key RunnerExecutionKey, leaseOwner string) error {
	stmt := table.RunnerExecutionState.
		UPDATE(
			table.RunnerExecutionState.LeaseOwner,
			table.RunnerExecutionState.LeaseExpiresAt,
			table.RunnerExecutionState.LastFinishedAt,
			table.RunnerExecutionState.LastSuccessAt,
			table.RunnerExecutionState.LastError,
		).
		SET(
			nullStringExp(),
			nullTimestampzExp(),
			postgres.NOW(),
			postgres.NOW(),
			nullStringExp(),
		).
		WHERE(executionRowOwnedBy(key, leaseOwner))

	res, err := stmt.ExecContext(ctx, exec)
	if err != nil {
		return fmt.Errorf("mark runner execution success: %w", err)
	}

	return leaseStillOwned(res, "mark runner execution success")
}

// MarkExecutionFailure clears the lease and records the failure. It returns
// ErrLeaseLost when leaseOwner no longer holds the row's lease.
func (s *PGRunnerExecutionStore) MarkExecutionFailure(ctx context.Context, exec QueryExecutor, key RunnerExecutionKey, leaseOwner string, runErr error) error {
	errText := nullStringExp()
	if runErr != nil {
		errText = postgres.String(runErr.Error())
	}

	stmt := table.RunnerExecutionState.
		UPDATE(
			table.RunnerExecutionState.LeaseOwner,
			table.RunnerExecutionState.LeaseExpiresAt,
			table.RunnerExecutionState.LastFinishedAt,
			table.RunnerExecutionState.LastError,
		).
		SET(
			nullStringExp(),
			nullTimestampzExp(),
			postgres.NOW(),
			errText,
		).
		WHERE(executionRowOwnedBy(key, leaseOwner))

	res, err := stmt.ExecContext(ctx, exec)
	if err != nil {
		return fmt.Errorf("mark runner execution failure: %w", err)
	}

	return leaseStillOwned(res, "mark runner execution failure")
}

// leaseStillOwned translates "0 rows updated" from an owner-guarded mark
// statement into ErrLeaseLost: the row exists but is no longer leased by us.
func leaseStillOwned(res sql.Result, op string) error {
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s rows affected: %w", op, err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("%s: %w", op, ErrLeaseLost)
	}

	return nil
}

// executionRowOwnedBy matches the unique row for one runner-target pair iff
// the supplied owner currently holds its lease.
func executionRowOwnedBy(key RunnerExecutionKey, leaseOwner string) postgres.BoolExpression {
	return table.RunnerExecutionState.RunnerName.EQ(postgres.String(key.RunnerName)).
		AND(table.RunnerExecutionState.TargetName.EQ(postgres.String(key.TargetName))).
		AND(table.RunnerExecutionState.LeaseOwner.EQ(postgres.String(leaseOwner)))
}
