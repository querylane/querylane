package instance

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"golang.org/x/sync/errgroup"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage"
)

var (
	instanceSecretKeyEnvMu sync.Mutex
	errNoInstanceNeeded    = errors.New("test case requires no instance")
	errNoSetupNeeded       = errors.New("test case requires no setup")
)

// mockConnectionManager is a simple mock implementation of ConnectionManager for testing.
// It always returns success and no-ops for eviction.
type mockConnectionManager struct {
	testErr       error
	testedConfigs []*v1alpha1.PostgresConfig
	evictedNames  []resource.InstanceName
}

func (m *mockConnectionManager) TestConnection(_ context.Context, instance *v1alpha1.Instance) error {
	cfg := instance.GetConfig()
	if cfg != nil {
		clonedConfig, ok := proto.Clone(cfg).(*v1alpha1.PostgresConfig)
		if ok {
			cfg = clonedConfig
		}
	}

	m.testedConfigs = append(m.testedConfigs, cfg)

	return m.testErr
}

func (m *mockConnectionManager) EvictInstance(name resource.InstanceName) {
	m.evictedNames = append(m.evictedNames, name)
}

type mockCatalogProvider struct{}

func (m *mockCatalogProvider) InvalidateInstance(_ context.Context, _ resource.InstanceName) error {
	return nil
}

func (m *mockCatalogProvider) GetServerInfo(_ context.Context, _ resource.InstanceName) (*engine.ServerInfo, error) {
	return nil, nil //nolint:nilnil // test mock returns no server info
}

type mockOverviewFetcher struct{}

func (m *mockOverviewFetcher) GetInstanceOverview(_ context.Context, _ resource.InstanceName) (*engine.InstanceOverview, error) {
	return &engine.InstanceOverview{}, nil
}

type mockConnectionRecorder struct{}

func (m *mockConnectionRecorder) RecordActive(_ context.Context, _ string, _ time.Time) error {
	return nil
}

// IntegrationTestSuite tests service integration with database
// using transaction-based isolation for fast, parallel-safe testing.
type IntegrationTestSuite struct {
	suite.Suite

	testDB *storage.TestDB
}

// SetupSuite runs once before all tests to start the database server.
func (s *IntegrationTestSuite) SetupSuite() {
	if testing.Short() {
		s.T().Skip("skipping integration test; run without -short")
	}

	// Create a shared test database server for all tests
	s.testDB = storage.NewTestDB(s.T())
}

// TearDownSuite runs once after all tests to clean up the database server.
func (s *IntegrationTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *IntegrationTestSuite) TestGetInstance() {
	ctx := context.Background()

	service, instanceRepo, cleanup := s.setupService(ctx)
	defer cleanup()

	tests := []struct {
		name    string
		setupFn func() (*v1alpha1.Instance, error)
		request *v1alpha1.GetInstanceRequest
		wantErr bool
		errCode connect.Code
	}{
		{
			name: "existing-instance",
			setupFn: func() (*v1alpha1.Instance, error) {
				instance := s.createTestInstance()
				return instanceRepo.CreateInstance(ctx, instance, "get-test-instance-1")
			},
			request: &v1alpha1.GetInstanceRequest{
				Name: "instances/get-test-instance-1",
			},
			wantErr: false,
		},
		{
			name: "non-existent-instance",
			setupFn: func() (*v1alpha1.Instance, error) {
				return nil, errNoInstanceNeeded
			},
			request: &v1alpha1.GetInstanceRequest{
				Name: "instances/non-existent",
			},
			wantErr: true,
			errCode: connect.CodeNotFound,
		},
		{
			name: "invalid-instance-name",
			setupFn: func() (*v1alpha1.Instance, error) {
				return nil, errNoInstanceNeeded
			},
			request: &v1alpha1.GetInstanceRequest{
				Name: "invalid/name/format",
			},
			wantErr: true,
			errCode: connect.CodeInvalidArgument,
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			// Setup test data
			expectedInstance, err := tt.setupFn()
			if !errors.Is(err, errNoInstanceNeeded) && !errors.Is(err, errNoSetupNeeded) {
				s.Require().NoError(err)
			}

			// Execute request
			resp, err := service.GetInstance(ctx, connect.NewRequest(tt.request))

			if tt.wantErr {
				s.Require().Error(err)
				s.Nil(resp)

				var connectErr *connect.Error
				s.Require().ErrorAs(err, &connectErr)
				s.Equal(tt.errCode, connectErr.Code())
			} else {
				s.Require().NoError(err)
				s.NotNil(resp)
				s.NotNil(resp.Msg.Instance)

				// Verify instance details
				gotInstance := resp.Msg.Instance
				s.Equal(expectedInstance.Name, gotInstance.Name)
				s.Equal(expectedInstance.DisplayName, gotInstance.DisplayName)
				s.Equal(expectedInstance.Labels, gotInstance.Labels)
			}
		})
	}
}

