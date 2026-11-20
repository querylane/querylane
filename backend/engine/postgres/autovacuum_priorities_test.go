package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"math"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

type autovacuumPrioritiesTestDriver struct {
	capabilities []driver.Value
	rows         [][]driver.Value
	queryErr     error
}

type autovacuumPrioritiesTestConn struct {
	fixture autovacuumPrioritiesTestDriver
}

var autovacuumPrioritiesTestSequence atomic.Int64

func (d autovacuumPrioritiesTestDriver) Open(string) (driver.Conn, error) {
	return autovacuumPrioritiesTestConn{fixture: d}, nil
}

func (c autovacuumPrioritiesTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c autovacuumPrioritiesTestConn) Close() error { return nil }
func (c autovacuumPrioritiesTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("explicit read-only transaction required")
}

func (c autovacuumPrioritiesTestConn) BeginTx(_ context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if !opts.ReadOnly {
		return nil, errors.New("read-only transaction required")
	}
	return queryInsightsTestTx{}, nil
}

func (c autovacuumPrioritiesTestConn) ExecContext(context.Context, string, []driver.NamedValue) (driver.Result, error) {
	return driver.RowsAffected(1), nil
}

func (c autovacuumPrioritiesTestConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if query == discoverAutovacuumPrioritiesQuery {
		return &queryInsightsTestRows{columns: []string{"version", "shape", "readable"}, rows: [][]driver.Value{c.fixture.capabilities}}, nil
	}
	if query != getAutovacuumPrioritiesQuery {
		return nil, fmt.Errorf("unexpected query: %s", query)
	}
	if c.fixture.queryErr != nil {
		return nil, c.fixture.queryErr
	}
	return &queryInsightsTestRows{columns: []string{"schema", "table", "score", "xid", "mxid", "vacuum", "insert", "analyze", "do_vacuum", "do_analyze", "wraparound"}, rows: c.fixture.rows}, nil
}

func TestAutovacuumPrioritiesObservationStates(t *testing.T) {
	t.Parallel()
	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}
	validRow := []driver.Value{"public", "priority", float64(5), float64(5), float64(4), float64(3), float64(2), float64(1), true, false, true}
	for _, tt := range []struct {
		name         string
		capabilities []driver.Value
		rows         [][]driver.Value
		queryErr     error
		availability engine.AutovacuumPrioritiesAvailability
		wantErr      error
	}{
		{name: "all components", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{validRow}, availability: engine.AutovacuumPrioritiesAvailable},
		{name: "empty visible tables", capabilities: []driver.Value{true, true, true}, availability: engine.AutovacuumPrioritiesAvailable},
		{name: "older version", capabilities: []driver.Value{false, false, false}, availability: engine.AutovacuumPrioritiesUnsupported},
		{name: "missing view or columns", capabilities: []driver.Value{true, false, false}, availability: engine.AutovacuumPrioritiesUnsupported},
		{name: "restricted view ACL", capabilities: []driver.Value{true, true, false}, availability: engine.AutovacuumPrioritiesRestricted},
		{name: "masked component discards partial sample", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{validRow, {"public", "masked", nil, float64(0), float64(0), float64(0), float64(0), float64(0), false, false, false}}, availability: engine.AutovacuumPrioritiesUnavailable},
		{name: "nonfinite score", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{{"public", "invalid", math.Inf(1), float64(0), float64(0), float64(0), float64(0), float64(0), false, false, false}}, availability: engine.AutovacuumPrioritiesUnavailable},
		{name: "NaN component", capabilities: []driver.Value{true, true, true}, rows: [][]driver.Value{{"public", "invalid", float64(0), math.NaN(), float64(0), float64(0), float64(0), float64(0), false, false, false}}, availability: engine.AutovacuumPrioritiesUnavailable},
		{name: "restricted function ACL", capabilities: []driver.Value{true, true, true}, queryErr: &pgconn.PgError{Code: "42501", Message: "permission denied"}, availability: engine.AutovacuumPrioritiesRestricted},
		{name: "timeout is not empty", capabilities: []driver.Value{true, true, true}, queryErr: context.DeadlineExceeded, availability: engine.AutovacuumPrioritiesUnavailable, wantErr: engine.ErrQueryTimeout},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			fixture := autovacuumPrioritiesTestDriver{capabilities: tt.capabilities, rows: tt.rows, queryErr: tt.queryErr}
			name := fmt.Sprintf("querylane-autovacuum-priorities-%d", autovacuumPrioritiesTestSequence.Add(1))
			sql.Register(name, fixture)
			db, err := sql.Open(name, "")
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, db.Close()) })
			priorities, err := queryAutovacuumPriorities(t.Context(), db)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}
			require.NotNil(t, priorities)
			assert.Equal(t, tt.availability, priorities.Availability)
			assert.NotEmpty(t, priorities.Summary)
			if tt.name == "all components" {
				assert.Equal(t, []engine.AutovacuumTablePriority{{SchemaName: "public", TableName: "priority", Score: 5, XIDScore: 5, MXIDScore: 4, VacuumScore: 3, VacuumInsertScore: 2, AnalyzeScore: 1, DoVacuum: true, DoAnalyze: false, ForWraparound: true}}, priorities.Tables)
			} else {
				assert.Empty(t, priorities.Tables)
			}
		})
	}
}
