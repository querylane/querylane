package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// newSchemaListHandler mounts a minimal unary Connect handler that echoes a
// response whose size is driven by the request, using the shared handler
// options so the compression threshold under test is exercised end to end.
func newSchemaListHandler(t *testing.T, payloadBytes int) http.Handler {
	t.Helper()

	mux := http.NewServeMux()
	mux.Handle(
		"/test.v1.SchemaService/ListSchemas",
		connect.NewUnaryHandler(
			"/test.v1.SchemaService/ListSchemas",
			func(_ context.Context, _ *connect.Request[api.GetSchemaRequest]) (*connect.Response[api.ListSchemasResponse], error) {
				return connect.NewResponse(&api.ListSchemasResponse{
					NextPageToken: strings.Repeat("a", payloadBytes),
				}), nil
			},
			handlerOptions()...,
		),
	)

	return mux
}

func postConnect(t *testing.T, server *httptest.Server) *http.Response {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		server.URL+"/test.v1.SchemaService/ListSchemas",
		strings.NewReader("{}"),
	)
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")
	// Advertise gzip the way connect-go's own client does, so the handler is
	// allowed to compress the response.
	req.Header.Set("Accept-Encoding", "gzip")

	// DisableCompression keeps net/http from transparently decompressing the
	// body, so the raw Content-Encoding header survives for assertion.
	client := server.Client()
	transport, ok := client.Transport.(*http.Transport)
	require.True(t, ok, "httptest client should use *http.Transport")

	transport = transport.Clone()
	transport.DisableCompression = true
	client.Transport = transport

	resp, err := client.Do(req)
	require.NoError(t, err)

	return resp
}

func TestHandlerOptions_CompressesLargeResponses(t *testing.T) {
	t.Parallel()

	// Payload comfortably above the 1KiB compression threshold.
	server := httptest.NewServer(newSchemaListHandler(t, 4096))
	t.Cleanup(server.Close)

	resp := postConnect(t, server)
	t.Cleanup(func() { _ = resp.Body.Close() })

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "gzip", resp.Header.Get("Content-Encoding"),
		"responses larger than the compression threshold should be gzip encoded")
}

func TestHandlerOptions_SkipsSmallResponses(t *testing.T) {
	t.Parallel()

	// Payload well below the 1KiB threshold; compressing it wastes CPU.
	server := httptest.NewServer(newSchemaListHandler(t, 8))
	t.Cleanup(server.Close)

	resp := postConnect(t, server)
	t.Cleanup(func() { _ = resp.Body.Close() })

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Empty(t, resp.Header.Get("Content-Encoding"),
		"responses below the compression threshold should be sent uncompressed")
}