func (s *IntegrationTestSuite) TestDeleteInstance() {
	ctx := context.Background()

	service, instanceRepo, cleanup := s.setupService(ctx)
	defer cleanup()

	tests := []struct {
		name    string
		setupFn func() (*v1alpha1.Instance, error)
		request *v1alpha1.DeleteInstanceRequest
		wantErr bool
		errCode connect.Code
		testFn  func()
	}{
		{
			name: "existing-instance",
			setupFn: func() (*v1alpha1.Instance, error) {
				instance := s.createTestInstance()
				return instanceRepo.CreateInstance(ctx, instance, "delete-test-instance-1")
			},
			request: &v1alpha1.DeleteInstanceRequest{
				Name: "instances/delete-test-instance-1",
			},
			wantErr: false,
			testFn: func() {
				// Verify instance is soft-deleted (should not be retrievable)
				_, getErr := instanceRepo.GetInstance(ctx, "instances/delete-test-instance-1")
				s.ErrorIs(getErr, storage.ErrNotFound)
			},
		},
		{
			name: "non-existent-instance",
			setupFn: func() (*v1alpha1.Instance, error) {
				return nil, errNoInstanceNeeded
			},
			request: &v1alpha1.DeleteInstanceRequest{
				Name: "instances/non-existent",
			},
			wantErr: false, // Idempotent - should succeed
		},
		{
			name: "idempotent-delete",
			setupFn: func() (*v1alpha1.Instance, error) {
				instance := s.createTestInstance()

				created, err := instanceRepo.CreateInstance(ctx, instance, "idempotent-test-instance")
				if err != nil {
					return nil, err
				}

				// Delete it first time
				err = instanceRepo.DeleteInstance(ctx, "instances/idempotent-test-instance")

				return created, err
			},
			request: &v1alpha1.DeleteInstanceRequest{
				Name: "instances/idempotent-test-instance",
			},
			wantErr: false, // Should succeed idempotently
		},
		{
			name: "invalid-instance-name",
			setupFn: func() (*v1alpha1.Instance, error) {
				return nil, errNoInstanceNeeded
			},
			request: &v1alpha1.DeleteInstanceRequest{
				Name: "invalid/name/format",
			},
			wantErr: true,
			errCode: connect.CodeInvalidArgument,
		},
	}

	for _, tt := range tests {
		s.Run(tt.name, func() {
			// Setup test data
			_, err := tt.setupFn()
			if !errors.Is(err, errNoInstanceNeeded) && !errors.Is(err, errNoSetupNeeded) {
				s.Require().NoError(err)
			}

			// Execute request
			resp, err := service.DeleteInstance(ctx, connect.NewRequest(tt.request))

			if tt.wantErr {
				s.Require().Error(err)
				s.Nil(resp)

				var connectErr *connect.Error
				s.Require().ErrorAs(err, &connectErr)
				s.Equal(tt.errCode, connectErr.Code())
			} else {
				s.Require().NoError(err)
				s.NotNil(resp)
				s.NotNil(resp.Msg)

				// Run additional test function if provided
				if tt.testFn != nil {
					tt.testFn()
				}
			}
		})
	}
}

