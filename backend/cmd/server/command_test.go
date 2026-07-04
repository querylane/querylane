package server_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/cmd/server"
	"github.com/querylane/querylane/backend/config"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

// setupEvent captures a single streamed progress event for test assertions.
type setupEvent struct {
	StepID consolev1alpha1.SetupStep
	State  consolev1alpha1.StepState
	Error  string
}

// startBootstrapServer starts a server in bootstrap mode (no config) with an
// isolated HOME and random port. It returns the server URL and the path where
// config.yaml would be written. The server is stopped when the test completes.
func startBootstrapServer(t *testing.T) (string, string) {
	t.Helper()

	tempHomeDir := t.TempDir()
	t.Setenv("HOME", tempHomeDir)
	t.Setenv("USERPROFILE", tempHomeDir) // Windows: os.UserHomeDir() checks USERPROFILE

	port := findAvailablePort(t)
	t.Setenv("QUERYLANE_HTTP_PORT", strconv.Itoa(port))
	t.Setenv("QUERYLANE_HTTP_HOST", "127.0.0.1")

	cmd := &server.StartCmd{}
	globals := &config.Globals{LogLevel: "info"}

	go func() {
		_ = cmd.Run(globals)
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	require.Eventually(t, func() bool {
		return isServerReady(url)
	}, 5*time.Second, 100*time.Millisecond, "server should start in bootstrap mode")

	return url, filepath.Join(tempHomeDir, ".querylane")
}

// startServerWithConfig starts a server with the given config file path set.
// If the config file contains database credentials, the server enters MainApp
// mode; otherwise it enters bootstrap mode with filewatcher.
func startServerWithConfig(t *testing.T, configFilePath string) string {
	t.Helper()

	port := findAvailablePort(t)
	t.Setenv("QUERYLANE_HTTP_PORT", strconv.Itoa(port))
	t.Setenv("QUERYLANE_HTTP_HOST", "127.0.0.1")

	cmd := &server.StartCmd{Config: configFilePath}
	globals := &config.Globals{LogLevel: "info"}

	go func() {
		_ = cmd.Run(globals)
	}()

	serverURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	require.Eventually(t, func() bool {
		return isServerReady(serverURL)
	}, 15*time.Second, 100*time.Millisecond, "server should start")

	return serverURL
}

// newOnboardingClient creates a ConnectRPC client for OnboardingService.
func newOnboardingClient(serverURL string) consolev1alpha1connect.OnboardingServiceClient {
	return consolev1alpha1connect.NewOnboardingServiceClient(
		&http.Client{Timeout: 5 * time.Second},
		serverURL,
	)
}

// newConsoleClient creates a ConnectRPC client for ConsoleService.
func newConsoleClient(serverURL string) consolev1alpha1connect.ConsoleServiceClient {
	return consolev1alpha1connect.NewConsoleServiceClient(
		&http.Client{Timeout: 5 * time.Second},
		serverURL,
	)
}

// collectSetupEvents reads all events from a SetupAppDatabase server stream.
func collectSetupEvents(stream *connect.ServerStreamForClient[consolev1alpha1.SetupAppDatabaseResponse]) ([]setupEvent, error) {
	var events []setupEvent

	for stream.Receive() {
		msg := stream.Msg()
		if msg.Event != nil {
			events = append(events, setupEvent{
				StepID: msg.Event.StepId,
				State:  msg.Event.State,
				Error:  msg.Event.Error,
			})
		}
	}

	return events, stream.Err()
}

// collectWatchEvents reads all events from a WatchConfigChanges server stream.
func collectWatchEvents(stream *connect.ServerStreamForClient[consolev1alpha1.WatchConfigChangesResponse]) ([]setupEvent, error) {
	var events []setupEvent

	for stream.Receive() {
		msg := stream.Msg()
		if msg.Event != nil {
			events = append(events, setupEvent{
				StepID: msg.Event.StepId,
				State:  msg.Event.State,
				Error:  msg.Event.Error,
			})
		}
	}

	return events, stream.Err()
}

func TestStartCmd_WithoutConfigFlag(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	serverURL, configDir := startBootstrapServer(t)

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	onboardingClient := newOnboardingClient(serverURL)

	resp, err := onboardingClient.GetOnboardingState(ctx, connect.NewRequest(&consolev1alpha1.GetOnboardingStateRequest{}))
	require.NoError(t, err, "should call GetOnboardingState in bootstrap mode")
	require.NotNil(t, resp.Msg)

	// Core assertions
	assert.False(t, resp.Msg.IsConfigured, "database should not be configured in bootstrap mode")

	// AppDatabaseStatus
	require.NotNil(t, resp.Msg.AppDatabaseStatus)
	assert.Equal(t, consolev1alpha1.AppDatabaseStatus_STATE_NOT_CONFIGURED, resp.Msg.AppDatabaseStatus.State)

	// Home path and writability
	assert.NotEmpty(t, resp.Msg.HomePath, "HomePath should be non-empty")
	assert.True(t, resp.Msg.IsHomeWritable, "temp dir should be writable")

	// Available methods
	assert.Contains(t, resp.Msg.AvailableMethods, consolev1alpha1.SetupMethod_SETUP_METHOD_MANUAL_YAML)
	assert.Contains(t, resp.Msg.AvailableMethods, consolev1alpha1.SetupMethod_SETUP_METHOD_UI_CONFIGURED)

	// Config file path
	assert.True(t, strings.HasSuffix(resp.Msg.ConfigFilePath, "config.yaml"),
		"ConfigFilePath should end with config.yaml, got %q", resp.Msg.ConfigFilePath)

	t.Run("ConsoleService returns database not configured", func(t *testing.T) {
		consoleClient := newConsoleClient(serverURL)
		_, err := consoleClient.GetConsoleConfig(ctx, connect.NewRequest(&consolev1alpha1.GetConsoleConfigRequest{}))
		require.Error(t, err, "ConsoleService should fail in bootstrap mode")

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodeFailedPrecondition, connectErr.Code())
	})

	_ = configDir // available for future subtests

	cancel()
}

