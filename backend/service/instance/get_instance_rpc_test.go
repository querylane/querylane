package instance

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
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
		err: postgreserrors.Wrap(&pgconn.PgError{
			Code:    "42501",
			Message: "permission denied for view pg_settings",
		}, postgreserrors.ProfileDefault, "query server info"),
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
	assert.Equal(t, "PostgreSQL 42501: permission denied for view pg_settings", serverInfoError.GetMessage())

	info := requireStatusErrorInfo(t, serverInfoError)
	assert.Equal(t, "METRIC_UNAVAILABLE", info.GetReason())
	assert.Equal(t, "server_info", info.GetMetadata()["metric"])
	assert.Equal(t, "42501", info.GetMetadata()["sqlstate"])
	assert.Equal(t, "insufficient_privilege", info.GetMetadata()["condition_name"])
}