func (s *IntegrationTestSuite) TestUpdateInstance() {
	// UpdateInstance manages its own transactions, so we can't use transaction-based test isolation.
	// Instead, each test case will create and clean up its own data.
	s.runWithoutTransaction("UpdateInstance", func(ctx context.Context, service *Service, instanceRepo storage.InstanceRepository) {
		tests := []struct {
			name       string
			setupFn    func() (*v1alpha1.Instance, error)
			request    *v1alpha1.UpdateInstanceRequest
			wantErr    bool
			errCode    connect.Code
			validateFn func(*v1alpha1.Instance)
			cleanupFn  func()
		}{
			{
				name: "update-display-name",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := s.createTestInstance()
					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-1")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:        "instances/update-test-instance-1",
						DisplayName: "Updated Display Name",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"display_name"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Equal("Updated Display Name", instance.DisplayName)
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-1")
				},
			},
			{
				name: "update-labels",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := s.createTestInstance()
					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-2")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:   "instances/update-test-instance-2",
						Labels: map[string]string{"updated": "true", "env": "production"},
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"labels"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Equal(map[string]string{"updated": "true", "env": "production"}, instance.Labels)
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-2")
				},
			},
			{
				name: "update-multiple-fields",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := s.createTestInstance()
					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-3")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:        "instances/update-test-instance-3",
						DisplayName: "Multi-field Update",
						Labels:      map[string]string{"multi": "true"},
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"display_name", "labels"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Equal("Multi-field Update", instance.DisplayName)
					// Updating labels replaces the map, so removed keys do not survive.
					s.Equal(map[string]string{"multi": "true"}, instance.Labels)
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-3")
				},
			},
			{
				name: "clear-labels",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := s.createTestInstance()
					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-clear-labels")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:   "instances/update-test-instance-clear-labels",
						Labels: map[string]string{},
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"labels"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Empty(instance.Labels)
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-clear-labels")
				},
			},
			{
				name: "non-existent-instance",
				setupFn: func() (*v1alpha1.Instance, error) {
					return nil, errNoInstanceNeeded
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:        "instances/non-existent",
						DisplayName: "Should Fail",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"display_name"},
					},
				},
				wantErr: true,
				errCode: connect.CodeNotFound,
			},
			{
				name: "invalid-field-mask",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := s.createTestInstance()
					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-5")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:        "instances/update-test-instance-5",
						DisplayName: "Should Fail",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"invalid_field"},
					},
				},
				wantErr: true,
				errCode: connect.CodeInvalidArgument,
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-5")
				},
			},
			{
				name: "update-display-name-preserves-config",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := &v1alpha1.Instance{
						DisplayName: "Original Name",
						Labels:      map[string]string{"env": "test"},
						Config: &v1alpha1.PostgresConfig{
							Host:     "original-host.com",
							Port:     5432,
							Database: "testdb",
							Username: "testuser",
							Password: "original-secret-password",
							SslMode:  v1alpha1.PostgresConfig_SSL_MODE_REQUIRE,
						},
					}

					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-6")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name:        "instances/update-test-instance-6",
						DisplayName: "Updated Name Only",
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"display_name"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Equal("Updated Name Only", instance.DisplayName, "Display name should be updated")
					s.NotNil(instance.Config, "Config must not be nil")
					s.Equal("original-host.com", instance.Config.Host, "Host should be preserved")
					s.Equal(int32(5432), instance.Config.Port, "Port should be preserved")
					s.Equal("testdb", instance.Config.Database, "Database should be preserved")
					s.Equal("testuser", instance.Config.Username, "Username should be preserved")
					s.Equal(v1alpha1.PostgresConfig_SSL_MODE_REQUIRE, instance.Config.SslMode, "SSL mode should be preserved")
					s.Empty(instance.Config.Password, "Password should be redacted in response")
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-6")
				},
			},
			{
				name: "update-partial-config-field",
				setupFn: func() (*v1alpha1.Instance, error) {
					instance := &v1alpha1.Instance{
						DisplayName: "Config Update Test",
						Labels:      map[string]string{"env": "test"},
						Config: &v1alpha1.PostgresConfig{
							Host:     "original-host.com",
							Port:     5432,
							Database: "testdb",
							Username: "testuser",
							Password: "config-test-password",
							SslMode:  v1alpha1.PostgresConfig_SSL_MODE_REQUIRE,
						},
					}

					return instanceRepo.CreateInstance(ctx, instance, "update-test-instance-7")
				},
				request: &v1alpha1.UpdateInstanceRequest{
					Instance: &v1alpha1.Instance{
						Name: "instances/update-test-instance-7",
						Config: &v1alpha1.PostgresConfig{
							Host: "new-host.com",
						},
					},
					UpdateMask: &fieldmaskpb.FieldMask{
						Paths: []string{"config.host"},
					},
				},
				wantErr: false,
				validateFn: func(instance *v1alpha1.Instance) {
					s.Equal("new-host.com", instance.Config.Host, "Host should be updated")
					s.Equal("testdb", instance.Config.Database, "Database should be preserved")
					s.Equal("testuser", instance.Config.Username, "Username should be preserved")
					s.Equal(int32(5432), instance.Config.Port, "Port should be preserved")
					s.Equal(v1alpha1.PostgresConfig_SSL_MODE_REQUIRE, instance.Config.SslMode, "SSL mode should be preserved")
					s.Empty(instance.Config.Password, "Password should be redacted in response")
				},
				cleanupFn: func() {
					_ = instanceRepo.DeleteInstance(ctx, "instances/update-test-instance-7")
				},
			},
		}

		for _, tt := range tests {
			s.Run(tt.name, func() {
				// Setup test data
				_, err := tt.setupFn()
				if !errors.Is(err, errNoInstanceNeeded) && !errors.Is(err, errNoSetupNeeded) {
					s.Require().NoError(err)
				}

				// Cleanup after test
				if tt.cleanupFn != nil {
					defer tt.cleanupFn()
				}

				// Execute request
				resp, err := service.UpdateInstance(ctx, connect.NewRequest(tt.request))

				if tt.wantErr {
					s.Require().Error(err)
					s.Nil(resp)

					var connectErr *connect.Error
					s.Require().ErrorAs(err, &connectErr)
					s.Equal(tt.errCode, connectErr.Code())
				} else {
					s.Require().NoError(err)
					s.NotNil(resp)
					s.NotNil(resp.Msg.Instance)

					// Run validation function if provided
					if tt.validateFn != nil {
						tt.validateFn(resp.Msg.Instance)
					}
				}
			})
		}
	})
}

