package rpctest

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

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

func (s *RPCSuite) TestInstanceCredentialRecovery() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	const instanceID = "credential-recovery"

	config := s.externalPostgresConfig(ctx)
	created, err := s.instanceClient.CreateInstance(ctx, connect.NewRequest(&consolev1alpha1.CreateInstanceRequest{
		Spec: &consolev1alpha1.CreateInstanceSpec{
			DisplayName: "Credential recovery",
			Config:      config,
		},
		InstanceId: instanceID,
	}))
	s.Require().NoError(err)

	instanceName := created.Msg.GetInstance().GetName()

	defer func() {
		_, _ = s.instanceClient.DeleteInstance(context.Background(), connect.NewRequest(&consolev1alpha1.DeleteInstanceRequest{
			Name: instanceName,
		}))
	}()

	s.corruptStoredInstancePassword(ctx, instanceID)

	listResp, err := s.instanceClient.ListInstances(ctx, connect.NewRequest(&consolev1alpha1.ListInstancesRequest{}))
	s.Require().NoError(err)

	listed := findInstance(listResp.Msg.GetInstances(), instanceName)
	s.Require().NotNil(listed)
	s.Equal(consolev1alpha1.Instance_CREDENTIAL_STATE_UNREADABLE, listed.GetCredentialState())
	s.NotEmpty(listed.GetCredentialError())
	s.NotContains(listed.GetCredentialError(), "cipher")
	s.Empty(listed.GetConfig().GetPassword())

	getResp, err := s.instanceClient.GetInstance(ctx, connect.NewRequest(&consolev1alpha1.GetInstanceRequest{Name: instanceName}))
	s.Require().NoError(err)
	s.Equal(consolev1alpha1.Instance_CREDENTIAL_STATE_UNREADABLE, getResp.Msg.GetInstance().GetCredentialState())

	updateResp, err := s.instanceClient.UpdateInstance(ctx, connect.NewRequest(&consolev1alpha1.UpdateInstanceRequest{
		Instance: &consolev1alpha1.Instance{
			Name:   instanceName,
			Config: s.externalPostgresConfig(ctx),
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config"}},
	}))
	s.Require().NoError(err)
	s.Equal(consolev1alpha1.Instance_CREDENTIAL_STATE_UNSPECIFIED, updateResp.Msg.GetInstance().GetCredentialState())

	getResp, err = s.instanceClient.GetInstance(ctx, connect.NewRequest(&consolev1alpha1.GetInstanceRequest{Name: instanceName}))
	s.Require().NoError(err)
	s.Equal(consolev1alpha1.Instance_CREDENTIAL_STATE_UNSPECIFIED, getResp.Msg.GetInstance().GetCredentialState())
}

func (s *RPCSuite) corruptStoredInstancePassword(ctx context.Context, instanceID string) {
	s.T().Helper()

	db, err := s.pgContainer.ConnectToDatabase(ctx, metaDBName)
	s.Require().NoError(err)

	defer db.Close()

	var rawConfig []byte

	err = db.QueryRowContext(ctx, `SELECT config FROM instance WHERE id = $1`, instanceID).Scan(&rawConfig)
	s.Require().NoError(err)

	var config map[string]any
	s.Require().NoError(json.Unmarshal(rawConfig, &config))

	password, ok := config["password"].(string)
	s.Require().True(ok)
	encoded, ok := strings.CutPrefix(password, "qlenc:v1:")
	s.Require().True(ok)

	blob, err := base64.StdEncoding.DecodeString(encoded)
	s.Require().NoError(err)
	s.Require().NotEmpty(blob)
	blob[len(blob)-1] ^= 0xff
	config["password"] = "qlenc:v1:" + base64.StdEncoding.EncodeToString(blob)

	rawConfig, err = json.Marshal(config)
	s.Require().NoError(err)
	_, err = db.ExecContext(ctx, `UPDATE instance SET config = $1 WHERE id = $2`, rawConfig, instanceID)
	s.Require().NoError(err)
}

func findInstance(instances []*consolev1alpha1.Instance, name string) *consolev1alpha1.Instance {
	for _, instance := range instances {
		if instance.GetName() == name {
			return instance
		}
	}

	return nil
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
