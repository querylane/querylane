package server_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/integration/testutil"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// testDatabaseConfigYAML returns a full config.yaml string using the testcontainer credentials.
func testDatabaseConfigYAML(info testutil.ConnectionInfo) string {
	return fmt.Sprintf(`http:
  host: "0.0.0.0"
  port: 8080
database:
  host: %q
  port: %d
  database: %q
  username: %q
  password: %q
  ssl_mode: "disable"
`, info.Host, info.Port, info.Database, info.Username, info.Password)
}

func testDatabaseConfigWithManagedInstanceYAML(metaDB testutil.ConnectionInfo, instance testutil.ConnectionInfo) string {
	return fmt.Sprintf(`http:
  host: "0.0.0.0"
  port: 8080
database:
  host: %q
  port: %d
  database: %q
  username: %q
  password: %q
  ssl_mode: "disable"
instances:
  - id: "config-instance"
    display_name: "Config Instance"
    host: %q
    port: %d
    database: %q
    username: %q
    password: %q
    ssl_mode: "disable"
`, metaDB.Host, metaDB.Port, metaDB.Database, metaDB.Username, metaDB.Password,
		instance.Host, instance.Port, instance.Database, instance.Username, instance.Password)
}

// writeTestConfigYAML writes a config.yaml file with the given testcontainer
// credentials into the specified directory. Returns the full path to the file.
func writeTestConfigYAML(t *testing.T, dir string, info testutil.ConnectionInfo) string {
	t.Helper()

	configDir := filepath.Join(dir, ".querylane")
	require.NoError(t, os.MkdirAll(configDir, 0o755))

	configPath := filepath.Join(configDir, "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte(testDatabaseConfigYAML(info)), 0o644))

	return configPath
}

func TestIntegration_SetupAppDatabase_ExternalPostgres(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	pgInfo := testutil.NewTestPostgres(t)
	serverURL, _ := startBootstrapServer(t)

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	onboardingClient := newOnboardingClient(serverURL)

	stream, err := onboardingClient.SetupAppDatabase(ctx, connect.NewRequest(&consolev1alpha1.SetupAppDatabaseRequest{
		Setup: &consolev1alpha1.SetupAppDatabaseRequest_PostgresConfig{
			PostgresConfig: pgInfo.PostgresProtoConfig(),
		},
	}))
	require.NoError(t, err, "stream should open successfully")

	events, streamErr := collectSetupEvents(stream)
	require.NoError(t, streamErr, "stream should complete without error")

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

	// No events should have FAILED state.
	for _, e := range events {
		assert.NotEqual(t, consolev1alpha1.StepState_STEP_STATE_FAILED, e.State,
			"step %v should not be FAILED", e.StepID)
	}

	// Last event should be persisting_config SUCCEEDED.
	lastEvent := events[len(events)-1]
	assert.Equal(t, consolev1alpha1.SetupStep_SETUP_STEP_PERSISTING_CONFIG, lastEvent.StepID)
	assert.Equal(t, consolev1alpha1.StepState_STEP_STATE_SUCCEEDED, lastEvent.State)

	// Every step should reach SUCCEEDED at least once.
	succeededSteps := make(map[consolev1alpha1.SetupStep]bool)

	for _, e := range events {
		if e.State == consolev1alpha1.StepState_STEP_STATE_SUCCEEDED {
			succeededSteps[e.StepID] = true
		}
	}

	for _, stepID := range expectedSteps {
		assert.True(t, succeededSteps[stepID], "step %v should have reached SUCCEEDED", stepID)
	}

	// Post-setup: GetOnboardingState should show configured.
	stateResp, err := onboardingClient.GetOnboardingState(ctx,
		connect.NewRequest(&consolev1alpha1.GetOnboardingStateRequest{}))
	require.NoError(t, err)
	assert.True(t, stateResp.Msg.IsConfigured, "should be configured after setup")

	// Post-setup: ConsoleService should work (MainApp routes swapped in).
	consoleClient := newConsoleClient(serverURL)
	_, err = consoleClient.GetConsoleConfig(ctx,
		connect.NewRequest(&consolev1alpha1.GetConsoleConfigRequest{}))
	require.NoError(t, err, "ConsoleService should work after setup")
}

func TestIntegration_SetupAppDatabase_ConfigWrittenCorrectly(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	pgInfo := testutil.NewTestPostgres(t)
	serverURL, configDir := startBootstrapServer(t)

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	onboardingClient := newOnboardingClient(serverURL)

	stream, err := onboardingClient.SetupAppDatabase(ctx, connect.NewRequest(&consolev1alpha1.SetupAppDatabaseRequest{
		Setup: &consolev1alpha1.SetupAppDatabaseRequest_PostgresConfig{
			PostgresConfig: pgInfo.PostgresProtoConfig(),
		},
	}))
	require.NoError(t, err)

	events, streamErr := collectSetupEvents(stream)
	require.NoError(t, streamErr, "stream should complete without error")

	// Sanity check: persisting_config should reach SUCCEEDED.
	var configPersisted bool

	for _, e := range events {
		if e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_PERSISTING_CONFIG && e.State == consolev1alpha1.StepState_STEP_STATE_SUCCEEDED {
			configPersisted = true
		}
	}

	require.True(t, configPersisted, "persisting_config should reach SUCCEEDED")

	// Read the written config file.
	configPath := filepath.Join(configDir, "config.yaml")
	data, err := os.ReadFile(configPath)
	require.NoError(t, err, "config.yaml should exist after setup")

	yamlStr := string(data)

	// The config should contain the database section with the provided credentials.
	assert.Contains(t, yamlStr, "database:")
	assert.Contains(t, yamlStr, "host: "+pgInfo.Host)
	assert.Contains(t, yamlStr, "username: "+pgInfo.Username)

	// The config should also contain the live HTTP settings (the persisted
	// config is based on the current configuration, here the test server's
	// QUERYLANE_HTTP_HOST/QUERYLANE_HTTP_PORT env overrides) — not baked-in
	// defaults that would clobber customization.
	serverPort, err := strconv.Atoi(strings.TrimPrefix(serverURL, "http://127.0.0.1:"))
	require.NoError(t, err)

	assert.Contains(t, yamlStr, "http:")
	assert.Contains(t, yamlStr, "host: 127.0.0.1")
	assert.Contains(t, yamlStr, "port: "+strconv.Itoa(serverPort))
}

func TestIntegration_ConfigManagedInstancesAreConnectedOnStartup(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	pg := testutil.RequirePostgreSQLContainer(ctx, t)
	t.Cleanup(func() {
		_ = pg.Cleanup(context.Background())
	})

	const (
		metaDBName     = "querylane_meta"
		externalDBName = "querylane_external"
	)

	_, err := pg.CreateDatabase(ctx, metaDBName)
	require.NoError(t, err)

	_, err = pg.CreateDatabase(ctx, externalDBName)
	require.NoError(t, err)

	host, err := pg.Host(ctx)
	require.NoError(t, err)

	portStr, err := pg.MappedPort(ctx)
	require.NoError(t, err)

	port, err := strconv.Atoi(portStr)
	require.NoError(t, err)

	metaDB := testutil.ConnectionInfo{
		Host:     host,
		Port:     port,
		Database: metaDBName,
		Username: "testuser",
		Password: "testpass",
	}

	externalDB := testutil.ConnectionInfo{
		Host:     host,
		Port:     port,
		Database: externalDBName,
		Username: "testuser",
		Password: "testpass",
	}

	configDir := t.TempDir()
	configPath := filepath.Join(configDir, "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte(testDatabaseConfigWithManagedInstanceYAML(metaDB, externalDB)), 0o600))

	serverURL := startServerWithConfig(t, configPath)
	instanceClient := testutil.NewInstanceClient(serverURL)

	// The runner populates instance_runtime_state on its first cycle, which
	// races with this assertion when started against an empty meta DB. Poll
	// until the overlay surfaces the ACTIVE state.
	require.Eventually(t, func() bool {
		listResp, err := instanceClient.ListInstances(ctx, connect.NewRequest(&consolev1alpha1.ListInstancesRequest{}))
		if err != nil || len(listResp.Msg.GetInstances()) != 1 {
			return false
		}

		inst := listResp.Msg.GetInstances()[0]

		return inst.GetConnectionState() == consolev1alpha1.Instance_CONNECTION_STATE_ACTIVE &&
			inst.GetConnectionError() == ""
	}, 15*time.Second, 100*time.Millisecond, "config-managed instance never reached ACTIVE in ListInstances")

	var getResp *connect.Response[consolev1alpha1.GetInstanceResponse]

	require.Eventually(t, func() bool {
		var err error

		getResp, err = instanceClient.GetInstance(ctx, connect.NewRequest(&consolev1alpha1.GetInstanceRequest{
			Name: "instances/config-instance",
		}))

		return err == nil && getResp.Msg.GetInstance().GetConnectionState() == consolev1alpha1.Instance_CONNECTION_STATE_ACTIVE
	}, 15*time.Second, 100*time.Millisecond, "config-managed instance never reached ACTIVE in GetInstance")
	assert.NotNil(t, getResp.Msg.GetServerInfo())
	assert.NotEmpty(t, getResp.Msg.GetServerInfo().GetVersion())
}

func TestIntegration_WatchConfigChanges_ManualYAMLEdit(t *testing.T) { //nolint:paralleltest // uses t.Setenv
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	pgInfo := testutil.NewTestPostgres(t)

	// Create temp home with an HTTP-only config (no database section).
	tempHomeDir := t.TempDir()
	configDir := filepath.Join(tempHomeDir, ".querylane")
	require.NoError(t, os.MkdirAll(configDir, 0o755))

	configPath := filepath.Join(configDir, "config.yaml")
	httpOnlyConfig := `http:
  host: "0.0.0.0"
  port: 8080
`
	require.NoError(t, os.WriteFile(configPath, []byte(httpOnlyConfig), 0o644))

	// Start server with config file (enters bootstrap mode with filewatcher).
	serverURL := startServerWithConfig(t, configPath)

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	onboardingClient := newOnboardingClient(serverURL)

	// Start WatchConfigChanges in goroutine.
	type watchResult struct {
		events []setupEvent
		err    error
	}

	resultCh := make(chan watchResult, 1)

	go func() {
		stream, err := onboardingClient.WatchConfigChanges(ctx,
			connect.NewRequest(&consolev1alpha1.WatchConfigChangesRequest{}))
		if err != nil {
			resultCh <- watchResult{err: err}
			return
		}

		events, streamErr := collectWatchEvents(stream)
		resultCh <- watchResult{events: events, err: streamErr}
	}()

	// Wait for stream to establish, then write database config.
	time.Sleep(500 * time.Millisecond)

	require.NoError(t, os.WriteFile(configPath, []byte(testDatabaseConfigYAML(pgInfo)), 0o644))

	// Collect watch events.
	var result watchResult
	select {
	case result = <-resultCh:
	case <-ctx.Done():
		t.Fatal("timed out waiting for WatchConfigChanges to complete")
	}

	require.NoError(t, result.err, "watch stream should complete without error")

	events := result.events

	// First 5 events should be PENDING.
	expectedWatchSteps := []consolev1alpha1.SetupStep{
		consolev1alpha1.SetupStep_SETUP_STEP_WAITING_FOR_CONFIG,
		consolev1alpha1.SetupStep_SETUP_STEP_CONFIG_DETECTED,
		consolev1alpha1.SetupStep_SETUP_STEP_CONNECTING,
		consolev1alpha1.SetupStep_SETUP_STEP_MIGRATING,
		consolev1alpha1.SetupStep_SETUP_STEP_INITIALIZING_SERVICES,
	}
	require.GreaterOrEqual(t, len(events), len(expectedWatchSteps),
		"should have at least %d PENDING events", len(expectedWatchSteps))

	for i, stepID := range expectedWatchSteps {
		assert.Equal(t, stepID, events[i].StepID, "event %d step ID mismatch", i)
		assert.Equal(t, consolev1alpha1.StepState_STEP_STATE_PENDING, events[i].State,
			"event %d should be PENDING", i)
	}

	// waiting_for_config should transition through IN_PROGRESS → SUCCEEDED.
	var waitingInProgress, waitingSucceeded bool

	for _, e := range events {
		if e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_WAITING_FOR_CONFIG {
			if e.State == consolev1alpha1.StepState_STEP_STATE_IN_PROGRESS {
				waitingInProgress = true
			}

			if e.State == consolev1alpha1.StepState_STEP_STATE_SUCCEEDED {
				waitingSucceeded = true
			}
		}
	}

	assert.True(t, waitingInProgress, "waiting_for_config should reach IN_PROGRESS")
	assert.True(t, waitingSucceeded, "waiting_for_config should reach SUCCEEDED")

	// config_detected should reach SUCCEEDED.
	var configDetectedSucceeded bool

	for _, e := range events {
		if e.StepID == consolev1alpha1.SetupStep_SETUP_STEP_CONFIG_DETECTED && e.State == consolev1alpha1.StepState_STEP_STATE_SUCCEEDED {
			configDetectedSucceeded = true
		}
	}

	assert.True(t, configDetectedSucceeded, "config_detected should reach SUCCEEDED")

	// No FAILED events.
	for _, e := range events {
		assert.NotEqual(t, consolev1alpha1.StepState_STEP_STATE_FAILED, e.State,
			"step %v should not be FAILED", e.StepID)
	}

	// All DB setup steps should reach SUCCEEDED.
	dbSteps := []consolev1alpha1.SetupStep{
		consolev1alpha1.SetupStep_SETUP_STEP_CONNECTING,
		consolev1alpha1.SetupStep_SETUP_STEP_MIGRATING,
		consolev1alpha1.SetupStep_SETUP_STEP_INITIALIZING_SERVICES,
	}
	succeededSteps := make(map[consolev1alpha1.SetupStep]bool)

	for _, e := range events {
		if e.State == consolev1alpha1.StepState_STEP_STATE_SUCCEEDED {
			succeededSteps[e.StepID] = true
		}
	}

	for _, stepID := range dbSteps {
		assert.True(t, succeededSteps[stepID], "step %v should have reached SUCCEEDED", stepID)
	}
}

func TestIntegration_MainAppMode_AlreadyConfigured(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	pgInfo := testutil.NewTestPostgres(t)

	// Pre-write full config with database credentials.
	tempHomeDir := t.TempDir()
	t.Setenv("HOME", tempHomeDir)

	configPath := writeTestConfigYAML(t, tempHomeDir, pgInfo)

	// Start server with config — should enter MainApp mode.
	serverURL := startServerWithConfig(t, configPath)

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	t.Run("GetOnboardingState shows configured", func(t *testing.T) { //nolint:paralleltest // shares server
		onboardingClient := newOnboardingClient(serverURL)

		resp, err := onboardingClient.GetOnboardingState(ctx,
			connect.NewRequest(&consolev1alpha1.GetOnboardingStateRequest{}))
		require.NoError(t, err)
		assert.True(t, resp.Msg.IsConfigured, "should be configured in MainApp mode")

		require.NotNil(t, resp.Msg.AppDatabaseStatus)
		assert.Equal(t, consolev1alpha1.AppDatabaseStatus_STATE_READY,
			resp.Msg.AppDatabaseStatus.State, "database should be READY")
	})

	t.Run("ConsoleService works", func(t *testing.T) { //nolint:paralleltest // shares server
		consoleClient := newConsoleClient(serverURL)

		_, err := consoleClient.GetConsoleConfig(ctx,
			connect.NewRequest(&consolev1alpha1.GetConsoleConfigRequest{}))
		require.NoError(t, err, "ConsoleService should work in MainApp mode")
	})
}
