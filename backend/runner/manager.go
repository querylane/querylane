package runner

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/querylane/querylane/backend/storage"
)

type transactor interface {
	RunInTransaction(ctx context.Context, fn func(storage.QueryExecutor) error) error
}

type sqlTransactor struct {
	db *sql.DB
}

func (t sqlTransactor) RunInTransaction(ctx context.Context, fn func(storage.QueryExecutor) error) error {
	return storage.RunInTransaction(ctx, t.db, fn)
}

// Manager schedules background Jobs, coordinates per-target leases via
// runner_execution_state, and atomically pairs each successful Commit with the
// matching execution-success bookkeeping in a single meta-DB transaction.
//
// The Manager knows nothing about job payloads. Each Job owns its own data
// model: lists its targets, runs collection against external systems, and
// returns a Commit closure that writes typed results.
type Manager struct {
	leaseOwner     string
	baseExec       storage.QueryExecutor
	transactor     transactor
	executionStore storage.RunnerExecutionStore

	startOnce sync.Once
	cancel    context.CancelFunc
	wg        sync.WaitGroup
}

// NewManager returns a runner Manager. leaseOwner must be unique per replica
// (an xid works well) so lease holders are distinguishable across replicas
// in the meta DB.
func NewManager(leaseOwner string, db *sql.DB, executionStore storage.RunnerExecutionStore) *Manager {
	return &Manager{
		leaseOwner:     leaseOwner,
		baseExec:       db,
		transactor:     sqlTransactor{db: db},
		executionStore: executionStore,
	}
}

// Start launches one goroutine per Job and runs the first cycle immediately.
// Calling Start more than once is a no-op; subsequent calls are silently ignored.
func (m *Manager) Start(ctx context.Context, jobs ...Job) {
	if len(jobs) == 0 {
		return
	}

	m.startOnce.Do(func() {
		runCtx, cancel := context.WithCancel(ctx)
		m.cancel = cancel

		for _, job := range jobs {
			m.wg.Go(func() {
				m.runLoop(runCtx, job)
			})
		}
	})
}

// Close cancels every running job goroutine and blocks until they exit.
// Safe to call before Start (no-op) and idempotent across replays.
func (m *Manager) Close() {
	if m.cancel != nil {
		m.cancel()
	}

	m.wg.Wait()
}

func (m *Manager) runLoop(ctx context.Context, job Job) {
	cfg := job.Config()

	ticker := time.NewTicker(cfg.Interval)
	defer ticker.Stop()

	for {
		// A tick can race shutdown: when the ticker fires in the same instant
		// the context is cancelled, the select may pick the tick and run one
		// extra cycle against a dead context. Check before every cycle.
		if ctx.Err() != nil {
			return
		}

		m.runCycle(ctx, job)

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (m *Manager) runCycle(ctx context.Context, job Job) {
	cfg := job.Config()

	targets, err := job.ListTargets(ctx)
	if err != nil {
		// Shutdown is not a listing failure: don't log context cancellation
		// at ERROR level.
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			slog.DebugContext(ctx, "job target listing aborted by shutdown",
				slog.String("job", cfg.Name))

			return
		}

		slog.ErrorContext(ctx, "job target listing failed",
			slog.String("job", cfg.Name),
			slog.String("error", err.Error()))

		return
	}

	grp, grpCtx := errgroup.WithContext(ctx)
	grp.SetLimit(max(cfg.Concurrency, 1))

	for _, target := range targets {
		grp.Go(func() error {
			m.runTarget(grpCtx, job, target)
			return nil
		})
	}

	_ = grp.Wait()
}

func (m *Manager) runTarget(ctx context.Context, job Job, target string) {
	cfg := job.Config()
	key := storage.RunnerExecutionKey{
		RunnerName: cfg.Name,
		TargetName: target,
	}

	claimed, err := m.executionStore.TryClaimExecution(ctx, storage.RunnerExecutionClaim{
		Key:           key,
		LeaseOwner:    m.leaseOwner,
		LeaseDuration: cfg.LeaseDuration,
		RunInterval:   cfg.Interval,
	})
	if err != nil {
		slog.ErrorContext(ctx, "job claim failed",
			slog.String("job", cfg.Name),
			slog.String("target", target),
			slog.String("error", err.Error()))

		return
	}

	if !claimed {
		return
	}

	runCtx, cancel := context.WithTimeout(ctx, cfg.LeaseDuration)
	defer cancel()

	startedAt := time.Now()
	result, err := job.Run(runCtx, target)
	duration := time.Since(startedAt)

	if err != nil {
		m.markFailure(ctx, key, err)
		return
	}

	if result.Commit == nil {
		if markErr := m.executionStore.MarkExecutionSuccess(ctx, m.baseExec, key, m.leaseOwner); markErr != nil {
			if errors.Is(markErr, storage.ErrLeaseLost) {
				m.logLeaseLost(ctx, key)
				return
			}

			slog.ErrorContext(ctx, "job success bookkeeping failed",
				slog.String("job", key.RunnerName),
				slog.String("target", key.TargetName),
				slog.String("error", markErr.Error()))
		}

		slog.DebugContext(ctx, "job completed without commit",
			slog.String("job", key.RunnerName),
			slog.String("target", key.TargetName),
			slog.Duration("duration", duration))

		return
	}

	// MarkExecutionSuccess shares the commit transaction: when the lease was
	// lost mid-run (overrun past LeaseDuration, reclaimed by another replica),
	// it returns ErrLeaseLost and the whole transaction — including the result
	// write — rolls back instead of clobbering the new owner's run.
	err = m.transactor.RunInTransaction(runCtx, func(exec storage.QueryExecutor) error {
		if err := result.Commit(runCtx, exec); err != nil {
			return err
		}

		return m.executionStore.MarkExecutionSuccess(runCtx, exec, key, m.leaseOwner)
	})
	if err != nil {
		if errors.Is(err, storage.ErrLeaseLost) {
			m.logLeaseLost(ctx, key)
			return
		}

		m.markFailure(ctx, key, err)

		return
	}

	slog.DebugContext(ctx, "job completed",
		slog.String("job", key.RunnerName),
		slog.String("target", key.TargetName),
		slog.Duration("duration", duration))
}

// logLeaseLost records that this worker's run finished after its lease was
// reclaimed by another replica; its results were discarded.
func (m *Manager) logLeaseLost(ctx context.Context, key storage.RunnerExecutionKey) {
	slog.WarnContext(ctx, "job lease lost during run; results discarded",
		slog.String("job", key.RunnerName),
		slog.String("target", key.TargetName))
}

func (m *Manager) markFailure(ctx context.Context, key storage.RunnerExecutionKey, runErr error) {
	if markErr := m.executionStore.MarkExecutionFailure(ctx, m.baseExec, key, m.leaseOwner, runErr); markErr != nil {
		if errors.Is(markErr, storage.ErrLeaseLost) {
			m.logLeaseLost(ctx, key)
		} else {
			slog.ErrorContext(ctx, "job failure bookkeeping failed",
				slog.String("job", key.RunnerName),
				slog.String("target", key.TargetName),
				slog.String("error", markErr.Error()))
		}
	}

	slog.WarnContext(ctx, "job execution failed",
		slog.String("job", key.RunnerName),
		slog.String("target", key.TargetName),
		slog.String("error", runErr.Error()))
}
