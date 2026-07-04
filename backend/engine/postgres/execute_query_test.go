package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

type executeQueryFakeDriver struct {
	state *executeQueryFakeState
}

type executeQueryFakeState struct {
	values     []int64
	nextErrAt  int
	rowsClosed atomic.Bool
	txRolled   atomic.Bool
}

type (
	executeQueryFakeConn struct{ state *executeQueryFakeState }
	executeQueryFakeTx   struct{ state *executeQueryFakeState }
	executeQueryFakeRows struct {
		state *executeQueryFakeState
		idx   int
	}
)

var executeQueryFakeDriverSeq atomic.Int64

func openExecuteQueryFakeDB(t *testing.T, values ...int64) (*sql.DB, *executeQueryFakeState) {
	t.Helper()

	state := &executeQueryFakeState{values: values}
	name := fmt.Sprintf("querylane_execute_query_fake_%d", executeQueryFakeDriverSeq.Add(1))
	sql.Register(name, &executeQueryFakeDriver{state: state})
	db, err := sql.Open(name, "")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)

	return db, state
}

func (d *executeQueryFakeDriver) Open(string) (driver.Conn, error) {
	return &executeQueryFakeConn{state: d.state}, nil
}

func (c *executeQueryFakeConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}
func (c *executeQueryFakeConn) Close() error { return nil }
func (c *executeQueryFakeConn) Begin() (driver.Tx, error) {
	return &executeQueryFakeTx{state: c.state}, nil
}

func (c *executeQueryFakeConn) BeginTx(context.Context, driver.TxOptions) (driver.Tx, error) {
	return &executeQueryFakeTx{state: c.state}, nil
}

func (c *executeQueryFakeConn) ExecContext(context.Context, string, []driver.NamedValue) (driver.Result, error) {
	return driver.RowsAffected(0), nil
}

func (c *executeQueryFakeConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &executeQueryFakeRows{state: c.state}, nil
}
func (tx *executeQueryFakeTx) Commit() error      { return nil }
func (tx *executeQueryFakeTx) Rollback() error    { tx.state.txRolled.Store(true); return nil }
func (r *executeQueryFakeRows) Columns() []string { return []string{"n"} }
func (r *executeQueryFakeRows) Close() error      { r.state.rowsClosed.Store(true); return nil }
func (r *executeQueryFakeRows) Next(dest []driver.Value) error {
	if r.state.nextErrAt > 0 && r.idx == r.state.nextErrAt {
		return errors.New("injected rows next error")
	}

	if r.idx >= len(r.state.values) {
		return io.EOF
	}

	dest[0] = r.state.values[r.idx]
	r.idx++

	return nil
}
func (r *executeQueryFakeRows) ColumnTypeScanType(int) reflect.Type   { return reflect.TypeFor[int64]() }
func (r *executeQueryFakeRows) ColumnTypeDatabaseTypeName(int) string { return "INT8" }

func TestExecuteQueryStreamCloseFinalizesPartialRead(t *testing.T) {
	t.Parallel()

	db, state := openExecuteQueryFakeDB(t, 1, 2, 3)
	defer db.Close()

	stream, err := (&Postgres{}).ExecuteQuery(context.Background(), db, engine.ExecuteQueryParams{Statement: "select n", Timeout: time.Second})
	require.NoError(t, err)
	require.True(t, stream.Next())
	require.NoError(t, stream.Close())

	require.True(t, state.rowsClosed.Load(), "Close must close rows after partial read")
	require.True(t, state.txRolled.Load(), "Close must rollback read-only tx after partial read")
	require.False(t, stream.Next(), "closed stream must not advance")
	require.NoError(t, stream.Err())
	require.Equal(t, int64(1), stream.Stats().RowCount)
	require.False(t, stream.Stats().Truncated)
}

func TestExecuteQueryStreamTruncationStats(t *testing.T) {
	t.Parallel()

	db, state := openExecuteQueryFakeDB(t, 1, 2, 3)
	defer db.Close()

	stream, err := (&Postgres{}).ExecuteQuery(context.Background(), db, engine.ExecuteQueryParams{Statement: "select n", RowLimit: 2, Timeout: time.Second})
	require.NoError(t, err)

	var rows int
	for stream.Next() {
		rows++
	}

	require.NoError(t, stream.Err())
	require.True(t, state.rowsClosed.Load())
	require.True(t, state.txRolled.Load())
	require.Equal(t, 2, rows)
	require.Equal(t, int64(2), stream.Stats().RowCount)
	require.True(t, stream.Stats().Truncated)
}

func TestExecuteQueryStreamLimitProbeChecksRowsErr(t *testing.T) {
	t.Parallel()

	db, state := openExecuteQueryFakeDB(t, 1, 2, 3)
	defer db.Close()

	state.nextErrAt = 2

	stream, err := (&Postgres{}).ExecuteQuery(context.Background(), db, engine.ExecuteQueryParams{Statement: "select n", RowLimit: 2, Timeout: time.Second})
	require.NoError(t, err)

	var rows int
	for stream.Next() {
		rows++
	}

	require.Equal(t, 2, rows)
	require.Error(t, stream.Err(), "error encountered while probing for truncation must surface")
	require.False(t, stream.Stats().Truncated, "failed truncation probe is an error, not a clean truncation")
}

func TestExecuteQueryStreamExactLimitNotTruncated(t *testing.T) {
	t.Parallel()

	db, _ := openExecuteQueryFakeDB(t, 1, 2)
	defer db.Close()

	stream, err := (&Postgres{}).ExecuteQuery(context.Background(), db, engine.ExecuteQueryParams{Statement: "select n", RowLimit: 2, Timeout: time.Second})
	require.NoError(t, err)

	var rows int
	for stream.Next() {
		rows++
	}

	require.NoError(t, stream.Err())
	require.Equal(t, 2, rows)
	require.False(t, stream.Stats().Truncated)
}