func (s *IntegrationTestSuite) TestUpdateInstanceRejectsUntestableConfigIntegration() {
	ctx := context.Background()

	testDB := storage.NewTestDB(s.T())
	defer testDB.Close()

	instanceRepo, err := storage.NewInstanceRepository(testDB.DB())
	s.Require().NoError(err)

	connManager := &mockConnectionManager{testErr: errors.New("dial tcp: connection refused")}

	_, err = instanceRepo.CreateInstance(ctx, s.createTestInstance(), "update-test-bad-config")
	s.Require().NoError(err)

	defer instanceRepo.DeleteInstance(ctx, "instances/update-test-bad-config") //nolint:errcheck // test cleanup

	service := NewService(instanceRepo, instanceRepo, &mockConnectionRecorder{}, connManager, &mockCatalogProvider{}, &mockOverviewFetcher{}, false)

	resp, err := service.UpdateInstance(ctx, connect.NewRequest(&v1alpha1.UpdateInstanceRequest{
		Instance: &v1alpha1.Instance{
			Name: "instances/update-test-bad-config",
			Config: &v1alpha1.PostgresConfig{
				Host: "bad-host.invalid",
			},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config.host"}},
	}))

	s.Require().Error(err)
	s.Nil(resp)

	var connectErr *connect.Error
	s.Require().ErrorAs(err, &connectErr)
	s.Equal(connect.CodeUnavailable, connectErr.Code())
	s.ElementsMatch([]string{
		"instance.config.host",
		"instance.config.port",
	}, badRequestViolationFields(s.T(), connectErr))
	s.Len(connManager.testedConfigs, 1)
	s.Equal("bad-host.invalid", connManager.testedConfigs[0].GetHost())
	s.Equal("testdb", connManager.testedConfigs[0].GetDatabase(), "connection test should use merged persisted config")

	stored, err := instanceRepo.GetInstance(ctx, "instances/update-test-bad-config")
	s.Require().NoError(err)
	s.Equal("localhost", stored.GetConfig().GetHost(), "bad config must not persist")
	s.Empty(connManager.evictedNames, "failed update must not evict working pool")
}

func (s *IntegrationTestSuite) TestUpdateInstanceTestsConfigBeforePersistingIntegration() {
	ctx := context.Background()

	testDB := storage.NewTestDB(s.T())
	defer testDB.Close()

	instanceRepo, err := storage.NewInstanceRepository(testDB.DB())
	s.Require().NoError(err)

	connManager := &mockConnectionManager{}

	_, err = instanceRepo.CreateInstance(ctx, s.createTestInstance(), "update-test-good-config")
	s.Require().NoError(err)

	defer instanceRepo.DeleteInstance(ctx, "instances/update-test-good-config") //nolint:errcheck // test cleanup

	service := NewService(instanceRepo, instanceRepo, &mockConnectionRecorder{}, connManager, &mockCatalogProvider{}, &mockOverviewFetcher{}, false)

	resp, err := service.UpdateInstance(ctx, connect.NewRequest(&v1alpha1.UpdateInstanceRequest{
		Instance: &v1alpha1.Instance{
			Name: "instances/update-test-good-config",
			Config: &v1alpha1.PostgresConfig{
				Host: "new-host.internal",
			},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"config.host"}},
	}))

	s.Require().NoError(err)
	s.Require().NotNil(resp)
	s.Equal("new-host.internal", resp.Msg.Instance.GetConfig().GetHost())
	s.Len(connManager.testedConfigs, 1)
	s.Equal("new-host.internal", connManager.testedConfigs[0].GetHost())
	s.Equal("testdb", connManager.testedConfigs[0].GetDatabase(), "connection test should use merged persisted config")
	s.Len(connManager.evictedNames, 1)
}

