package instance

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

var errTestConnectionFailed = errors.New("dial tcp: connection refused")

type createServiceInstanceRepo struct {
	createCalls int
	created     *v1alpha1.Instance
	instanceID  string
}

func (r *createServiceInstanceRepo) CreateInstance(_ context.Context, instance *v1alpha1.Instance, instanceID string) (*v1alpha1.Instance, error) {
	r.createCalls++
	r.created = instance
	r.instanceID = instanceID

	return &v1alpha1.Instance{
		Name:        "instances/" + instanceID,
		DisplayName: instance.GetDisplayName(),
		Labels:      instance.GetLabels(),
		Config:      instance.GetConfig(),
	}, nil
}

func (r *createServiceInstanceRepo) ListInstances(context.Context, int32, string, string, string) ([]*v1alpha1.Instance, string, error) {
	return nil, "", errors.New("unexpected ListInstances call")
}

func (r *createServiceInstanceRepo) GetInstance(context.Context, string) (*v1alpha1.Instance, error) {
	return nil, errors.New("unexpected GetInstance call")
}

func (r *createServiceInstanceRepo) DeleteInstance(context.Context, string) error {
	return errors.New("unexpected DeleteInstance call")
}

func (r *createServiceInstanceRepo) UpdateInstance(context.Context, *v1alpha1.Instance, *fieldmaskpb.FieldMask) (*v1alpha1.Instance, error) {
	return nil, errors.New("unexpected UpdateInstance call")
}

func (r *createServiceInstanceRepo) UpdateInstanceWithValidation(context.Context, *v1alpha1.Instance, *fieldmaskpb.FieldMask, storage.InstanceUpdateValidator) (*v1alpha1.Instance, error) {
	return nil, errors.New("unexpected UpdateInstanceWithValidation call")
}

type createServiceConnectionManager struct {
	err       error
	calls     int
	instances []*v1alpha1.Instance
}

func (m *createServiceConnectionManager) TestConnection(_ context.Context, instance *v1alpha1.Instance) error {
	m.calls++
	m.instances = append(m.instances, instance)

	return m.err
}

func (m *createServiceConnectionManager) EvictInstance(resource.InstanceName) {}

type createServiceConnectionRecorder struct {
	activeCalls int
}

func (r *createServiceConnectionRecorder) RecordActive(context.Context, string, time.Time) error {
	r.activeCalls++

	return nil
}

func newCreateInstanceTestService(repo *createServiceInstanceRepo, connManager *createServiceConnectionManager, recorder *createServiceConnectionRecorder) *Service {
	return NewService(repo, repo, recorder, connManager, &mockCatalogProvider{}, &mockOverviewFetcher{}, false, newTestConnectionGuard())
}

func createInstanceTestRequest(validateOnly bool) *v1alpha1.CreateInstanceRequest {
	return &v1alpha1.CreateInstanceRequest{
		InstanceId:   "test-instance",
		ValidateOnly: validateOnly,
		Spec: &v1alpha1.CreateInstanceSpec{
			DisplayName: "Test Instance",
			Labels:      map[string]string{"env": "test"},
			Config: &v1alpha1.PostgresConfig{
				Host:     "localhost",
				Port:     5432,
				Database: "postgres",
				Username: "postgres",
				Password: "secret",
				SslMode:  v1alpha1.PostgresConfig_SSL_MODE_DISABLED,
			},
		},
	}
}

func TestCreateInstanceValidateOnlyTestsConnectionWithoutPersisting(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(createInstanceTestRequest(true)))

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, 1, connManager.calls)
	require.Len(t, connManager.instances, 1)
	assert.Equal(t, "Test Instance", connManager.instances[0].GetDisplayName())
	assert.Equal(t, "localhost", connManager.instances[0].GetConfig().GetHost())
	assert.Equal(t, 0, repo.createCalls)
	assert.Equal(t, 0, recorder.activeCalls)
	assert.Equal(t, "instances/test-instance", res.Msg.GetInstance().GetName())
	assert.Equal(t, v1alpha1.Instance_CONNECTION_STATE_ACTIVE, res.Msg.GetInstance().GetConnectionState())
	assert.Empty(t, res.Msg.GetInstance().GetConfig().GetPassword())
	assert.NotNil(t, res.Msg.GetInstance().GetLastConnectionCheckTime())
}

func TestCreateInstanceValidateOnlyAuthenticationFailureReturnsCredentialFields(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{err: fmt.Errorf("probe failed: %w", &pgconn.PgError{
		Code:    "28P01",
		Message: `password authentication failed for user "postgres"`,
	})}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(createInstanceTestRequest(true)))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeUnauthenticated, connectErr.Code())
	assert.Equal(t, `PostgreSQL 28P01: password authentication failed for user "postgres"`, connectErr.Message())
	assert.ElementsMatch(t, []string{
		"spec.config.password",
	}, badRequestViolationFields(t, connectErr))
	assert.Equal(t, 1, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
	assert.Equal(t, 0, recorder.activeCalls)
}

