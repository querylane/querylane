package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

type lockStatisticsTestDriver struct {
	capabilities []driver.Value
	rows         [][]driver.Value
	queryErr     error
}

type (
	lockStatisticsTestConn struct{ fixture lockStatisticsTestDriver }
	lockStatisticsTestTx   struct{}
)

var lockStatisticsTestSequence atomic.Int64

func (d lockStatisticsTestDriver) Open(string) (driver.Conn, error) {
	return lockStatisticsTestConn{fixture: d}, nil
}

func (c lockStatisticsTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c lockStatisticsTestConn) Close() error { return nil }
func (c lockStatisticsTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("explicit read-only transaction required")
}

func (c lockStatisticsTestConn) BeginTx(_ context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if !opts.ReadOnly {
		return nil, errors.New("read-only transaction required")
	}
	return lockStatisticsTestTx{}, nil
}

func (lockStatisticsTestTx) Commit() error   { return nil }
func (lockStatisticsTestTx) Rollback() error { return nil }

func (c lockStatisticsTestConn) ExecContext(context.Context, string, []driver.NamedValue) (driver.Result, error) {
	return driver.RowsAffected(1), nil
}

func (c lockStatisticsTestConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if query == discoverLockStatisticsQuery {
		return &queryInsightsTestRows{columns: []string{"version", "shape", "readable"}, rows: [][]driver.Value{c.fixture.capabilities}}, nil
	}
	if query != getLockStatisticsQuery {
		return nil, fmt.Errorf("unexpected query: %s", query)
	}
	if c.fixture.queryErr != nil {
		return nil, c.fixture.queryErr
	}
	return &queryInsightsTestRows{columns: []string{"locktype", "waits", "wait_time", "fastpath_exceeded", "stats_reset"}, rows: c.fixture.rows}, nil
}

func TestLockStatisticsObservationStates(t *testing.T) {
	t.Parallel()
	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}
	reset := time.Date(2026, time.November, 10, 0, 0, 0, 0, time.UTC)
	for _, tt := range []struct {
		name         string
		capabilities []driver.Value
		rows         [][]driver.Value
		queryErr     error
		availability engine.LockStatisticsAvailability
		wantErr      error
	}{
		{name: "valid zero", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{{"relation", int64(0), float64(0), int64(0), reset}}, availability: engine.LockStatisticsAvailable},
		{name: "cumulative counters", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{{"relation", int64(2), 14.5, int64(3), reset}}, availability: engine.LockStatisticsAvailable},
		{name: "older version", capabilities: []driver.Value{false, false, false}, availability: engine.LockStatisticsUnsupported},
		{name: "missing view or columns", capabilities: []driver.Value{true, false, false}, availability: engine.LockStatisticsUnsupported},
		{name: "restricted view ACL", capabilities: []driver.Value{true, true, false}, availability: engine.LockStatisticsRestricted},
		{name: "masked counters", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{{"relation", nil, nil, nil, nil}}, availability: engine.LockStatisticsRestricted},
		{name: "restricted function ACL", capabilities: []driver.Value{true, true, true}, queryErr: &pgconn.PgError{Code: "42501", Message: "permission denied"}, availability: engine.LockStatisticsRestricted},
		{name: "empty is not zero", capabilities: []driver.Value{true, true, true}, availability: engine.LockStatisticsUnavailable, wantErr: engine.ErrQueryUnavailable},
		{name: "timeout is not zero", capabilities: []driver.Value{true, true, true}, queryErr: context.DeadlineExceeded, availability: engine.LockStatisticsUnavailable, wantErr: engine.ErrQueryTimeout},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			fixture := lockStatisticsTestDriver{capabilities: tt.capabilities, rows: tt.rows, queryErr: tt.queryErr}
			name := fmt.Sprintf("querylane-lock-statistics-%d", lockStatisticsTestSequence.Add(1))
			sql.Register(name, fixture)
			db, err := sql.Open(name, "")
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, db.Close()) })
			statistics, err := queryLockStatisticsHealth(t.Context(), db)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}
			require.NotNil(t, statistics)
			assert.Equal(t, tt.availability, statistics.Availability)
			assert.NotEmpty(t, statistics.Summary)
			if tt.availability == engine.LockStatisticsAvailable {
				require.Len(t, statistics.ByType, 1)
				assert.Equal(t, tt.rows[0][1], statistics.ByType[0].Waits)
				assert.InDelta(t, tt.rows[0][2], statistics.ByType[0].WaitTimeMs, 0.000001)
				assert.Equal(t, tt.rows[0][3], statistics.ByType[0].FastpathExceeded)
				assert.Equal(t, &reset, statistics.ByType[0].StatsResetAt)
				assert.Equal(t, engine.HealthStatusOK, statistics.Status)
			} else {
				assert.Empty(t, statistics.ByType)
			}
		})
	}
}
