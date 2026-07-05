package runner

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/storage"
)

// --- Test fakes ---

type fakeJob struct {
	config Config

	mu         sync.Mutex
	listFn     func(ctx context.Context) ([]string, error)
	runFn      func(ctx context.Context, target string) (RunResult, error)
	listCalls  int
	runCalls   int
	commitArgs []storage.QueryExecutor
}

func (j *fakeJob) Config() Config { return j.config }

func (j *fakeJob) ListTargets(ctx context.Context) ([]string, error) {
	j.mu.Lock()
	j.listCalls++
	fn := j.listFn
	j.mu.Unlock()

	return fn(ctx)
}

func (j *fakeJob) Run(ctx context.Context, target string) (RunResult, error) {
	j.mu.Lock()
	j.runCalls++
	fn := j.runFn
	j.mu.Unlock()

	result, err := fn(ctx, target)
	if result.Commit == nil {
		return result, err
	}

	commit := result.Commit

	// Wrap commit so we can record the executor it was called with — useful
	// for asserting the manager invokes Commit inside its meta-DB transaction.
	result.Commit = func(ctx context.Context, exec storage.QueryExecutor) error {
		j.mu.Lock()
		j.commitArgs = append(j.commitArgs, exec)
		j.mu.Unlock()

		return commit(ctx, exec)
	}

	return result, err
}

func (j *fakeJob) runCallCount() int {
	j.mu.Lock()
	defer j.mu.Unlock()

	return j.runCalls
}

type concurrencyJob struct {
	config            Config
	targets           []string
	maxConcurrent     *atomic.Int32
	currentConcurrent *atomic.Int32

	mu       sync.Mutex
	runCalls int
}

func (j *concurrencyJob) Config() Config { return j.config }

func (j *concurrencyJob) ListTargets(_ context.Context) ([]string, error) {
	return j.targets, nil
}

func (j *concurrencyJob) Run(_ context.Context, _ string) (RunResult, error) {
	current := j.currentConcurrent.Add(1)

	for {
		old := j.maxConcurrent.Load()
		if current <= old || j.maxConcurrent.CompareAndSwap(old, current) {
			break
		}
	}

	time.Sleep(10 * time.Millisecond)

	j.currentConcurrent.Add(-1)

	j.mu.Lock()
	j.runCalls++
	j.mu.Unlock()

	return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error { return nil }}, nil
}

func (j *concurrencyJob) calls() int {
	j.mu.Lock()
	defer j.mu.Unlock()

	return j.runCalls
}

type mockExecutionStore struct {
	mu           sync.Mutex
	claimResult  bool
	claimErr     error
	claimCalls   int
	successCalls int
	successErr   error
	failureCalls int
	failureErr   error
}

func (s *mockExecutionStore) TryClaimExecution(_ context.Context, _ storage.RunnerExecutionClaim) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.claimCalls++

	return s.claimResult, s.claimErr
}

func (s *mockExecutionStore) MarkExecutionSuccess(_ context.Context, _ storage.QueryExecutor, _ storage.RunnerExecutionKey, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.successCalls++

	return s.successErr
}

func (s *mockExecutionStore) MarkExecutionFailure(_ context.Context, _ storage.QueryExecutor, _ storage.RunnerExecutionKey, _ string, _ error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.failureCalls++

	return s.failureErr
}

func (s *mockExecutionStore) getSuccessCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.successCalls
}

func (s *mockExecutionStore) getFailureCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.failureCalls
}

type noopQueryExecutor struct{}

func (noopQueryExecutor) QueryContext(context.Context, string, ...any) (*sql.Rows, error) {
	return nil, nil //nolint:nilnil // test stub
}

func (noopQueryExecutor) QueryRowContext(context.Context, string, ...any) *sql.Row { return &sql.Row{} }

func (noopQueryExecutor) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	return nil, nil //nolint:nilnil // test stub
}

