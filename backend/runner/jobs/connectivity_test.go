package jobs

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/runner"
	"github.com/querylane/querylane/backend/storage"
)

type noopQueryExecutor struct{}

func (noopQueryExecutor) QueryContext(context.Context, string, ...any) (*sql.Rows, error) {
	return nil, nil //nolint:nilnil // test stub
}

func (noopQueryExecutor) QueryRowContext(context.Context, string, ...any) *sql.Row { return &sql.Row{} }

func (noopQueryExecutor) ExecContext(context.Context, string, ...any) (sql.Result, error) {
	return nil, nil //nolint:nilnil // test stub
}

type fakeConnectionChecker struct {
	err error
}

func (c *fakeConnectionChecker) CheckInstanceConnection(_ context.Context, _ resource.InstanceName) error {
	return c.err
}

type fakeConnectionRecorder struct {
	mu sync.Mutex

	activeCalls int
	errorCalls  int

	lastID    string
	lastErr   error
	lastTime  time.Time
	returnErr error
}

func (r *fakeConnectionRecorder) RecordActiveTx(_ context.Context, _ storage.QueryExecutor, instanceID string, checkedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.activeCalls++
	r.lastID = instanceID
	r.lastTime = checkedAt
	r.lastErr = nil

	return r.returnErr
}

func (r *fakeConnectionRecorder) RecordErrorTx(_ context.Context, _ storage.QueryExecutor, instanceID string, checkedAt time.Time, err error) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.errorCalls++
	r.lastID = instanceID
	r.lastTime = checkedAt
	r.lastErr = err

	return r.returnErr
}

func newTestInstanceConnectivityJob(checker InstanceConnectionChecker, recorder instanceConnectionRecorder) *InstanceConnectivityJob {
	reader := &mockInstanceReader{pages: [][]*api.Instance{
		{{Name: "instances/test"}},
	}}

	cfg := runner.Config{
		Name:          "test_connectivity",
		Interval:      10 * time.Second,
		LeaseDuration: 30 * time.Second,
		Concurrency:   1,
	}

	return NewInstanceConnectivity(cfg, checker, recorder, NewInstanceTargetSource(reader))
}

func TestInstanceConnectivityJob_Config(t *testing.T) {
	t.Parallel()

	job := newTestInstanceConnectivityJob(&fakeConnectionChecker{}, &fakeConnectionRecorder{})

	cfg := job.Config()
	assert.Equal(t, "test_connectivity", cfg.Name)
	assert.Equal(t, 10*time.Second, cfg.Interval)
	assert.Equal(t, 30*time.Second, cfg.LeaseDuration)
	assert.Equal(t, 1, cfg.Concurrency)
}

func TestInstanceConnectivityJob_Run(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		target           string
		checkerErr       error
		wantActiveCalls  int
		wantErrorCalls   int
		wantRecordedErr  string
		wantRunCallError bool
	}{
		{
			name:            "active",
			target:          "instances/healthy",
			wantActiveCalls: 1,
		},
		{
			name:            "probe_failure_records_error_no_run_error",
			target:          "instances/broken",
			checkerErr:      errors.New("connection refused"),
			wantErrorCalls:  1,
			wantRecordedErr: "connection refused",
		},
		{
			name:             "invalid_target",
			target:           "not-a-valid-resource",
			wantRunCallError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			recorder := &fakeConnectionRecorder{}
			job := newTestInstanceConnectivityJob(&fakeConnectionChecker{err: tt.checkerErr}, recorder)

			result, err := job.Run(context.Background(), tt.target)
			if tt.wantRunCallError {
				require.Error(t, err)
				assert.Nil(t, result.Commit)

				return
			}

			require.NoError(t, err)
			require.NotNil(t, result.Commit)

			require.NoError(t, result.Commit(context.Background(), noopQueryExecutor{}))

			assert.Equal(t, tt.wantActiveCalls, recorder.activeCalls)
			assert.Equal(t, tt.wantErrorCalls, recorder.errorCalls)

			if tt.wantRecordedErr != "" {
				require.Error(t, recorder.lastErr)
				assert.Contains(t, recorder.lastErr.Error(), tt.wantRecordedErr)
			}

			assert.False(t, recorder.lastTime.IsZero())
		})
	}
}

func TestInstanceConnectivityJob_Run_ExtractsInstanceID(t *testing.T) {
	t.Parallel()

	recorder := &fakeConnectionRecorder{}
	job := newTestInstanceConnectivityJob(&fakeConnectionChecker{}, recorder)

	result, err := job.Run(context.Background(), "instances/my-prod-db")
	require.NoError(t, err)

	require.NoError(t, result.Commit(context.Background(), noopQueryExecutor{}))
	assert.Equal(t, "my-prod-db", recorder.lastID)
}

func TestInstanceConnectivityJob_Run_RedactsPostgresLogButRecordsOriginalError(t *testing.T) { //nolint:paralleltest // replaces the process-wide slog logger
	var logs bytes.Buffer

	previousLogger := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })

	pgErr := &pgconn.PgError{
		Code:    pgerrcode.InvalidPassword,
		Message: "password contains api_key=secret",
	}
	recorder := &fakeConnectionRecorder{}
	job := newTestInstanceConnectivityJob(&fakeConnectionChecker{err: pgErr}, recorder)

	result, err := job.Run(t.Context(), "instances/private")
	require.NoError(t, err)
	require.NoError(t, result.Commit(t.Context(), noopQueryExecutor{}))

	assert.NotContains(t, logs.String(), "api_key=secret")
	assert.Contains(t, logs.String(), pgerrcode.InvalidPassword)
	assert.ErrorIs(t, recorder.lastErr, pgErr)
}