func (s *IntegrationTestSuite) TestTestInstanceConnectionIntegration() {
	ctx := context.Background()
	connManager := &mockConnectionManager{}
	service := NewService(nil, nil, &mockConnectionRecorder{}, connManager, &mockCatalogProvider{}, &mockOverviewFetcher{}, false)

	resp, err := service.TestInstanceConnection(ctx, connect.NewRequest(&v1alpha1.TestInstanceConnectionRequest{
		Config: &v1alpha1.PostgresConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "postgres",
			Username: "postgres",
			Password: "secret",
			SslMode:  v1alpha1.PostgresConfig_SSL_MODE_PREFER,
		},
	}))

	s.Require().NoError(err)
	s.NotNil(resp)
	s.Len(connManager.testedConfigs, 1)
	s.Equal("localhost", connManager.testedConfigs[0].GetHost())
}

// TestListInstances_ConcurrencyStability tests that pgx handles concurrent requests reliably
// without the data corruption issues that plagued lib/pq.
func (s *IntegrationTestSuite) TestListInstances_ConcurrencyStability() {
	s.runWithoutTransaction("concurrent-requests-should-work-without-corruption",
		func(ctx context.Context, service *Service, _ storage.InstanceRepository) {
			// Test realistic React SPA concurrency using errgroup
			const (
				concurrency       = 4
				requestsPerWorker = 5
			)

			g, ctx := errgroup.WithContext(ctx)

			// Launch concurrent workers
			for range concurrency {
				g.Go(func() error {
					for range requestsPerWorker {
						request := &v1alpha1.ListInstancesRequest{
							PageSize: 20,
						}

						_, err := service.ListInstances(ctx, connect.NewRequest(request))
						if err != nil {
							return err
						}
					}

					return nil
				})
			}

			// Wait for all concurrent requests to complete
			err := g.Wait()
			s.Require().NoError(err, "All concurrent requests should succeed with pgx")
		})
}