type mockTransactor struct {
	mu     sync.Mutex
	calls  int
	exec   storage.QueryExecutor
	runErr error
}

func (t *mockTransactor) RunInTransaction(_ context.Context, fn func(storage.QueryExecutor) error) error {
	t.mu.Lock()
	t.calls++
	exec := t.exec
	runErr := t.runErr
	t.mu.Unlock()

	if runErr != nil {
		return runErr
	}

	return fn(exec)
}

func (t *mockTransactor) getCalls() int {
	t.mu.Lock()
	defer t.mu.Unlock()

	return t.calls
}

func newTestManager(execStore storage.RunnerExecutionStore, tx transactor) *Manager {
	return &Manager{
		leaseOwner:     "test-owner",
		baseExec:       noopQueryExecutor{},
		transactor:     tx,
		executionStore: execStore,
	}
}

func defaultJobConfig() Config {
	return Config{
		Name:          "test_job",
		Interval:      time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   1,
	}
}

// --- Tests ---

// cycleCounts is the copyable expectation twin of cycleStats (which embeds a
// mutex and must not be copied).
type cycleCounts struct {
	targets     int
	committed   int
	empty       int
	failed      int
	leaseLost   int
	claimErrors int
}

func TestManager_RunCycle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		targets           []string
		targetsErr        error
		claimResult       bool
		claimErr          error
		runErr            error
		commitErr         error
		commitNil         bool
		transactorErr     error
		wantRunCalls      int
		wantTransactCalls int
		wantSuccessCalls  int
		wantFailureCalls  int
		wantStats         cycleCounts
	}{
		{
			name:              "success_with_commit",
			targets:           []string{"instances/a"},
			claimResult:       true,
			wantRunCalls:      1,
			wantTransactCalls: 1,
			wantSuccessCalls:  1,
			wantStats:         cycleCounts{targets: 1, committed: 1},
		},
		{
			name:             "success_no_commit",
			targets:          []string{"instances/a"},
			claimResult:      true,
			commitNil:        true,
			wantRunCalls:     1,
			wantSuccessCalls: 1,
			wantStats:        cycleCounts{targets: 1, empty: 1},
		},
		{
			name:             "run_error",
			targets:          []string{"instances/a"},
			claimResult:      true,
			runErr:           errors.New("collection failed"),
			wantRunCalls:     1,
			wantFailureCalls: 1,
			wantStats:        cycleCounts{targets: 1, failed: 1},
		},
		{
			name:              "commit_error",
			targets:           []string{"instances/a"},
			claimResult:       true,
			commitErr:         errors.New("write failed"),
			wantRunCalls:      1,
			wantTransactCalls: 1,
			wantFailureCalls:  1,
			wantStats:         cycleCounts{targets: 1, failed: 1},
		},
		{
			name:              "transaction_error",
			targets:           []string{"instances/a"},
			claimResult:       true,
			transactorErr:     errors.New("tx failed"),
			wantRunCalls:      1,
			wantTransactCalls: 1,
			wantFailureCalls:  1,
			wantStats:         cycleCounts{targets: 1, failed: 1},
		},
		{
			name:        "lease_not_claimed",
			targets:     []string{"instances/a"},
			claimResult: false,
			wantStats:   cycleCounts{targets: 1},
		},
		{
			name:      "claim_error",
			targets:   []string{"instances/a"},
			claimErr:  errors.New("db unreachable"),
			wantStats: cycleCounts{targets: 1, claimErrors: 1},
		},
		{
			name:       "list_targets_error",
			targetsErr: errors.New("list failed"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			job := &fakeJob{
				config: defaultJobConfig(),
				listFn: func(_ context.Context) ([]string, error) {
					return tt.targets, tt.targetsErr
				},
				runFn: func(_ context.Context, _ string) (RunResult, error) {
					if tt.runErr != nil {
						return RunResult{}, tt.runErr
					}

					if tt.commitNil {
						return RunResult{}, nil
					}

					return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error {
						return tt.commitErr
					}}, nil
				},
			}

			execStore := &mockExecutionStore{
				claimResult: tt.claimResult,
				claimErr:    tt.claimErr,
			}

			tx := &mockTransactor{
				exec:   noopQueryExecutor{},
				runErr: tt.transactorErr,
			}

			mgr := newTestManager(execStore, tx)

			stats := mgr.runCycle(context.Background(), job)

			runCalls := job.runCallCount()
			assert.Equal(t, tt.wantRunCalls, runCalls, "run calls")
			assert.Equal(t, tt.wantTransactCalls, tx.getCalls(), "tx calls")
			assert.Equal(t, tt.wantSuccessCalls, execStore.getSuccessCalls(), "success calls")
			assert.Equal(t, tt.wantFailureCalls, execStore.getFailureCalls(), "failure calls")

			if tt.targetsErr != nil {
				assert.Nil(t, stats, "target-listing failures produce no cycle stats")
				return
			}

			require.NotNil(t, stats)
			assert.Equal(t, tt.wantStats.targets, stats.targets, "stats.targets")
			assert.Equal(t, tt.wantStats.committed, stats.committed, "stats.committed")
			assert.Equal(t, tt.wantStats.empty, stats.empty, "stats.empty")
			assert.Equal(t, tt.wantStats.failed, stats.failed, "stats.failed")
			assert.Equal(t, tt.wantStats.leaseLost, stats.leaseLost, "stats.leaseLost")
			assert.Equal(t, tt.wantStats.claimErrors, stats.claimErrors, "stats.claimErrors")
		})
	}
}

