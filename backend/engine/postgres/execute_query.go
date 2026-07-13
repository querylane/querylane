package postgres

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

type txBeginner interface {
	BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error)
}

func beginNoticeCapture(ctx context.Context, db *sql.DB) (txBeginner, *engine.PostgresNoticeSession, error) {
	session, err := engine.BeginPostgresNoticeSession(ctx, db)
	if err == nil {
		return session.Conn(), session, nil
	}

	if errors.Is(err, engine.ErrPostgresNoticeCaptureUnsupported) {
		return db, nil, nil
	}

	return nil, nil, err
}

func closeNoticeSession(session *engine.PostgresNoticeSession) {
	// Error paths already have a primary failure; notice capture cleanup is
	// best-effort so it does not hide the query error.
	_ = session.Close()
}

// ExecuteQuery runs an ad-hoc SQL statement provided by the user and
// returns a streaming cursor (queryStream) over the results. The
// transaction is read-only and is closed when the stream is Close()d.
func (*Postgres) ExecuteQuery(ctx context.Context, db *sql.DB, params engine.ExecuteQueryParams) (engine.ExecuteQueryStream, error) {
	queryConn, noticeSession, err := beginNoticeCapture(ctx, db)
	if err != nil {
		return nil, classifyQueryError("capture query notices", err)
	}

	tx, err := queryConn.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		closeNoticeSession(noticeSession)
		return nil, classifyQueryError("begin read-only tx", err)
	}

	if err := setStatementTimeout(ctx, tx, params.Timeout); err != nil {
		_ = tx.Rollback()

		closeNoticeSession(noticeSession)

		return nil, err
	}

	if params.DefaultSchema != "" {
		if _, err := tx.ExecContext(ctx, "SET LOCAL search_path = "+quoteIdent(params.DefaultSchema)); err != nil {
			_ = tx.Rollback()

			closeNoticeSession(noticeSession)

			return nil, classifyQueryError("set search_path", err)
		}
	}

	start := time.Now()

	rows, err := tx.QueryContext(ctx, params.Statement)
	if err != nil {
		_ = tx.Rollback()

		closeNoticeSession(noticeSession)

		return nil, classifyQueryError("execute query", err)
	}

	columns, err := buildResultColumns(rows)
	if err != nil {
		_ = rows.Close() //nolint:sqlclosecheck // rows ownership transfers to queryStream on success; close is only for this error path
		_ = tx.Rollback()

		closeNoticeSession(noticeSession)

		return nil, err
	}

	return &queryStream{
		rows:     rows,
		tx:       tx,
		columns:  columns,
		rowLimit: params.RowLimit,
		start:    start,
		notices:  noticeSession,
	}, nil
}

// ExplainQuery wraps an EXPLAIN around the user's statement, joins the
// returned plan lines into a single string, and reports total latency.
func (*Postgres) ExplainQuery(ctx context.Context, db *sql.DB, params engine.ExplainQueryParams) (*engine.ExplainQueryResult, error) {
	queryConn, noticeSession, err := beginNoticeCapture(ctx, db)
	if err != nil {
		return nil, classifyQueryError("capture explain notices", err)
	}
	defer closeNoticeSession(noticeSession)

	tx, err := queryConn.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, classifyQueryError("begin read-only tx", err)
	}
	defer tx.Rollback() //nolint:errcheck // read-only tx cleanup is best-effort

	if err := setStatementTimeout(ctx, tx, params.Timeout); err != nil {
		return nil, err
	}

	if params.DefaultSchema != "" {
		if _, err := tx.ExecContext(ctx, "SET LOCAL search_path = "+quoteIdent(params.DefaultSchema)); err != nil {
			return nil, classifyQueryError("set search_path", err)
		}
	}

	start := time.Now()

	rows, err := tx.QueryContext(ctx, buildExplainStatement(params))
	if err != nil {
		return nil, classifyQueryError("explain query", err)
	}
	defer rows.Close()

	var planLines []string

	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return nil, classifyQueryError("scan explain", err)
		}

		planLines = append(planLines, line)
	}

	if err := rows.Err(); err != nil {
		return nil, classifyQueryError("explain rows", err)
	}

	return &engine.ExplainQueryResult{
		Plan:    strings.Join(planLines, "\n"),
		Notices: noticeSession.Notices(),
		Latency: time.Since(start),
	}, nil
}

// queryStream is the engine.ExecuteQueryStream returned by ExecuteQuery.
// It owns the underlying *sql.Rows and *sql.Tx and releases both on Close.
type queryStream struct {
	rows       *sql.Rows
	tx         *sql.Tx
	columns    []*api.TableResultColumn
	rowLimit   int
	rowCount   int64
	truncated  bool
	start      time.Time
	currentRow *api.TableResultRow
	stats      engine.ExecuteQueryStats
	notices    *engine.PostgresNoticeSession
	err        error
	closed     bool
	finalized  bool
}