// TestIntegration runs the integration test suite.
func TestIntegration(t *testing.T) {
	t.Parallel()
	setInstanceSecretKeyEnv(t)
	suite.Run(t, new(IntegrationTestSuite))
}

// setupService creates a service with transactional repositories for test isolation.
func (s *IntegrationTestSuite) setupService(ctx context.Context) (*Service, storage.InstanceRepository, func()) {
	// Create a transaction for test isolation
	tx, err := s.testDB.DB().BeginTx(ctx, nil)
	s.Require().NoError(err)

	// Create repositories using the transaction
	instanceRepo, err := storage.NewInstanceRepository(s.testDB.DB())
	s.Require().NoError(err)

	instanceRepo = instanceRepo.WithTx(tx)

	// Create service with mock connection tester
	service := NewService(instanceRepo, instanceRepo, &mockConnectionRecorder{}, &mockConnectionManager{}, &mockCatalogProvider{}, &mockOverviewFetcher{}, false)

	// Cleanup function to rollback transaction
	cleanup := func() {
		_ = tx.Rollback()
	}

	return service, instanceRepo, cleanup
}

// runWithoutTransaction runs a test with a service that uses the direct database connection pool,
// bypassing transaction-based isolation. This is essential for testing concurrent behavior where
// multiple goroutines need separate connections. The test function is responsible for its own
// data setup and cleanup.
func (s *IntegrationTestSuite) runWithoutTransaction(
	name string,
	testFn func(ctx context.Context, service *Service, instanceRepo storage.InstanceRepository),
) {
	s.Run(name, func() {
		// Use timeout to prevent tests from hanging
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Create non-transactional repositories that use the connection pool
		instanceRepo, err := storage.NewInstanceRepository(s.testDB.DB())
		s.Require().NoError(err)

		service := NewService(instanceRepo, instanceRepo, &mockConnectionRecorder{}, &mockConnectionManager{}, &mockCatalogProvider{}, &mockOverviewFetcher{}, false)
		testFn(ctx, service, instanceRepo)
	})
}

// createTestInstance creates a basic instance for testing.
func (s *IntegrationTestSuite) createTestInstance() *v1alpha1.Instance {
	return &v1alpha1.Instance{
		DisplayName: "Test Instance",
		Labels:      map[string]string{"env": "test"},
		Config: &v1alpha1.PostgresConfig{
			Host:     "localhost",
			Port:     5432,
			Database: "testdb",
			Username: "testuser",
			Password: "testpass",
			SslMode:  v1alpha1.PostgresConfig_SSL_MODE_PREFER,
		},
	}
}

func setInstanceSecretKeyEnv(t *testing.T) {
	t.Helper()

	instanceSecretKeyEnvMu.Lock()
	t.Cleanup(instanceSecretKeyEnvMu.Unlock)

	const key = "QUERYLANE_INSTANCE_SECRET_KEY"

	previous, hadPrevious := os.LookupEnv(key)
	require.NoError(t, os.Setenv(key, "0123456789abcdef0123456789abcdef")) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
	t.Cleanup(func() {
		if hadPrevious {
			require.NoError(t, os.Setenv(key, previous)) //nolint:usetesting // t.Setenv cannot be used with parallel tests.
			return
		}

		require.NoError(t, os.Unsetenv(key))
	})
}