func TestCreateInstanceConnectionFailureReturnsUnavailableWithoutPersisting(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{err: errTestConnectionFailed}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(createInstanceTestRequest(false)))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "PostgreSQL is unreachable")
	assert.NotContains(t, connectErr.Message(), "dial tcp")
	assert.ElementsMatch(t, []string{
		"spec.config.host",
		"spec.config.port",
	}, badRequestViolationFields(t, connectErr))
	assert.Equal(t, 1, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
	assert.Equal(t, 0, recorder.activeCalls)
}

func TestRequestValidationRejectsDirectSSLNegotiationWithoutRequiredSSLMode(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	validator, err := protovalidate.New()
	require.NoError(t, err)

	createReq := createInstanceTestRequest(false)
	createReq.GetSpec().GetConfig().SslMode = v1alpha1.PostgresConfig_SSL_MODE_PREFER
	createReq.GetSpec().GetConfig().SslNegotiation = v1alpha1.PostgresConfig_SSL_NEGOTIATION_DIRECT

	err = validator.Validate(createReq)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ssl_negotiation direct requires ssl_mode require")

	err = validator.Validate(&v1alpha1.TestInstanceConnectionRequest{
		Config: createReq.GetSpec().GetConfig(),
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ssl_negotiation direct requires ssl_mode require")
}

func TestTestInstanceConnectionFailureReturnsActionableMessage(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{err: errTestConnectionFailed}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	res, err := service.TestInstanceConnection(context.Background(), connect.NewRequest(&v1alpha1.TestInstanceConnectionRequest{
		Config: createInstanceTestRequest(false).GetSpec().GetConfig(),
	}))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
	assert.NotContains(t, connectErr.Message(), "invalid field")
	assert.NotContains(t, connectErr.Message(), "config")
	assert.Contains(t, connectErr.Message(), "PostgreSQL is unreachable")
	assert.NotContains(t, connectErr.Message(), "dial tcp")
	assert.ElementsMatch(t, []string{
		"config.host",
		"config.port",
	}, badRequestViolationFields(t, connectErr))
	assert.Equal(t, 1, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
	assert.Equal(t, 0, recorder.activeCalls)
}

func TestTestInstanceConnectionCoarsensDefaultErrors(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	probeErrors := []error{
		errTestConnectionFailed,
		&pgconn.PgError{Code: "28P01", Message: "password authentication failed"},
		&pgconn.PgError{Code: "3D000", Message: "database does not exist"},
	}

	for _, probeErr := range probeErrors {
		guard, err := NewConnectionTestGuard(10, 5, false)
		require.NoError(t, err)

		connManager := &createServiceConnectionManager{err: probeErr}
		service := NewService(
			&createServiceInstanceRepo{},
			&createServiceInstanceRepo{},
			&createServiceConnectionRecorder{},
			connManager,
			&mockCatalogProvider{},
			&mockOverviewFetcher{},
			false,
			guard,
		)

		res, err := service.TestInstanceConnection(t.Context(), connect.NewRequest(&v1alpha1.TestInstanceConnectionRequest{
			Config: createInstanceTestRequest(false).GetSpec().GetConfig(),
		}))

		require.Error(t, err)
		assert.Nil(t, res)

		var connectErr *connect.Error
		require.ErrorAs(t, err, &connectErr)
		assert.Equal(t, connect.CodeUnavailable, connectErr.Code())
		assert.Equal(t, "Could not connect to PostgreSQL with these settings.", connectErr.Message())
		assert.Empty(t, badRequestViolationFields(t, connectErr))
		assert.Equal(t, 1, connManager.calls)
	}
}

func TestConnectionTestRateLimitCoversTestCreateAndUpdate(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	tests := []struct {
		name string
		call func(*Service) error
	}{
		{
			name: "standalone test",
			call: func(service *Service) error {
				_, err := service.TestInstanceConnection(t.Context(), connect.NewRequest(&v1alpha1.TestInstanceConnectionRequest{
					Config: createInstanceTestRequest(false).GetSpec().GetConfig(),
				}))

				return err
			},
		},
		{
			name: "create validation",
			call: func(service *Service) error {
				_, err := service.CreateInstance(t.Context(), connect.NewRequest(createInstanceTestRequest(false)))

				return err
			},
		},
		{
			name: "update validation",
			call: func(service *Service) error {
				_, err := service.UpdateInstance(t.Context(), connect.NewRequest(&v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name: "instances/test-instance",
						Config: &v1alpha1.PostgresConfig{
							Host: "database.internal",
						},
					},
					UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config.host"}},
				}))

				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			guard, err := NewConnectionTestGuard(1, 1, false)
			require.NoError(t, err)
			require.NoError(t, guard.admit(""))

			repo := &createServiceInstanceRepo{}
			connManager := &createServiceConnectionManager{}
			service := NewService(
				repo,
				repo,
				&createServiceConnectionRecorder{},
				connManager,
				&mockCatalogProvider{},
				&mockOverviewFetcher{},
				false,
				guard,
			)

			err = tt.call(service)
			require.Error(t, err)

			var connectErr *connect.Error
			require.ErrorAs(t, err, &connectErr)
			assert.Equal(t, connect.CodeResourceExhausted, connectErr.Code())
			assert.Zero(t, connManager.calls)
			assert.Zero(t, repo.createCalls)
		})
	}
}

func TestCreateInstancePersistsOnlyAfterSuccessfulConnectionTest(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(createInstanceTestRequest(false)))

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, 1, connManager.calls)
	assert.Equal(t, 1, repo.createCalls)
	assert.Equal(t, 1, recorder.activeCalls)
	assert.Equal(t, "instances/test-instance", res.Msg.GetInstance().GetName())
	assert.Equal(t, v1alpha1.Instance_CONNECTION_STATE_ACTIVE, res.Msg.GetInstance().GetConnectionState())
	assert.Empty(t, res.Msg.GetInstance().GetConfig().GetPassword())
}

