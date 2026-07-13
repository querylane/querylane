package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

func TestDelegatingHandler_StreamRowsCompletesPastServerWriteTimeout(t *testing.T) {
	t.Parallel()

	for _, protocol := range testServerProtocols {
		t.Run(protocol.name, func(t *testing.T) {
			t.Parallel()

			body, err := readSlowResponse(t, consolev1alpha1connect.TableDataServiceStreamRowsProcedure, protocol)
			require.NoError(t, err)
			assert.Equal(t, "first batch\nfinal batch\n", string(body))
		})
	}
}

func TestDelegatingHandler_OtherRoutesKeepServerWriteTimeout(t *testing.T) {
	t.Parallel()

	for _, protocol := range testServerProtocols {
		t.Run(protocol.name, func(t *testing.T) {
			t.Parallel()

			body, err := readSlowResponse(t, "/querylane.console.v1alpha1.TableDataService/ReadRows", protocol)
			require.Error(t, err)
			assert.Equal(t, "first batch\n", string(body))
		})
	}
}

type testServerProtocol struct {
	name           string
	useHTTP2       bool
	wantProtoMajor int
}

var testServerProtocols = []testServerProtocol{
	{name: "HTTP/1.1", wantProtoMajor: 1},
	{name: "unencrypted HTTP/2", useHTTP2: true, wantProtoMajor: 2},
}

func readSlowResponse(t *testing.T, path string, protocol testServerProtocol) ([]byte, error) {
	t.Helper()

	const writeTimeout = 250 * time.Millisecond

	handler := &DelegatingHandler{}
	handler.Set(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if _, err := io.WriteString(w, "first batch\n"); err != nil {
			return
		}

		if err := http.NewResponseController(w).Flush(); err != nil {
			return
		}

		time.Sleep(writeTimeout + 100*time.Millisecond)

		if _, err := io.WriteString(w, "final batch\n"); err != nil {
			return
		}

		_ = http.NewResponseController(w).Flush()
	}))

	server := httptest.NewUnstartedServer(handler)
	server.Config.WriteTimeout = writeTimeout
	server.Config.Protocols = newHTTPServerProtocols()
	server.Start()
	t.Cleanup(server.Close)

	client := server.Client()

	if protocol.useHTTP2 {
		protocols := new(http.Protocols)
		protocols.SetUnencryptedHTTP2(true)
		transport := &http.Transport{Protocols: protocols}
		t.Cleanup(transport.CloseIdleConnections)
		client.Transport = transport
	}

	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, server.URL+path, http.NoBody)
	require.NoError(t, err)
	request.Header.Set("Content-Type", "application/proto")

	response, err := client.Do(request)
	require.NoError(t, err)
	t.Cleanup(func() { _ = response.Body.Close() })
	assert.Equal(t, protocol.wantProtoMajor, response.ProtoMajor)

	return io.ReadAll(response.Body)
}
