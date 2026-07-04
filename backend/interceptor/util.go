package interceptor

import "connectrpc.com/connect"

// code returns the code based on an error.
// If error is nil the code is ok.
func code(err error) string {
	if err == nil {
		return "ok"
	}

	return connect.CodeOf(err).String()
}

// streamType returns a string for the connect.StreamType.
func streamType(t connect.StreamType) string {
	switch t {
	case connect.StreamTypeUnary:
		return "unary"
	case connect.StreamTypeClient:
		return "client_stream"
	case connect.StreamTypeServer:
		return "server_stream"
	case connect.StreamTypeBidi:
		return "bidi_stream"
	default:
		return "unknown"
	}
}
