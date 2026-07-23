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

type readRowsFakeState struct {
	cols []string
	rows [][]driver.Value
}

type readRowsFakeConn struct{ state *readRowsFakeState }

type readRowsFakeRows struct {
	state *readRowsFakeState
	idx   int
}

var readRowsFakeDriverSeq atomic.Int64

func openReadRowsFakeDB(t *testing.T, rows ...[]driver.Value) *sql.DB {
	t.Helper()

	return openReadRowsFakeDBCols(t, []string{"id", "id__qlcursor"}, rows...)
}

func openReadRowsFakeDBCols(t *testing.T, cols []string, rows ...[]driver.Value) *sql.DB {
	t.Helper()

	name := fmt.Sprintf("querylane_read_rows_fake_%d", readRowsFakeDriverSeq.Add(1))
	sql.Register(name, &readRowsFakeDriver{state: &readRowsFakeState{cols: cols, rows: rows}})
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

func (r *readRowsFakeRows) Columns() []string { return r.state.cols }
func (r *readRowsFakeRows) Close() error      { return nil }
func (r *readRowsFakeRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.state.rows) {
		return io.EOF
	}

	copy(dest, r.state.rows[r.idx])
	r.idx++

	return nil
}

// TestRowReaderScanOne_ByteaZeroPreview confirms the scanner turns a
// zero-byte bytea preview (empty cell + positive __qlsize companion) into
// truncated=true + full_size_bytes + token, while genuinely empty and
// NULL bytea stay untruncated with no token.
func TestRowReaderScanOne_ByteaZeroPreview(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name          string
		row           []driver.Value // [id, blob, blob__qlsize, id__qlcursor]
		wantNull      bool
		wantTruncated bool
		wantFullSize  int64
		wantToken     bool
	}{
		{
			name:          "non_empty_bytea_gets_metadata_only",
			row:           []driver.Value{int64(1), []byte{}, int64(12345), int64(1)},
			wantTruncated: true,
			wantFullSize:  12345,
			wantToken:     true,
		},
		{
			name: "empty_bytea_ships_untruncated",
			row:  []driver.Value{int64(2), []byte{}, int64(0), int64(2)},
		},
		{
			name:     "null_bytea_stays_null",
			row:      []driver.Value{int64(3), nil, nil, int64(3)},
			wantNull: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			db := openReadRowsFakeDBCols(t, []string{"id", "blob", "blob__qlsize", "id__qlcursor"}, tc.row)
			defer db.Close()

			rows, err := db.QueryContext(context.Background(), "select preview projection")
			require.NoError(t, err)

			defer rows.Close()

			idCol := engine.Column{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER, RawType: "int8"}
			blobCol := engine.Column{Name: "blob", DataType: api.DataType_DATA_TYPE_BINARY, RawType: "bytea"}
			plan := &paginationPlan{
				publicColumns:  []engine.Column{idCol, blobCol},
				cursorColumns:  []engine.Column{idCol},
				previewMode:    true,
				previewMask:    []bool{false, true},
				previewColumns: []int{1},
			}
			reader := newRowReader(
				newTestPostgres(t),
				engine.ReadRowsParams{ResourceName: "instances/i/databases/d/schemas/public/tables/t"},
				plan,
				buildResultColumnsForPlan(plan),
				&api.RowIdentity{Source: api.RowIdentity_SOURCE_PRIMARY_KEY, ColumnNames: []string{"id"}},
				1,
				0,
			)

			scan, err := reader.collect(rows)
			require.NoError(t, err)
			require.Len(t, scan.rows, 1)

			cell := scan.rows[0].GetValues()[1]

			if tc.wantNull {
				_, isNull := cell.GetValue().GetKind().(*api.TableValue_NullValue)
				assert.True(t, isNull, "NULL bytea must stay a null value")
			} else {
				assert.Empty(t, cell.GetValue().GetBytesValue(), "preview must carry zero content bytes")
			}

			assert.Equal(t, tc.wantTruncated, cell.GetTruncated())
			assert.Equal(t, tc.wantFullSize, cell.GetFullSizeBytes())

			if tc.wantToken {
				assert.NotEmpty(t, cell.GetFullValueToken())
			} else {
				assert.Empty(t, cell.GetFullValueToken())
			}
		})
	}
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
