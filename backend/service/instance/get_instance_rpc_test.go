package instance

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type getInstanceReaderStub struct {
	instances []*v1alpha1.Instance
	getCalls  int
}

func (r *getInstanceReaderStub) ListInstances(context.Context, int32, string, string, string) ([]*v1alpha1.Instance, string, error) {
	return nil, "", nil
}

func (r *getInstanceReaderStub) GetInstance(context.Context, string) (*v1alpha1.Instance, error) {
	instance := r.instances[r.getCalls]
	r.getCalls++

	return instance, nil
}

type getInstanceCatalogStub struct {
	err error
}

func (c *getInstanceCatalogStub) InvalidateInstance(context.Context, resource.InstanceName) error {
	return nil
}

func (c *getInstanceCatalogStub) GetServerInfo(context.Context, resource.InstanceName) (*engine.ServerInfo, error) {
	return nil, c.err
}

func TestGetInstanceReportsServerInfoPartialError(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	reader := &getInstanceReaderStub{
		instances: []*v1alpha1.Instance{
			{
				Name:            "instances/prod",
				ConnectionState: v1alpha1.Instance_CONNECTION_STATE_ACTIVE,
			},
			{
				Name:            "instances/prod",
				ConnectionState: v1alpha1.Instance_CONNECTION_STATE_ACTIVE,
				Config:          &v1alpha1.PostgresConfig{Password: "secret"},
			},
		},
	}
	catalog := &getInstanceCatalogStub{
		err: &engine.PostgresSQLError{
			Kind:          engine.PostgresSQLKindPermissionDenied,
			SQLState:      "42501",
			SQLStateClass: "42",
			ConditionName: "insufficient_privilege",
			Operation:     "query server info",
			Sentinel:      engine.ErrQueryPermissionDenied,
		},
	}
	service := NewService(reader, nil, nil, nil, catalog, nil, false)

	resp, err := service.GetInstance(context.Background(), connect.NewRequest(&v1alpha1.GetInstanceRequest{
		Name: "instances/prod",
	}))

	require.NoError(t, err)
	require.NotNil(t, resp.Msg.GetInstance())
	assert.Equal(t, v1alpha1.Instance_CONNECTION_STATE_ACTIVE, resp.Msg.GetInstance().GetConnectionState())
	assert.Empty(t, resp.Msg.GetInstance().GetConfig().GetPassword())
	assert.Nil(t, resp.Msg.GetServerInfo())
	assert.Equal(t, 2, reader.getCalls)

	serverInfoError := requireMetricPartialError(t, resp.Msg.GetPartialErrors(), "server_info")
	assert.Equal(t, int32(connect.CodePermissionDenied), serverInfoError.GetCode())
	assert.Equal(t, "failed to query server info", serverInfoError.GetMessage())

	info := requireStatusErrorInfo(t, serverInfoError)
	assert.Equal(t, "METRIC_UNAVAILABLE", info.GetReason())
	assert.Equal(t, "server_info", info.GetMetadata()["metric"])
	assert.Equal(t, "42501", info.GetMetadata()["sqlstate"])
	assert.Equal(t, "insufficient_privilege", info.GetMetadata()["condition_name"])
}
