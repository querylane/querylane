package engine

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"
)

const (
	postgresNoticeCollectorKey = "querylane.postgres.notice_collector"
	maxPostgresNotices         = 100
	maxPostgresNoticeBytes     = 4096
	truncatedNoticeSuffix      = "…"
)

// ErrPostgresNoticeCaptureUnsupported is returned when a *sql.DB is not backed
// by pgx stdlib, so Querylane cannot attach a per-request notice collector.
var ErrPostgresNoticeCaptureUnsupported = errors.New("postgres notice capture requires pgx stdlib")

// OpenPostgresDB opens a database/sql pool backed by pgx stdlib and installs
// Querylane's notice router on every physical connection. Individual requests
// opt into capture with BeginPostgresNoticeSession, so pooled connections do
// not share notices across requests. The router is always attached, but it is
// a no-op while no request-local collector is installed.
func OpenPostgresDB(dsn string) (*sql.DB, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse postgres connection config: %w", err)
	}

	cfg.OnNotice = routePostgresNotice

	return stdlib.OpenDB(*cfg, stdlib.OptionAfterConnect(func(_ context.Context, conn *pgx.Conn) error {
		conn.PgConn().CustomData()[postgresNoticeCollectorKey] = &postgresNoticeSlot{}

		return nil
	})), nil
}

// PostgresNoticeSession reserves one database/sql connection and attaches a
// request-local notice collector to the underlying pgx connection.
type PostgresNoticeSession struct {
	conn      *sql.Conn
	collector *postgresNoticeCollector
}

// BeginPostgresNoticeSession reserves a pooled connection and routes PostgreSQL
// notices emitted on that connection into a request-local collector.
func BeginPostgresNoticeSession(ctx context.Context, db *sql.DB) (*PostgresNoticeSession, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, err
	}

	collector := &postgresNoticeCollector{}
	if err := installPostgresNoticeCollector(conn, collector); err != nil {
		_ = conn.Close()
		return nil, err
	}

	return &PostgresNoticeSession{
		conn:      conn,
		collector: collector,
	}, nil
}

// Conn returns the reserved database/sql connection for the request.
func (s *PostgresNoticeSession) Conn() *sql.Conn {
	return s.conn
}

// Notices returns the notices captured so far.
func (s *PostgresNoticeSession) Notices() []string {
	if s == nil || s.collector == nil {
		return nil
	}

	return s.collector.snapshot()
}

// Close detaches the collector and returns the reserved connection to the pool.
func (s *PostgresNoticeSession) Close() error {
	if s == nil || s.conn == nil {
		return nil
	}

	clearErr := clearPostgresNoticeCollector(s.conn)
	closeErr := s.conn.Close()
	s.conn = nil

	return errors.Join(clearErr, closeErr)
}

type postgresNoticeCollector struct {
	mu      sync.Mutex
	notices []string
	omitted int
}

func (c *postgresNoticeCollector) add(notice *pgconn.Notice) {
	if c == nil || notice == nil {
		return
	}

	formatted := formatPostgresNotice(notice)
	if formatted == "" {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.notices) < maxPostgresNotices {
		c.notices = append(c.notices, formatted)
		return
	}

	c.omitted++
}

func (c *postgresNoticeCollector) snapshot() []string {
	if c == nil {
		return nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	notices := append([]string(nil), c.notices...)
	if c.omitted > 0 {
		notices = append(notices, fmt.Sprintf("QUERYLANE_NOTICE_TRUNCATED: %d additional database notices omitted", c.omitted))
	}

	return notices
}

func routePostgresNotice(pgConn *pgconn.PgConn, notice *pgconn.Notice) {
	if pgConn == nil {
		return
	}

	slot, ok := pgConn.CustomData()[postgresNoticeCollectorKey].(*postgresNoticeSlot)
	if !ok {
		return
	}

	slot.add(notice)
}

type postgresNoticeSlot struct {
	mu        sync.Mutex
	collector *postgresNoticeCollector
}

func (s *postgresNoticeSlot) set(collector *postgresNoticeCollector) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.collector = collector
}

func (s *postgresNoticeSlot) add(notice *pgconn.Notice) {
	s.mu.Lock()
	collector := s.collector
	s.mu.Unlock()

	if collector == nil {
		return
	}

	collector.add(notice)
}

func installPostgresNoticeCollector(conn *sql.Conn, collector *postgresNoticeCollector) error {
	return conn.Raw(func(driverConn any) error {
		stdlibConn, ok := driverConn.(*stdlib.Conn)
		if !ok {
			return ErrPostgresNoticeCaptureUnsupported
		}

		slot, ok := stdlibConn.Conn().PgConn().CustomData()[postgresNoticeCollectorKey].(*postgresNoticeSlot)
		if !ok {
			return ErrPostgresNoticeCaptureUnsupported
		}

		slot.set(collector)

		return nil
	})
}

func clearPostgresNoticeCollector(conn *sql.Conn) error {
	return conn.Raw(func(driverConn any) error {
		stdlibConn, ok := driverConn.(*stdlib.Conn)
		if !ok {
			return ErrPostgresNoticeCaptureUnsupported
		}

		slot, ok := stdlibConn.Conn().PgConn().CustomData()[postgresNoticeCollectorKey].(*postgresNoticeSlot)
		if !ok {
			return ErrPostgresNoticeCaptureUnsupported
		}

		slot.set(nil)

		return nil
	})
}

func formatPostgresNotice(notice *pgconn.Notice) string {
	message := normalizeNoticeField(notice.Message)
	if message == "" {
		message = "database notice"
	}

	severity := normalizeNoticeField(notice.SeverityUnlocalized)
	if severity == "" {
		severity = normalizeNoticeField(notice.Severity)
	}

	code := normalizeNoticeField(notice.Code)

	var headline string

	switch {
	case severity != "" && code != "":
		headline = fmt.Sprintf("%s %s: %s", severity, code, message)
	case severity != "":
		headline = fmt.Sprintf("%s: %s", severity, message)
	case code != "":
		headline = fmt.Sprintf("%s: %s", code, message)
	default:
		headline = message
	}

	return truncateNotice(strings.Join(appendNoticeFields([]string{headline}, notice), "\n"))
}

func appendNoticeFields(lines []string, notice *pgconn.Notice) []string {
	addString := func(label, value string) {
		value = normalizeNoticeField(value)
		if value != "" {
			lines = append(lines, label+": "+value)
		}
	}
	addInt32 := func(label string, value int32) {
		if value > 0 {
			lines = append(lines, label+": "+strconv.Itoa(int(value)))
		}
	}

	addString("DETAIL", notice.Detail)
	addString("HINT", notice.Hint)
	addInt32("POSITION", notice.Position)
	addString("WHERE", notice.Where)

	return lines
}

func normalizeNoticeField(value string) string {
	return strings.TrimSpace(value)
}

func truncateNotice(value string) string {
	if len(value) <= maxPostgresNoticeBytes {
		return value
	}

	cut := maxPostgresNoticeBytes - len(truncatedNoticeSuffix)
	if cut <= 0 {
		return truncatedNoticeSuffix
	}

	for cut > 0 && !utf8.RuneStart(value[cut]) {
		cut--
	}

	return strings.TrimSpace(value[:cut]) + truncatedNoticeSuffix
}
