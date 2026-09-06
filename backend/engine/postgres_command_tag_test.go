package engine

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCommandTagTracerRecordsIntoSink(t *testing.T) {
	t.Parallel()

	ctx, sink := WithCommandTagSink(context.Background())
	tracer := commandTagTracer{}

	_, ok := sink.Tag()
	assert.False(t, ok, "sink must start empty")

	ctx = tracer.TraceQueryStart(ctx, nil, pgx.TraceQueryStartData{SQL: "SELECT 1"})
	tracer.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{CommandTag: pgconn.NewCommandTag("SELECT 42")})

	tag, ok := sink.Tag()
	require.True(t, ok)
	assert.Equal(t, "SELECT 42", tag.String())
	assert.Equal(t, int64(42), tag.RowsAffected())
}

func TestCommandTagTracerIgnoresContextsWithoutSink(t *testing.T) {
	t.Parallel()

	tracer := commandTagTracer{}
	ctx := tracer.TraceQueryStart(context.Background(), nil, pgx.TraceQueryStartData{SQL: "SET x = 1"})

	assert.NotPanics(t, func() {
		tracer.TraceQueryEnd(ctx, nil, pgx.TraceQueryEndData{CommandTag: pgconn.NewCommandTag("SET")})
	})
}

func TestCommandTagSinkNilIsEmpty(t *testing.T) {
	t.Parallel()

	var sink *CommandTagSink

	_, ok := sink.Tag()
	assert.False(t, ok)
}