// TestManager_RunCycle_LeaseLost verifies that a job which lost its lease
// mid-run (e.g. an overrun past LeaseDuration that another replica reclaimed)
// rolls back via the transaction error and is NOT recorded as a failure —
// this worker no longer owns the execution row.
func TestManager_RunCycle_LeaseLost(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		commitNil         bool
		wantTransactCalls int
	}{
		{name: "at_commit", wantTransactCalls: 1},
		{name: "without_commit", commitNil: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			job := &fakeJob{
				config: defaultJobConfig(),
				listFn: func(_ context.Context) ([]string, error) { return []string{"instances/a"}, nil },
				runFn: func(_ context.Context, _ string) (RunResult, error) {
					if tt.commitNil {
						return RunResult{}, nil
					}

					return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error { return nil }}, nil
				},
			}

			execStore := &mockExecutionStore{
				claimResult: true,
				successErr:  storage.ErrLeaseLost,
			}
			tx := &mockTransactor{exec: noopQueryExecutor{}}
			mgr := newTestManager(execStore, tx)

			stats := mgr.runCycle(context.Background(), job)

			assert.Equal(t, tt.wantTransactCalls, tx.getCalls(), "tx calls")
			assert.Equal(t, 1, execStore.getSuccessCalls(), "success bookkeeping attempted once")
			assert.Equal(t, 0, execStore.getFailureCalls(),
				"lease loss must not be recorded as a failure by a worker that no longer owns the row")

			require.NotNil(t, stats)
			assert.Equal(t, 1, stats.leaseLost, "stats.leaseLost")
			assert.Equal(t, 0, stats.failed, "stats.failed")
		})
	}
}

func TestManager_RunCycle_CommitReceivesTxExecutor(t *testing.T) {
	t.Parallel()

	job := &fakeJob{
		config: defaultJobConfig(),
		listFn: func(_ context.Context) ([]string, error) { return []string{"instances/a"}, nil },
		runFn: func(_ context.Context, _ string) (RunResult, error) {
			return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error { return nil }}, nil
		},
	}

	execStore := &mockExecutionStore{claimResult: true}
	tx := &mockTransactor{exec: noopQueryExecutor{}}
	mgr := newTestManager(execStore, tx)

	mgr.runCycle(context.Background(), job)

	require.Len(t, job.commitArgs, 1, "commit invoked once")
	assert.Equal(t, 1, tx.getCalls(), "transaction opened once for commit")
	assert.Equal(t, 1, execStore.getSuccessCalls(), "execution marked successful")
}

