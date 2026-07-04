package interceptor

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"connectrpc.com/connect"
)

var _ connect.Interceptor = (*AccessLogger)(nil)

// AccessLogger implements the connect-go interceptor interface
// in order to print access logs for each new request.
type AccessLogger struct {
	logger *slog.Logger
}

// NewAccessLoggerInterceptor creates a new interceptor for printing access
// logs to stdout.
func NewAccessLoggerInterceptor(logger *slog.Logger) *AccessLogger {
	return &AccessLogger{logger: logger}
}

// WrapUnary inspects the request details, executes the request and then prints
// access logs for each request.
func (a *AccessLogger) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		spec := req.Spec()

		procedure := strings.Split(spec.Procedure, "/")
		if len(procedure) != 3 {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("procedure in prometheus interceptor malformed: %s", spec.Procedure),
			)
		}

		service, method := procedure[1], procedure[2]
		start := time.Now()

		// Execute the actual request.
		resp, err := next(ctx, req)

		duration := time.Since(start)

		if spec.IsClient {
			return resp, err
		}

		a.logger.InfoContext(ctx,
			"",
			slog.String("log_type", "access"),
			slog.String("remote_address", req.Peer().Addr),
			slog.Duration("response_time", duration),
			slog.String("request_method", method),
			slog.String("service", service),
			slog.String("status_code", code(err)),
			slog.String("stream_type", streamType(spec.StreamType)),
			slog.String("request_id", req.Header().Get("X-Request-ID")),
		)

		return resp, err
	}
}

// WrapStreamingClient implements [Interceptor] with a no-op.
func (*AccessLogger) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// WrapStreamingHandler implements [Interceptor] with a no-op.
func (*AccessLogger) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
