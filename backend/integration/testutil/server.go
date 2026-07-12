package testutil

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/cmd/server"
	"github.com/querylane/querylane/backend/config"
	"github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

// FindAvailablePort finds an available TCP port for testing.
func FindAvailablePort(t *testing.T) int {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0") //nolint:noctx // Test helper, context not needed for port discovery
	require.NoError(t, err, "failed to find available port")

	addr := listener.Addr()
	tcpAddr, ok := addr.(*net.TCPAddr)
	require.True(t, ok, "expected TCP address, got %T", addr)

	port := tcpAddr.Port

	err = listener.Close()
	require.NoError(t, err, "failed to close listener")

	return port
}

// IsServerReady checks if the server is accepting TCP connections.
func IsServerReady(serverURL string) bool {
	u, err := url.Parse(serverURL)
	if err != nil {
		return false
	}

	conn, err := net.Dial("tcp", u.Host) //nolint:noctx // Simple connectivity check in test helper
	if err != nil {
		return false
	}

	conn.Close()

	return true
}

// StartTestServer boots the full querylane server in a goroutine with the
// given config file. It waits for the server to be ready (TCP check) and
// returns the base URL (http://127.0.0.1:<port>).
func StartTestServer(t *testing.T, configFilePath string) string {
	t.Helper()

	port := FindAvailablePort(t)
	t.Setenv("QUERYLANE_HTTP_PORT", strconv.Itoa(port))
	t.Setenv("QUERYLANE_HTTP_HOST", "127.0.0.1")

	cmd := &server.StartCmd{Config: configFilePath}
	globals := &config.Globals{LogLevel: "warn"}

	go func() {
		_ = cmd.Run(globals)
	}()

	serverURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	require.Eventually(t, func() bool {
		return IsServerReady(serverURL)
	}, 15*time.Second, 100*time.Millisecond, "server should start")

	return serverURL
}

// httpClient returns an HTTP client with a reasonable timeout for RPC tests.
func httpClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Second}
}

// NewInstanceClient creates a ConnectRPC InstanceService client.
func NewInstanceClient(serverURL string) consolev1alpha1connect.InstanceServiceClient {
	return consolev1alpha1connect.NewInstanceServiceClient(httpClient(), serverURL)
}

// NewDatabaseClient creates a ConnectRPC DatabaseService client.
func NewDatabaseClient(serverURL string) consolev1alpha1connect.DatabaseServiceClient {
	return consolev1alpha1connect.NewDatabaseServiceClient(httpClient(), serverURL)
}

// NewSchemaClient creates a ConnectRPC SchemaService client.
func NewSchemaClient(serverURL string) consolev1alpha1connect.SchemaServiceClient {
	return consolev1alpha1connect.NewSchemaServiceClient(httpClient(), serverURL)
}

// NewExtensionClient creates a ConnectRPC ExtensionService client.
func NewExtensionClient(serverURL string) consolev1alpha1connect.ExtensionServiceClient {
	return consolev1alpha1connect.NewExtensionServiceClient(httpClient(), serverURL)
}

// NewTableClient creates a ConnectRPC TableService client.
func NewTableClient(serverURL string) consolev1alpha1connect.TableServiceClient {
	return consolev1alpha1connect.NewTableServiceClient(httpClient(), serverURL)
}

// NewConsoleServiceClient creates a ConnectRPC ConsoleService client.
func NewConsoleServiceClient(serverURL string) consolev1alpha1connect.ConsoleServiceClient {
	return consolev1alpha1connect.NewConsoleServiceClient(httpClient(), serverURL)
}

// NewViewClient creates a ConnectRPC ViewService client.
func NewViewClient(serverURL string) consolev1alpha1connect.ViewServiceClient {
	return consolev1alpha1connect.NewViewServiceClient(httpClient(), serverURL)
}

// NewTableDataClient creates a ConnectRPC TableDataService client.
func NewTableDataClient(serverURL string) consolev1alpha1connect.TableDataServiceClient {
	return consolev1alpha1connect.NewTableDataServiceClient(httpClient(), serverURL)
}

// NewSQLClient creates a ConnectRPC SQLService client.
func NewSQLClient(serverURL string) consolev1alpha1connect.SQLServiceClient {
	return consolev1alpha1connect.NewSQLServiceClient(httpClient(), serverURL)
}

// NewAdminClient creates a ConnectRPC AdminService client.
func NewAdminClient(serverURL string) consolev1alpha1connect.AdminServiceClient {
	return consolev1alpha1connect.NewAdminServiceClient(httpClient(), serverURL)
}
