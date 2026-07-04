package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type queryInsightsTestDriver struct{}

type queryInsightsTestConn struct{}

type queryInsightsTestRows struct {
	columns []string
	rows    [][]driver.Value
	idx     int
}

var queryInsightsTestDriverSeq atomic.Int64

func openQueryInsightsTestDB(t *testing.T) *sql.DB {
	t.Helper()

	name := fmt.Sprintf("querylane_query_insights_%d", queryInsightsTestDriverSeq.Add(1))
	sql.Register(name, queryInsightsTestDriver{})
	db, err := sql.Open(name, "")
	require.NoError(t, err)
	db.SetMaxOpenConns(1)

	return db
}

func (d queryInsightsTestDriver) Open(string) (driver.Conn, error) {
	return queryInsightsTestConn{}, nil
}

func (c queryInsightsTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c queryInsightsTestConn) Close() error { return nil }
func (c queryInsightsTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions unsupported")
}

func (c queryInsightsTestConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	switch {
	case strings.Contains(query, "pg_stat_statements"):
		return &queryInsightsTestRows{
			columns: []string{"query_id", "query_text", "calls", "total_time_ms", "mean_time_ms", "total_time_ratio"},
			rows: [][]driver.Value{
				{int64(123), "SELECT * FROM events WHERE account_id = 'acct-secret'", int64(42), float64(840), float64(20), float64(1)},
				{int64(456), nil, int64(8), float64(210), float64(26.25), float64(0.25)},
			},
		}, nil
	case strings.Contains(query, "pg_statio_user_tables"):
		return &queryInsightsTestRows{
			columns: []string{
				"schema_name",
				"table_name",
				"heap_blocks_hit",
				"heap_blocks_read",
				"cache_hit_ratio",
				"total_size_bytes",
			},
			rows: [][]driver.Value{
				{"public", "cold_events", int64(100), int64(900), float64(0.1), int64(134_217_728)},
				{"public", "events", int64(900), int64(100), float64(0.9), int64(268_435_456)},
			},
		}, nil
	case strings.Contains(query, "pg_stat_user_tables"):
		return &queryInsightsTestRows{
			columns: []string{
				"schema_name",
				"table_name",
				"sequential_scans",
				"sequential_tuples_read",
				"index_scans",
				"estimated_live_rows",
				"total_size_bytes",
				"sequential_scan_ratio",
			},
			rows: [][]driver.Value{
				{"public", "events", int64(12), int64(120_000), int64(3), int64(50_000), int64(268_435_456), float64(0.8)},
			},
		}, nil
	default:
		return nil, fmt.Errorf("unexpected query: %s", query)
	}
}

func (r *queryInsightsTestRows) Columns() []string { return r.columns }
func (r *queryInsightsTestRows) Close() error      { return nil }

func (r *queryInsightsTestRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.rows) {
		return io.EOF
	}

	copy(dest, r.rows[r.idx])
	r.idx++

	return nil
}

func TestGetDatabaseQueryInsightsReturnsQueryAndTableStats(t *testing.T) {
	t.Parallel()

	db := openQueryInsightsTestDB(t)
	defer db.Close()

	insights, err := (&Postgres{}).GetDatabaseQueryInsights(context.Background(), db)

	require.NoError(t, err)
	require.NotNil(t, insights)
	assert.True(t, insights.QueryStatsAvailable)
	assert.True(t, insights.TableStatsAvailable)
	require.Len(t, insights.TopQueries, 2)
	assert.Equal(t, int64(123), insights.TopQueries[0].QueryID)
	assert.Equal(t, "SELECT * FROM events WHERE account_id = ?", insights.TopQueries[0].Query)
	assert.Equal(t, int64(42), insights.TopQueries[0].Calls)
	assert.InEpsilon(t, 840, insights.TopQueries[0].TotalTimeMs, 0.000001)
	assert.InEpsilon(t, 20, insights.TopQueries[0].MeanTimeMs, 0.000001)
	assert.InEpsilon(t, 1, insights.TopQueries[0].TotalTimeRatio, 0.000001)
	assert.Equal(t, int64(456), insights.TopQueries[1].QueryID)
	assert.Empty(t, insights.TopQueries[1].Query)
	require.Len(t, insights.SequentialScanHotspots, 1)
	assert.Equal(t, "public", insights.SequentialScanHotspots[0].SchemaName)
	assert.Equal(t, "events", insights.SequentialScanHotspots[0].TableName)
	assert.Equal(t, int64(120_000), insights.SequentialScanHotspots[0].SequentialTuplesRead)
	assert.InEpsilon(t, 0.8, insights.SequentialScanHotspots[0].SequentialScanRatio, 0.000001)
	require.Len(t, insights.TableCacheHits, 2)
	assert.Equal(t, "cold_events", insights.TableCacheHits[0].TableName)
	assert.Equal(t, int64(100), insights.TableCacheHits[0].HeapBlocksHit)
	assert.Equal(t, int64(900), insights.TableCacheHits[0].HeapBlocksRead)
	assert.InEpsilon(t, 0.1, insights.TableCacheHits[0].HitRatio, 0.000001)
	assert.Equal(t, "events", insights.TableCacheHits[1].TableName)
}

func TestTableInsightQueriesApplyTableVisibilityPredicate(t *testing.T) {
	t.Parallel()

	queries := map[string]string{
		"sequential scan hotspots": getTableQueryInsightsQuery,
		"cache hits":               getTableCacheHitInsightsQuery,
	}

	for name, query := range queries {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			assert.Contains(t, query, "pg_catalog.pg_has_role(c.relowner, 'USAGE')")
			assert.Contains(t, query, "pg_catalog.has_table_privilege(c.oid, 'SELECT')")
			assert.Contains(t, query, "pg_catalog.has_table_privilege(c.oid, 'TRIGGER')")
		})
	}
}

func TestTableQueryInsightsCoalescesMissingIndexScanStats(t *testing.T) {
	t.Parallel()

	assert.Contains(t, getTableQueryInsightsQuery, "COALESCE(stat.idx_scan, 0)::bigint AS index_scans")
	assert.Contains(t, getTableQueryInsightsQuery, "stat.seq_scan + COALESCE(stat.idx_scan, 0)")
}

func TestRedactQueryPreviewBoundsAndRedactsLiteralText(t *testing.T) {
	t.Parallel()

	preview := redactQueryPreview(sql.NullString{
		String: "SELECT * FROM accounts WHERE email = 'customer@example.com' AND account_id = $1",
		Valid:  true,
	})

	assert.Equal(t, "SELECT * FROM accounts WHERE email = ? AND account_id = $1", preview)
	assert.Empty(t, redactQueryPreview(sql.NullString{}))
}