func TestManager_RunCycle_NilCommitSkipsTransaction(t *testing.T) {
	t.Parallel()

	job := &fakeJob{
		config: defaultJobConfig(),
		listFn: func(_ context.Context) ([]string, error) { return []string{"instances/a"}, nil },
		runFn: func(_ context.Context, _ string) (RunResult, error) {
			return RunResult{}, nil
		},
	}

	execStore := &mockExecutionStore{claimResult: true}
	tx := &mockTransactor{exec: noopQueryExecutor{}}
	mgr := newTestManager(execStore, tx)

	mgr.runCycle(context.Background(), job)

	assert.Equal(t, 0, tx.getCalls(), "no transaction opened when commit is nil")
	assert.Equal(t, 1, execStore.getSuccessCalls(), "execution still marked successful")
}

func TestManager_RunCycle_MultipleTargets(t *testing.T) {
	t.Parallel()

	targets := []string{"instances/a", "instances/b", "instances/c"}

	job := &fakeJob{
		config: defaultJobConfig(),
		listFn: func(_ context.Context) ([]string, error) { return targets, nil },
		runFn: func(_ context.Context, _ string) (RunResult, error) {
			return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error { return nil }}, nil
		},
	}

	execStore := &mockExecutionStore{claimResult: true}
	tx := &mockTransactor{exec: noopQueryExecutor{}}
	mgr := newTestManager(execStore, tx)

	mgr.runCycle(context.Background(), job)

	runCalls := job.runCallCount()
	assert.Equal(t, 3, runCalls)
	assert.Equal(t, 3, execStore.getSuccessCalls())
}

func TestManager_RunCycle_Concurrency(t *testing.T) {
	t.Parallel()

	const (
		targetCount      = 10
		concurrencyLimit = 3
	)

	var (
		maxConcurrent     atomic.Int32
		currentConcurrent atomic.Int32
	)

	targets := make([]string, targetCount)
	for i := range targets {
		targets[i] = "instances/" + string(rune('a'+i))
	}

	job := &concurrencyJob{
		config: Config{
			Name:          "concurrent",
			Interval:      time.Second,
			LeaseDuration: 30 * time.Second,
			Concurrency:   concurrencyLimit,
		},
		targets:           targets,
		maxConcurrent:     &maxConcurrent,
		currentConcurrent: &currentConcurrent,
	}

	execStore := &mockExecutionStore{claimResult: true}
	tx := &mockTransactor{exec: noopQueryExecutor{}}
	mgr := newTestManager(execStore, tx)

	mgr.runCycle(context.Background(), job)

	assert.Equal(t, targetCount, job.calls())
	assert.LessOrEqual(t, int(maxConcurrent.Load()), concurrencyLimit)
	assert.Greater(t, int(maxConcurrent.Load()), 1)
}

// recordingHandler captures slog records for log assertions. Safe for
// concurrent use; other parallel tests may log through it while installed as
// the default logger, so assertions must filter by a unique job name.
type recordingHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *recordingHandler) Enabled(_ context.Context, _ slog.Level) bool { return true }

func (h *recordingHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.records = append(h.records, r.Clone())

	return nil
}

func (h *recordingHandler) WithAttrs(_ []slog.Attr) slog.Handler { return h }

func (h *recordingHandler) WithGroup(_ string) slog.Handler { return h }

// errorRecordsForJob returns captured ERROR-level records whose "job" attr
// equals jobName.
func (h *recordingHandler) errorRecordsForJob(jobName string) []slog.Record {
	h.mu.Lock()
	defer h.mu.Unlock()

	var matched []slog.Record

	for _, r := range h.records {
		if r.Level != slog.LevelError {
			continue
		}

		r.Attrs(func(a slog.Attr) bool {
			if a.Key == "job" && a.Value.String() == jobName {
				matched = append(matched, r)
				return false
			}

			return true
		})
	}

	return matched
}