func (s *queryStream) Columns() []*api.TableResultColumn {
	return s.columns
}

func (s *queryStream) Next() bool {
	if s.err != nil || s.closed || s.finalized {
		return false
	}

	if s.rowLimit > 0 && int(s.rowCount) >= s.rowLimit {
		s.detectTruncation()
		s.finalize()

		return false
	}

	if !s.rows.Next() {
		if err := s.rows.Err(); err != nil {
			s.err = classifyQueryError("stream rows", err)
		}

		s.finalize()

		return false
	}

	row, err := scanResultRow(s.rows, s.columns)
	if err != nil {
		s.err = err
		s.finalize()

		return false
	}

	s.currentRow = row
	s.rowCount++

	return true
}

func (s *queryStream) Row() *api.TableResultRow {
	return s.currentRow
}

func (s *queryStream) Err() error {
	return s.err
}

func (s *queryStream) Stats() engine.ExecuteQueryStats {
	return s.stats
}

func (s *queryStream) Close() error {
	s.finalize()
	return s.err
}

func (s *queryStream) detectTruncation() {
	if s.rows.Next() {
		s.truncated = true
		return
	}

	if err := s.rows.Err(); err != nil {
		s.err = classifyQueryError("stream rows", err)
	}
}

func (s *queryStream) finalize() {
	if s.finalized {
		return
	}

	s.finalized = true
	latency := time.Since(s.start)
	notices := s.notices.Notices()
	s.closeResources()

	s.stats = engine.ExecuteQueryStats{
		RowCount:  s.rowCount,
		Latency:   latency,
		Notices:   notices,
		Truncated: s.truncated,
	}
}

func (s *queryStream) closeResources() {
	if s.closed {
		return
	}

	s.closed = true

	if s.rows != nil {
		if err := s.rows.Close(); err != nil && s.err == nil {
			s.err = classifyQueryError("close rows", err)
		}
	}

	if s.tx != nil {
		if err := s.tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) && s.err == nil {
			s.err = classifyQueryError("rollback tx", err)
		}
	}

	if err := s.notices.Close(); err != nil && s.err == nil {
		s.err = classifyQueryError("close notice capture", err)
	}
}

// buildResultColumns reads column metadata off rows for ExecuteQuery,
// where there is no caller-supplied catalog to fall back on. ReadRows uses
// buildResultColumnsForPlan instead, since the plan already knows the
// projection's data types.
func buildResultColumns(rows *sql.Rows) ([]*api.TableResultColumn, error) {
	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		return nil, classifyQueryError("column types", err)
	}

	resultColumns := make([]*api.TableResultColumn, len(columnTypes))
	for i, ct := range columnTypes {
		nullable, _ := ct.Nullable()
		rawType := ct.DatabaseTypeName()
		resultColumns[i] = &api.TableResultColumn{
			ColumnName: ct.Name(),
			// database/sql exposes no array flag here; the driver reports array
			// columns as element types (e.g. "_text"), so they classify as UNKNOWN.
			DataType:   pgTypeToDataType(rawType, false),
			RawType:    rawType,
			IsNullable: nullable,
		}
	}

	return resultColumns, nil
}

func scanResultRow(rows *sql.Rows, columns []*api.TableResultColumn) (*api.TableResultRow, error) {
	values := make([]any, len(columns))
	for i := range values {
		values[i] = new(any)
	}

	if err := rows.Scan(values...); err != nil {
		return nil, classifyQueryError("scan row", err)
	}

	cells := make([]*api.TableCell, len(values))
	for i, v := range values {
		ptr, _ := v.(*any)
		cells[i] = &api.TableCell{Value: convertToValueTyped(*ptr, columns[i])}
	}

	return &api.TableResultRow{Values: cells}, nil
}

func buildExplainStatement(params engine.ExplainQueryParams) string {
	var opts []string

	switch params.Format {
	case api.ExplainQueryRequest_FORMAT_JSON:
		opts = append(opts, "FORMAT JSON")
	case api.ExplainQueryRequest_FORMAT_YAML:
		opts = append(opts, "FORMAT YAML")
	case api.ExplainQueryRequest_FORMAT_TEXT, api.ExplainQueryRequest_FORMAT_UNSPECIFIED:
		opts = append(opts, "FORMAT TEXT")
	}

	if params.Analyze {
		opts = append(opts, "ANALYZE")
	}

	if params.Buffers {
		opts = append(opts, "BUFFERS")
	}

	var b strings.Builder
	b.WriteString("EXPLAIN")

	if len(opts) > 0 {
		b.WriteString(" (")
		b.WriteString(strings.Join(opts, ", "))
		b.WriteString(")")
	}

	b.WriteString(" ")
	b.WriteString(params.Statement)

	return b.String()
}
