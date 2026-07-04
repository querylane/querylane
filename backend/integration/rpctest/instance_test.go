package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestCreateInstance_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config := s.externalPostgresConfig(ctx)

	resp, err := s.instanceClient.CreateInstance(ctx, connect.NewRequest(&consolev1alpha1.CreateInstanceRequest{
		Spec: &consolev1alpha1.CreateInstanceSpec{
			DisplayName: "Create Test Instance",
			Config:      config,
		},
		InstanceId: "create-test",
	}))
	s.Require().NoError(err)
	s.NotNil(resp.Msg.GetInstance())
	s.Contains(resp.Msg.GetInstance().GetName(), "instances/create-test")
	s.Equal("Create Test Instance", resp.Msg.GetInstance().GetDisplayName())

	// Cleanup: delete the instance we just created.
	_, _ = s.instanceClient.DeleteInstance(ctx, connect.NewRequest(&consolev1alpha1.DeleteInstanceRequest{
		Name: resp.Msg.GetInstance().GetName(),
	}))
}

func (s *RPCSuite) TestCreateInstance_InvalidArgument() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tests := []struct {
		name string
		req  *consolev1alpha1.CreateInstanceRequest
	}{
		{
			name: "missing spec",
			req:  &consolev1alpha1.CreateInstanceRequest{},
		},
		{
			name: "invalid instance_id characters",
			req: &consolev1alpha1.CreateInstanceRequest{
				Spec: &consolev1alpha1.CreateInstanceSpec{
					DisplayName: "Bad ID",
					Config: &consolev1alpha1.PostgresConfig{
						Host:     "localhost",
						Port:     5432,
						Database: "db",
						Username: "user",
						SslMode:  consolev1alpha1.PostgresConfig_SSL_MODE_DISABLED,
					},
				},
				InstanceId: "invalid id with spaces",
			},
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			_, err := s.instanceClient.CreateInstance(ctx, connect.NewRequest(tt.req))
			s.Require().Error(err)

			var connectErr *connect.Error
			s.Require().ErrorAs(err, &connectErr)
			s.Equal(connect.CodeInvalidArgument.String(), connectErr.Code().String())
		})
	}
}

func (s *RPCSuite) TestGetInstance_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.instanceClient.GetInstance(ctx, connect.NewRequest(&consolev1alpha1.GetInstanceRequest{
		Name: s.instanceName(),
	}))
	s.Require().NoError(err)
	s.Equal(s.instanceName(), resp.Msg.GetInstance().GetName())
	s.Equal("Test External Instance", resp.Msg.GetInstance().GetDisplayName())

	// Password must be redacted.
	s.Empty(resp.Msg.GetInstance().GetConfig().GetPassword(),
		"password should be redacted in GetInstance response")
}

func (s *RPCSuite) TestCheckInstanceHealth() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.instanceClient.CheckInstanceHealth(ctx, connect.NewRequest(&consolev1alpha1.CheckInstanceHealthRequest{
		Name: s.instanceName(),
	}))
	s.Require().NoError(err)

	health := resp.Msg.GetHealth()
	s.Require().NotNil(health)
	s.NotNil(health.GetObservedAt())

	activity := health.GetConnectionActivity()
	s.Require().NotNil(activity)
	s.GreaterOrEqual(activity.GetTotalConnections(), int32(1))
	s.Positive(activity.GetMaxConnections())

	replication := health.GetReplication()
	s.Require().NotNil(replication)
	s.Equal(consolev1alpha1.ServerInfo_REPLICATION_ROLE_PRIMARY, replication.GetRole())

	statsAccess := health.GetStatsAccess()
	s.Require().NotNil(statsAccess)
	s.NotEmpty(statsAccess.GetCurrentUser())
	s.True(statsAccess.GetCanReadPgStatActivity())

	pgStatStatements := health.GetPgStatStatements()
	s.Require().NotNil(pgStatStatements)
	s.NotEqual(consolev1alpha1.HealthCheckStatus_HEALTH_CHECK_STATUS_UNSPECIFIED, pgStatStatements.GetStatus())
}

func (s *RPCSuite) TestGetInstance_NotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.instanceClient.GetInstance(ctx, connect.NewRequest(&consolev1alpha1.GetInstanceRequest{
		Name: "instances/does-not-exist",
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeInstance, "instances/does-not-exist")
}

func (s *RPCSuite) TestListInstances() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.instanceClient.ListInstances(ctx, connect.NewRequest(&consolev1alpha1.ListInstancesRequest{}))
	s.Require().NoError(err)

	// At least the instance registered in SetupSuite should be present.
	s.GreaterOrEqual(len(resp.Msg.GetInstances()), 1)

	var found bool

	for _, inst := range resp.Msg.GetInstances() {
		if inst.GetName() == s.instanceName() {
			found = true

			break
		}
	}

	s.True(found, "registered instance %q should appear in ListInstances", s.instanceName())
}

func (s *RPCSuite) TestDeleteInstance_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config := s.externalPostgresConfig(ctx)

	// Create a throwaway instance to delete.
	createResp, err := s.instanceClient.CreateInstance(ctx, connect.NewRequest(&consolev1alpha1.CreateInstanceRequest{
		Spec: &consolev1alpha1.CreateInstanceSpec{
			DisplayName: "To Be Deleted",
			Config:      config,
		},
		InstanceId: "delete-me",
	}))
	s.Require().NoError(err)

	name := createResp.Msg.GetInstance().GetName()

	// First delete should succeed.
	_, err = s.instanceClient.DeleteInstance(ctx, connect.NewRequest(&consolev1alpha1.DeleteInstanceRequest{
		Name: name,
	}))
	s.Require().NoError(err)

	// Second delete should also succeed (idempotent).
	_, err = s.instanceClient.DeleteInstance(ctx, connect.NewRequest(&consolev1alpha1.DeleteInstanceRequest{
		Name: name,
	}))
	s.Require().NoError(err)
}

func (s *RPCSuite) externalPostgresConfig(ctx context.Context) *consolev1alpha1.PostgresConfig {
	s.T().Helper()

	host, err := s.pgContainer.Host(ctx)
	s.Require().NoError(err)

	port, err := s.pgContainer.MappedPort(ctx)
	s.Require().NoError(err)

	return &consolev1alpha1.PostgresConfig{
		Host:     host,
		Port:     mustAtoi(s.T(), port),
		Database: externalDBName,
		Username: "testuser",
		Password: "testpass",
		SslMode:  consolev1alpha1.PostgresConfig_SSL_MODE_DISABLED,
	}
}