func TestManager_RunLoop_CancelledContextSkipsCycle(t *testing.T) {
	t.Parallel()

	job := &fakeJob{
		config: defaultJobConfig(),
		listFn: func(_ context.Context) ([]string, error) { return []string{"instances/a"}, nil },
		runFn: func(_ context.Context, _ string) (RunResult, error) {
			return RunResult{}, nil
		},
	}

	execStore := &mockExecutionStore{claimResult: true}
	mgr := newTestManager(execStore, &mockTransactor{exec: noopQueryExecutor{}})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	mgr.runLoop(ctx, job)

	job.mu.Lock()
	listCalls := job.listCalls
	job.mu.Unlock()

	assert.Equal(t, 0, listCalls, "a cancelled context must not run another cycle")
}

func TestManager_RunCycle_TargetListingErrorLogging(t *testing.T) {
	t.Parallel()

	handler := &recordingHandler{}
	previous := slog.Default()

	slog.SetDefault(slog.New(handler))
	t.Cleanup(func() { slog.SetDefault(previous) })

	t.Run("context canceled is not an error", func(t *testing.T) {
		t.Parallel()

		const jobName = "ctx_cancel_probe"

		ctx, cancel := context.WithCancel(context.Background())

		cfg := defaultJobConfig()
		cfg.Name = jobName
		job := &fakeJob{
			config: cfg,
			listFn: func(ctx context.Context) ([]string, error) {
				cancel()
				return nil, ctx.Err()
			},
		}

		mgr := newTestManager(&mockExecutionStore{}, &mockTransactor{exec: noopQueryExecutor{}})
		mgr.runCycle(ctx, job)

		assert.Empty(t, handler.errorRecordsForJob(jobName),
			"context.Canceled during shutdown must not be logged at ERROR level")
	})

	t.Run("real listing failure still logs an error", func(t *testing.T) {
		t.Parallel()

		const jobName = "real_error_probe"

		cfg := defaultJobConfig()
		cfg.Name = jobName
		job := &fakeJob{
			config: cfg,
			listFn: func(_ context.Context) ([]string, error) {
				return nil, errors.New("list failed")
			},
		}

		mgr := newTestManager(&mockExecutionStore{}, &mockTransactor{exec: noopQueryExecutor{}})
		mgr.runCycle(context.Background(), job)

		assert.NotEmpty(t, handler.errorRecordsForJob(jobName),
			"genuine listing failures must keep logging at ERROR level")
	})
}

func TestManager_Start_AndClose(t *testing.T) {
	t.Parallel()

	job := &fakeJob{
		config: Config{
			Name:          "test_job",
			Interval:      100 * time.Millisecond,
			LeaseDuration: 30 * time.Second,
			Concurrency:   1,
		},
		listFn: func(_ context.Context) ([]string, error) {
			return []string{"instances/a"}, nil
		},
		runFn: func(_ context.Context, _ string) (RunResult, error) {
			return RunResult{Commit: func(_ context.Context, _ storage.QueryExecutor) error { return nil }}, nil
		},
	}

	execStore := &mockExecutionStore{claimResult: true}
	tx := &mockTransactor{exec: noopQueryExecutor{}}
	mgr := newTestManager(execStore, tx)

	mgr.Start(context.Background(), job)

	require.Eventually(t, func() bool {
		return execStore.getSuccessCalls()+execStore.getFailureCalls() >= 1
	}, 2*time.Second, 10*time.Millisecond)

	done := make(chan struct{})

	go func() {
		mgr.Close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Manager.Close did not return within 2 seconds")
	}
}

func TestManager_Close_NoJobs(t *testing.T) {
	t.Parallel()

	mgr := newTestManager(&mockExecutionStore{}, &mockTransactor{exec: noopQueryExecutor{}})
	mgr.Close()
}