func TestCreateInstanceAcceptsCanonicalInstanceBodyAndIgnoresBodyName(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(false)
	config := req.GetSpec().GetConfig()
	req.Spec = nil
	req.InstanceId = "canonical-instance"
	req.Instance = &v1alpha1.Instance{
		Name:        "instances/body-name-must-be-ignored",
		DisplayName: "Canonical Instance",
		Labels:      map[string]string{"env": "canonical"},
		Config:      config,
	}

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, 1, connManager.calls)
	require.Len(t, connManager.instances, 1)
	assert.Empty(t, connManager.instances[0].GetName(), "server-owned name must not be trusted before persistence")
	assert.Equal(t, "Canonical Instance", connManager.instances[0].GetDisplayName())
	assert.Equal(t, "canonical", connManager.instances[0].GetLabels()["env"])
	assert.Equal(t, 1, repo.createCalls)
	assert.Equal(t, "Canonical Instance", repo.created.GetDisplayName())
	assert.Empty(t, repo.created.GetName(), "repository composes the full resource name from instance_id")
	assert.Equal(t, "instances/canonical-instance", res.Msg.GetInstance().GetName())
}

func TestCreateInstanceRejectsAmbiguousBodyShape(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(false)
	req.Instance = &v1alpha1.Instance{
		DisplayName: "Canonical Instance",
		Config:      req.GetSpec().GetConfig(),
	}

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeInvalidArgument, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "field validation errors")
	assert.Equal(t, 0, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
}

func TestCreateInstanceCanonicalBodyRequiresConfig(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(false)
	req.Spec = nil
	req.Instance = &v1alpha1.Instance{DisplayName: "Canonical Instance"}

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeInvalidArgument, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "instance.config")
	assert.Equal(t, 0, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
}

func TestCreateInstanceSpecBodyRequiresConfig(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(false)
	req.Spec.Config = nil

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.Error(t, err)
	assert.Nil(t, res)

	var connectErr *connect.Error
	require.ErrorAs(t, err, &connectErr)
	assert.Equal(t, connect.CodeInvalidArgument, connectErr.Code())
	assert.Contains(t, connectErr.Message(), "spec.config")
	assert.Equal(t, 0, connManager.calls)
	assert.Equal(t, 0, repo.createCalls)
}

func TestCreateInstanceValidateOnlyGeneratesNameWhenInstanceIDEmpty(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(true)
	req.InstanceId = ""

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Regexp(t, `^instances/[a-z][a-z0-9]+$`, res.Msg.GetInstance().GetName())
	assert.NotEqual(t, "instances/", res.Msg.GetInstance().GetName())
	assert.Equal(t, 0, repo.createCalls)
}

func TestCreateInstanceGeneratesIDWhenInstanceIDEmpty(t *testing.T) {
	t.Parallel()

	if !testing.Short() {
		t.Skip("unit test: run with -short")
	}

	repo := &createServiceInstanceRepo{}
	connManager := &createServiceConnectionManager{}
	recorder := &createServiceConnectionRecorder{}
	service := newCreateInstanceTestService(repo, connManager, recorder)

	req := createInstanceTestRequest(false)
	req.InstanceId = ""

	res, err := service.CreateInstance(context.Background(), connect.NewRequest(req))

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, 1, repo.createCalls)
	assert.Regexp(t, `^[a-z][a-z0-9]+$`, repo.instanceID)
	assert.Equal(t, "instances/"+repo.instanceID, res.Msg.GetInstance().GetName())
	assert.NotEqual(t, "instances/", res.Msg.GetInstance().GetName())
}

var _ storage.InstanceRepository = (*createServiceInstanceRepo)(nil)
