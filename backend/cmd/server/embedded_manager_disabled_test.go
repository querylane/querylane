//go:build no_embedded_postgres

package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/config"
	serverconfig "github.com/querylane/querylane/backend/config/server"
	"github.com/querylane/querylane/backend/dbsetup"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1alpha1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

func TestNewControllerDisablesEmbeddedPostgres(t *testing.T) {
	t.Parallel()

	controller := NewController(nil)
	require.Nil(t, controller.embeddedManager)
	require.EqualError(t, controller.embeddedManagerUnavailableError, "Embedded PostgreSQL is unavailable in this Querylane image.")
}

func TestDisabledEmbeddedConfigReturnsCuratedError(t *testing.T) {
	t.Parallel()

	controller := NewController(nil)
	resolved, err := controller.resolveEffectiveConfig(t.Context(), &serverconfig.Config{
		Embedded: &serverconfig.EmbeddedDatabase{},
	})

	require.Nil(t, resolved)
	require.EqualError(t, err, "Embedded PostgreSQL is unavailable in this Querylane image.")
}

func TestDisabledEmbeddedControllerStopsSafely(t *testing.T) {
	t.Parallel()

	controller := NewController(nil)
	controller.server = &http.Server{}

	require.NotPanics(t, func() {
		controller.stop(t.Context())
	})
}

func TestDisabledEmbeddedConfiguredStartsDegraded(t *testing.T) {
	t.Parallel()

	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte("embedded: {}\n"), 0o600))
	configManager, err := config.NewConfigManager(
		t.Context(),
		&serverconfig.Config{},
		config.WithConfigFile(configPath),
	)
	require.NoError(t, err)
	t.Cleanup(configManager.Stop)

	controller := NewController(configManager)
	controller.retryDatabaseInitInterval = time.Millisecond
	controller.validationInterceptor = validate.NewInterceptor()
	controller.app = NewApp(
		configManager,
		controller.validationInterceptor,
		controller.embeddedManager,
		controller.embeddedManagerUnavailableError.Error(),
		controller.progressBroadcaster,
		nil,
	)
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)

	controller.bootMainStage(ctx, configManager.CurrentConfig())

	require.False(t, controller.app.IsDatabaseInitialized())
	require.Equal(t, "Embedded PostgreSQL is unavailable in this Querylane image.", controller.app.DatabaseInitError())

	server := httptest.NewServer(controller.delegatingHandler)
	t.Cleanup(server.Close)
	client := v1alpha1connect.NewInstanceServiceClient(http.DefaultClient, server.URL)
	require.Equal(t, connect.CodeUnavailable, instanceServiceCode(t, client))

	emptyConfig := &serverconfig.Config{}
	emptyConfig.SetDefaults()
	require.NoError(t, configManager.UpdateConfig(emptyConfig))
	require.Eventually(t, func() bool {
		return controller.app.DatabaseInitError() == "" &&
			instanceServiceCode(t, client) == connect.CodeFailedPrecondition
	}, time.Second, 10*time.Millisecond)

	embeddedConfig := &serverconfig.Config{Embedded: &serverconfig.EmbeddedDatabase{}}
	embeddedConfig.SetDefaults()
	require.NoError(t, configManager.UpdateConfig(embeddedConfig))
	require.Eventually(t, func() bool {
		return controller.app.DatabaseInitError() == "Embedded PostgreSQL is unavailable in this Querylane image." &&
			instanceServiceCode(t, client) == connect.CodeUnavailable
	}, time.Second, 10*time.Millisecond)
}

func TestDisabledEmbeddedReasonReachesOnboardingAPI(t *testing.T) { //nolint:paralleltest // changes HOME
	t.Setenv("HOME", t.TempDir())
	configManager, err := config.NewConfigManager(t.Context(), &serverconfig.Config{})
	require.NoError(t, err)
	t.Cleanup(configManager.Stop)

	controller := NewController(configManager)
	app := NewApp(
		configManager,
		validate.NewInterceptor(),
		controller.embeddedManager,
		controller.embeddedManagerUnavailableError.Error(),
		dbsetup.NewBroadcaster(),
		nil,
	)
	server := httptest.NewServer(app.Routes(t.Context()))
	t.Cleanup(server.Close)
	client := v1alpha1connect.NewOnboardingServiceClient(http.DefaultClient, server.URL)

	resp, err := client.GetOnboardingState(t.Context(), connect.NewRequest(&v1alpha1.GetOnboardingStateRequest{}))
	require.NoError(t, err)
	require.Equal(t, "Embedded PostgreSQL is unavailable in this Querylane image.", resp.Msg.SetupMethodAvailabilities[2].UnavailableReason)
}

func TestDisabledEmbeddedConfigEditUpdatesBootstrapRoutes(t *testing.T) { //nolint:paralleltest // changes HOME
	t.Setenv("HOME", t.TempDir())
	configManager, err := config.NewConfigManager(t.Context(), &serverconfig.Config{})
	require.NoError(t, err)
	t.Cleanup(configManager.Stop)

	controller := NewController(configManager)
	controller.validationInterceptor = validate.NewInterceptor()
	controller.app = NewApp(
		configManager,
		controller.validationInterceptor,
		controller.embeddedManager,
		controller.embeddedManagerUnavailableError.Error(),
		controller.progressBroadcaster,
		nil,
	)
	controller.bootBootstrapStage(t.Context())

	server := httptest.NewServer(controller.delegatingHandler)
	t.Cleanup(server.Close)
	client := v1alpha1connect.NewInstanceServiceClient(http.DefaultClient, server.URL)

	require.Equal(t, connect.CodeFailedPrecondition, instanceServiceCode(t, client))
	embeddedConfig := &serverconfig.Config{
		Embedded: &serverconfig.EmbeddedDatabase{},
	}
	embeddedConfig.SetDefaults()
	require.NoError(t, configManager.UpdateConfig(embeddedConfig))
	require.Eventually(t, func() bool {
		return controller.app.DatabaseInitError() == "Embedded PostgreSQL is unavailable in this Querylane image." &&
			instanceServiceCode(t, client) == connect.CodeUnavailable
	}, time.Second, 10*time.Millisecond)

	emptyConfig := &serverconfig.Config{}
	emptyConfig.SetDefaults()
	require.NoError(t, configManager.UpdateConfig(emptyConfig))
	require.Eventually(t, func() bool {
		return controller.app.DatabaseInitError() == "" &&
			instanceServiceCode(t, client) == connect.CodeFailedPrecondition
	}, time.Second, 10*time.Millisecond)
}

func instanceServiceCode(t *testing.T, client v1alpha1connect.InstanceServiceClient) connect.Code {
	t.Helper()

	_, err := client.ListInstances(t.Context(), connect.NewRequest(&v1alpha1.ListInstancesRequest{}))

	return connect.CodeOf(err)
}