func TestSetupAppDatabase_InvalidCredentials(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	serverURL, _ := startBootstrapServer(t)

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	onboardingClient := newOnboardingClient(serverURL)

	// Use 127.0.0.1:1 — connection will be refused immediately.
	badConfig := &consolev1alpha1.PostgresConfig{
		Host:     "127.0.0.1",
		Port:     1,
		Database: "nonexistent",
		Username: "nobody",
		Password: "wrong",
	}

	stream, err := onboardingClient.SetupAppDatabase(ctx, connect.NewRequest(&consolev1alpha1.SetupAppDatabaseRequest{
		Setup: &consolev1alpha1.SetupAppDatabaseRequest_PostgresConfig{
			PostgresConfig: badConfig,
		},
	}))
	require.NoError(t, err, "stream should open successfully")

	events, streamErr := collectSetupEvents(stream)

	// Stream should close gracefully — the failure details are conveyed
	// through the progress events, not the stream error.
	require.NoError(t, streamErr, "stream should close gracefully after a setup failure")

	// First 4 events should be PENDING for all postgres setup steps.
	require.GreaterOrEqual(t, len(events), 4, "should have at least 4 PENDING events")

	expectedSteps := []consolev1alpha1.SetupStep{
		consolev1alpha1.SetupStep_SETUP_STEP_CONNECTING,
		consolev1alpha1.SetupStep_SETUP_STEP_MIGRATING,
		consolev1alpha1.SetupStep_SETUP_STEP_INITIALIZING_SERVICES,
		consolev1alpha1.SetupStep_SETUP_STEP_PERSISTING_CONFIG,
	}
	for i, stepID := range expectedSteps {
		assert.Equal(t, stepID, events[i].StepID, "event %d step ID mismatch", i)
		assert.Equal(t, consolev1alpha1.StepState_STEP_STATE_PENDING, events[i].State, "event %d should be PENDING", i)
	}

	// There should be a connecting event with FAILED state.
	var foundFailed bool

	for _, e := range events {
		if e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_CONNECTING && e.State == consolev1alpha1.StepState_STEP_STATE_FAILED {
			foundFailed = true

			assert.NotEmpty(t, e.Error, "failed connecting step should have error details")
		}
	}

	assert.True(t, foundFailed, "should have a connecting FAILED event")

	// Steps after connecting should never reach IN_PROGRESS.
	for _, e := range events {
		if e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_MIGRATING || e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_INITIALIZING_SERVICES || e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_PERSISTING_CONFIG {
			assert.NotEqual(t, consolev1alpha1.StepState_STEP_STATE_IN_PROGRESS, e.State,
				"step %q should not reach IN_PROGRESS after connect failure", e.StepID)
		}
	}
}

// TestStartCmd_FlagsOverrideListenAddress is the regression guard for the
// ignored `server start --port/--host` flags: the server must bind to the
// flag-provided address, not the configured one.
func TestStartCmd_FlagsOverrideListenAddress(t *testing.T) {
	tempHomeDir := t.TempDir()
	t.Setenv("HOME", tempHomeDir)
	t.Setenv("USERPROFILE", tempHomeDir)

	configPort := findAvailablePort(t)
	t.Setenv("QUERYLANE_HTTP_PORT", strconv.Itoa(configPort))
	t.Setenv("QUERYLANE_HTTP_HOST", "127.0.0.1")

	flagPort := findAvailablePort(t)
	cmd := &server.StartCmd{Port: flagPort, Host: "127.0.0.1"}
	globals := &config.Globals{LogLevel: "info"}

	go func() {
		_ = cmd.Run(globals)
	}()

	flagURL := fmt.Sprintf("http://127.0.0.1:%d", flagPort)

	require.Eventually(t, func() bool {
		return isServerReady(flagURL)
	}, 5*time.Second, 100*time.Millisecond, "server must listen on the --port flag value, not the configured port")

	assert.False(t, isServerReady(fmt.Sprintf("http://127.0.0.1:%d", configPort)),
		"server must not listen on the configured port when --port overrides it")
}

// findAvailablePort finds an available port for testing.
func findAvailablePort(t *testing.T) int {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0") //nolint:noctx // Test helper, context not needed for port discovery
	require.NoError(t, err, "Failed to find available port")

	addr := listener.Addr()
	tcpAddr, ok := addr.(*net.TCPAddr)
	require.True(t, ok, "Expected TCP address, got %T", addr)

	port := tcpAddr.Port

	err = listener.Close()
	require.NoError(t, err, "Failed to close listener")

	return port
}

// isServerReady checks if the server is ready by checking if the port is listening.
func isServerReady(serverURL string) bool {
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
