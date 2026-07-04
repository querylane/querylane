package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

type readRowsFakeDriver struct{ state *readRowsFakeState }

type readRowsFakeState struct{ rows [][]driver.Value }

type readRowsFakeConn struct{ state *readRowsFakeState }

type readRowsFakeRows struct {
	state *readRowsFakeState
	idx   int
}

var readRowsFakeDriverSeq atomic.Int64

func openReadRowsFakeDB(t *testing.T, rows ...[]driver.Value) *sql.DB {
	t.Helper()

	name := fmt.Sprintf("querylane_read_rows_fake_%d", readRowsFakeDriverSeq.Add(1))
	sql.Register(name, &readRowsFakeDriver{state: &readRowsFakeState{rows: rows}})
	db, err := sql.Open(name, "")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)

	return db
}

func (d *readRowsFakeDriver) Open(string) (driver.Conn, error) {
	return &readRowsFakeConn{state: d.state}, nil
}

func (c *readRowsFakeConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c *readRowsFakeConn) Close() error { return nil }
func (c *readRowsFakeConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions unsupported")
}

func (c *readRowsFakeConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return &readRowsFakeRows{state: c.state}, nil
}

func (r *readRowsFakeRows) Columns() []string { return []string{"id", "id__qlcursor"} }
func (r *readRowsFakeRows) Close() error      { return nil }
func (r *readRowsFakeRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.state.rows) {
		return io.EOF
	}

	copy(dest, r.state.rows[r.idx])
	r.idx++

	return nil
}

func TestRowReaderCollectScansPublicRowsAndCursorValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name                 string
		rows                 [][]driver.Value
		maxResponseBytes     int64
		wantRows             []int64
		wantCursors          []int64
		wantBudgetCutoff     bool
		wantCollectsPageSize bool
	}{
		{
			name: "reads page size plus one with cursor values",
			rows: [][]driver.Value{
				{int64(1), int64(1)},
				{int64(2), int64(2)},
				{int64(3), int64(3)},
			},
			wantRows:             []int64{1, 2},
			wantCursors:          []int64{1, 2},
			wantCollectsPageSize: true,
		},
		{
			name: "force includes oversized first row and marks budget cutoff",
			rows: [][]driver.Value{
				{int64(1), int64(1)},
				{int64(2), int64(2)},
			},
			maxResponseBytes: 1,
			wantRows:         []int64{1},
			wantCursors:      []int64{1},
			wantBudgetCutoff: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db := openReadRowsFakeDB(t, tt.rows...)
			defer db.Close()

			rows, err := db.QueryContext(context.Background(), "select id, id as id__qlcursor")
			require.NoError(t, err)

			defer rows.Close()

			idCol := engine.Column{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER, RawType: "int8"}
			plan := &paginationPlan{
				publicColumns: []engine.Column{idCol},
				cursorColumns: []engine.Column{idCol},
			}
			reader := newRowReader(
				newTestPostgres(t),
				engine.ReadRowsParams{ResourceName: "instances/i/databases/d/schemas/public/tables/t"},
				plan,
				buildResultColumnsForPlan(plan),
				&api.RowIdentity{Source: api.RowIdentity_SOURCE_PRIMARY_KEY, ColumnNames: []string{"id"}},
				1,
				tt.maxResponseBytes,
			)

			scan, err := reader.collect(rows)
			require.NoError(t, err)
			assert.Len(t, scan.rows, len(tt.wantRows))
			assert.Len(t, scan.cursors, len(tt.wantCursors))
			assert.Equal(t, tt.wantBudgetCutoff, scan.budgetCutoff)

			if tt.wantCollectsPageSize {
				assert.Len(t, scan.rows, 2, "collect reads pageSize+1 rows to detect a following page")
			}

			for i, want := range tt.wantRows {
				if assert.Len(t, scan.rows[i].GetValues(), 1) {
					assert.Equal(t, want, scan.rows[i].GetValues()[0].GetValue().GetInt64Value())
				}
			}

			for i, want := range tt.wantCursors {
				if assert.Len(t, scan.cursors[i], 1) {
					assert.Equal(t, want, scan.cursors[i][0].GetInt64Value())
				}
			}
		})
	}
}
