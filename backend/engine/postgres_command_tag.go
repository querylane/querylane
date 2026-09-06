package engine

import (
	"context"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type commandTagSinkKey struct{}

// CommandTagSink receives the command tag PostgreSQL reports when a query's
// result is closed ("SELECT 42", "SET", "UPDATE 3"). database/sql drops the
// tag for Query calls, so callers that need it attach a sink to the context
// they query with and the pool-wide tracer installed by OpenPostgresDB fills
// it in.
type CommandTagSink struct {
	mu  sync.Mutex
	tag pgconn.CommandTag
	set bool
}

// WithCommandTagSink returns a context that captures the command tag of the
// next pgx query executed with it, and the sink that will hold it.
func WithCommandTagSink(ctx context.Context) (context.Context, *CommandTagSink) {
	sink := &CommandTagSink{}

	return context.WithValue(ctx, commandTagSinkKey{}, sink), sink
}

// Tag returns the captured command tag and whether a query reported one.
func (s *CommandTagSink) Tag() (pgconn.CommandTag, bool) {
	if s == nil {
		return pgconn.CommandTag{}, false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.tag, s.set
}

func (s *CommandTagSink) record(tag pgconn.CommandTag) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tag = tag
	s.set = true
}

// commandTagTracer is a pgx.QueryTracer that only reports command tags into a
// CommandTagSink carried by the query context. It is a no-op for every other
// query.
type commandTagTracer struct{}

func (commandTagTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	return ctx
}

func (commandTagTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	sink, ok := ctx.Value(commandTagSinkKey{}).(*CommandTagSink)
	if !ok {
		return
	}

	sink.record(data.CommandTag)
}
