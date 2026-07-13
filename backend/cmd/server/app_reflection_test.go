package server

import (
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"connectrpc.com/validate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/reflect/protoreflect"

	"github.com/querylane/querylane/backend/config"
	"github.com/querylane/querylane/backend/dbsetup"
	v1alpha1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
)

func TestAppRoutesGatesReflectionByBuild(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	cfgMgr, err := config.NewConfigManager(t.Context(), defaultConfig())
	require.NoError(t, err)
	t.Cleanup(cfgMgr.Stop)
	app := NewApp(
		cfgMgr,
		validate.NewInterceptor(),
		nil,
		"",
		dbsetup.NewBroadcaster(),
		nil,
	)

	server := httptest.NewUnstartedServer(app.Routes(t.Context()))
	server.EnableHTTP2 = true
	server.StartTLS()
	t.Cleanup(server.Close)

	reflectionClient := grpcreflect.NewClient(server.Client(), server.URL, connect.WithGRPC())
	stream := reflectionClient.NewStream(t.Context())
	t.Cleanup(func() {
		_, _ = stream.Close()
	})

	services, err := stream.ListServices()
	if grpcReflectionEnabled {
		require.NoError(t, err)
		assert.Contains(t, services, protoreflect.FullName(v1alpha1connect.OnboardingServiceName))

		return
	}

	require.Error(t, err)
	assert.Equal(t, connect.CodeUnimplemented, connect.CodeOf(err))
	assert.Empty(t, services)
}
