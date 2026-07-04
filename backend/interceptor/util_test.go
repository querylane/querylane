package interceptor

import (
	"errors"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
)

func TestCode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
		want string
	}{
		{name: "nil error is ok", err: nil, want: "ok"},
		{name: "connect error reports its code", err: connect.NewError(connect.CodeNotFound, errors.New("missing")), want: "not_found"},
		{name: "plain error is unknown", err: errors.New("boom"), want: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, code(tt.err))
		})
	}
}

func TestStreamType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		typ  connect.StreamType
		want string
	}{
		{name: "unary", typ: connect.StreamTypeUnary, want: "unary"},
		{name: "client stream", typ: connect.StreamTypeClient, want: "client_stream"},
		{name: "server stream", typ: connect.StreamTypeServer, want: "server_stream"},
		{name: "bidi stream", typ: connect.StreamTypeBidi, want: "bidi_stream"},
		{name: "unrecognized value", typ: connect.StreamType(99), want: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, streamType(tt.typ))
		})
	}
}
