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

// targetOutcome classifies what one target's run contributed to a cycle.
type targetOutcome int

const (
	// outcomeNotClaimed: another replica holds the target, or it isn't due.
	outcomeNotClaimed targetOutcome = iota
	// outcomeClaimError: the meta-DB claim itself failed.
	outcomeClaimError
	// outcomeCommitted: ran and persisted results.
	outcomeCommitted
	// outcomeEmpty: ran its policy with nothing to persist.
	outcomeEmpty
	// outcomeFailed: the run or its commit failed; last_error records it.
	outcomeFailed
	// outcomeLeaseLost: overran the lease; results were discarded.
	outcomeLeaseLost
)

// cycleStats aggregates one scheduling cycle for the per-cycle summary log.
type cycleStats struct {
	mu          sync.Mutex
	targets     int
	committed   int
	empty       int
	failed      int
	leaseLost   int
	claimErrors int
	maxRun      time.Duration
}

func (s *cycleStats) record(outcome targetOutcome, runDuration time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch outcome {
	case outcomeNotClaimed:
	case outcomeClaimError:
		s.claimErrors++
	case outcomeCommitted:
		s.committed++
	case outcomeEmpty:
		s.empty++
	case outcomeFailed:
		s.failed++
	case outcomeLeaseLost:
		s.leaseLost++
	}

	s.maxRun = max(s.maxRun, runDuration)
}

// claimed reports how many targets this replica actually ran this cycle.
func (s *cycleStats) claimed() int {
	return s.committed + s.empty + s.failed + s.leaseLost
}

func (m *Manager) runCycle(ctx context.Context, job Job) *cycleStats {
	cfg := job.Config()
	cycleStartedAt := time.Now()

	targets, err := job.ListTargets(ctx)
	if err != nil {
		// Shutdown is not a listing failure: don't log context cancellation
		// at ERROR level.
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			slog.DebugContext(ctx, "job target listing aborted by shutdown",
				slog.String("job", cfg.Name))

			return nil
		}

		slog.ErrorContext(ctx, "job target listing failed",
			slog.String("job", cfg.Name),
			slog.String("error", err.Error()))

		return nil
	}

	stats := &cycleStats{targets: len(targets)}

	grp, grpCtx := errgroup.WithContext(ctx)
	grp.SetLimit(max(cfg.Concurrency, 1))

	for _, target := range targets {
		grp.Go(func() error {
			outcome, runDuration := m.runTarget(grpCtx, job, target)
			stats.record(outcome, runDuration)

			return nil
		})
	}

	_ = grp.Wait()

	// One summary line per cycle. Routine healthy cycles are DEBUG: a single
	// user instance produces several probe cycles every few seconds, and those
	// success lines are pure noise. INFO is reserved for cycles worth a human's
	// attention — failed runs, lost leases, or claim errors.
	level := slog.LevelDebug
	if stats.failed > 0 || stats.leaseLost > 0 || stats.claimErrors > 0 {
		level = slog.LevelInfo
	}

	slog.Log(ctx, level, "job cycle summary",
		slog.String("job", cfg.Name),
		slog.Int("targets", stats.targets),
		slog.Int("claimed", stats.claimed()),
		slog.Int("committed", stats.committed),
		slog.Int("empty", stats.empty),
		slog.Int("failed", stats.failed),
		slog.Int("lease_lost", stats.leaseLost),
		slog.Int("claim_errors", stats.claimErrors),
		slog.Duration("max_run_duration", stats.maxRun),
		slog.Duration("cycle_duration", time.Since(cycleStartedAt)))

	return stats
}

// runTarget claims and runs one target, reporting its outcome and — when this
// replica won the claim — how long run plus commit took (the duration that
// must fit inside LeaseDuration).
func (m *Manager) runTarget(ctx context.Context, job Job, target string) (targetOutcome, time.Duration) {
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

		return outcomeClaimError, 0
	}

	if !claimed {
		return outcomeNotClaimed, 0
	}

	runCtx, cancel := context.WithTimeout(ctx, cfg.LeaseDuration)
	defer cancel()

	startedAt := time.Now()

	result, err := job.Run(runCtx, target)
	if err != nil {
		m.markFailure(ctx, key, err)
		return outcomeFailed, time.Since(startedAt)
	}

	if result.Commit == nil {
		if markErr := m.executionStore.MarkExecutionSuccess(ctx, m.baseExec, key, m.leaseOwner); markErr != nil {
			if errors.Is(markErr, storage.ErrLeaseLost) {
				m.logLeaseLost(ctx, key)
				return outcomeLeaseLost, time.Since(startedAt)
			}

			slog.ErrorContext(ctx, "job success bookkeeping failed",
				slog.String("job", key.RunnerName),
				slog.String("target", key.TargetName),
				slog.String("error", markErr.Error()))
		}

		return outcomeEmpty, time.Since(startedAt)
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
			return outcomeLeaseLost, time.Since(startedAt)
		}

		m.markFailure(ctx, key, err)

		return outcomeFailed, time.Since(startedAt)
	}

	return outcomeCommitted, time.Since(startedAt)
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
