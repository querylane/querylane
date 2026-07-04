package interceptor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubRequest embeds a real *connect.Request so it satisfies the unexported
// methods of connect.AnyRequest while letting tests control the Spec, which
// connect only populates on real client/handler invocations.
type stubRequest struct {
	*connect.Request[struct{}]

	spec connect.Spec
}

func (s *stubRequest) Spec() connect.Spec { return s.spec }

func newStubRequest(spec connect.Spec) *stubRequest {
	return &stubRequest{Request: connect.NewRequest(&struct{}{}), spec: spec}
}

func TestAccessLoggerWrapUnaryLogsServerRequests(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	req := newStubRequest(connect.Spec{
		Procedure:  "/querylane.console.v1alpha1.InstanceService/GetInstance",
		StreamType: connect.StreamTypeUnary,
	})
	req.Header().Set("X-Request-ID", "req-123")

	wantResp := connect.NewResponse(&struct{}{})
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		return wantResp, nil
	}

	resp, err := NewAccessLoggerInterceptor(logger).WrapUnary(next)(t.Context(), req)
	require.NoError(t, err)
	assert.Same(t, wantResp, resp)

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	assert.Equal(t, "access", entry["log_type"])
	assert.Equal(t, "querylane.console.v1alpha1.InstanceService", entry["service"])
	assert.Equal(t, "GetInstance", entry["request_method"])
	assert.Equal(t, "ok", entry["status_code"])
	assert.Equal(t, "unary", entry["stream_type"])
	assert.Equal(t, "req-123", entry["request_id"])
}

func TestAccessLoggerWrapUnaryLogsErrorCode(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	req := newStubRequest(connect.Spec{
		Procedure:  "/querylane.console.v1alpha1.InstanceService/GetInstance",
		StreamType: connect.StreamTypeUnary,
	})

	wantErr := connect.NewError(connect.CodeNotFound, errors.New("instance not found"))
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		return nil, wantErr
	}

	resp, err := NewAccessLoggerInterceptor(logger).WrapUnary(next)(t.Context(), req)
	require.ErrorIs(t, err, wantErr, "interceptor must propagate the handler error")
	assert.Nil(t, resp)

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	assert.Equal(t, "not_found", entry["status_code"])
}

func TestAccessLoggerWrapUnarySkipsClientCalls(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	req := newStubRequest(connect.Spec{
		Procedure:  "/querylane.console.v1alpha1.InstanceService/GetInstance",
		StreamType: connect.StreamTypeUnary,
		IsClient:   true,
	})

	wantResp := connect.NewResponse(&struct{}{})
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		return wantResp, nil
	}

	resp, err := NewAccessLoggerInterceptor(logger).WrapUnary(next)(t.Context(), req)
	require.NoError(t, err)
	assert.Same(t, wantResp, resp)
	assert.Empty(t, buf.String(), "client-side calls must not produce access logs")
}

func TestAccessLoggerWrapUnaryRejectsMalformedProcedure(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer

	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	req := newStubRequest(connect.Spec{
		Procedure:  "malformed-procedure",
		StreamType: connect.StreamTypeUnary,
	})

	nextCalled := false
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		nextCalled = true
		return nil, nil //nolint:nilnil // stub never reached; the interceptor must short-circuit
	}

	resp, err := NewAccessLoggerInterceptor(logger).WrapUnary(next)(t.Context(), req)
	require.Error(t, err)
	assert.Equal(t, connect.CodeInternal, connect.CodeOf(err))
	assert.Nil(t, resp)
	assert.False(t, nextCalled, "malformed procedures must short-circuit before the handler")
	assert.Empty(t, buf.String())
}

func TestAccessLoggerWrapStreamingClientPassesThrough(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.DiscardHandler)

	called := false
	next := connect.StreamingClientFunc(func(_ context.Context, _ connect.Spec) connect.StreamingClientConn {
		called = true
		return nil
	})

	wrapped := NewAccessLoggerInterceptor(logger).WrapStreamingClient(next)
	conn := wrapped(t.Context(), connect.Spec{})

	assert.Nil(t, conn)
	assert.True(t, called, "WrapStreamingClient must delegate to next unchanged")
}

func TestAccessLoggerWrapStreamingHandlerPassesThrough(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.DiscardHandler)

	wantErr := errors.New("handler failed")
	next := connect.StreamingHandlerFunc(func(_ context.Context, _ connect.StreamingHandlerConn) error {
		return wantErr
	})

	wrapped := NewAccessLoggerInterceptor(logger).WrapStreamingHandler(next)
	err := wrapped(t.Context(), nil)

	require.ErrorIs(t, err, wantErr, "WrapStreamingHandler must delegate to next unchanged")
}
