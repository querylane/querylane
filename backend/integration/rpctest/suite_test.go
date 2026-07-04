package rpctest

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	"github.com/querylane/querylane/backend/integration/testutil"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/sampledata"
)

const (
	metaDBName     = "querylane_meta"
	externalDBName = "test_external"
)

// RPCSuite boots the full querylane server against a real PostgreSQL
// container and provides ConnectRPC clients for each service.
type RPCSuite struct {
	suite.Suite

	pgContainer *testutil.PostgreSQLContainer

	serverURL  string
	instanceID string // ID of the registered external instance

	instanceClient  consolev1alpha1connect.InstanceServiceClient
	databaseClient  consolev1alpha1connect.DatabaseServiceClient
	schemaClient    consolev1alpha1connect.SchemaServiceClient
	extensionClient consolev1alpha1connect.ExtensionServiceClient
	tableClient     consolev1alpha1connect.TableServiceClient
	consoleClient   consolev1alpha1connect.ConsoleServiceClient
	viewClient      consolev1alpha1connect.ViewServiceClient
	tableDataClient consolev1alpha1connect.TableDataServiceClient
	sqlClient       consolev1alpha1connect.SQLServiceClient
}

func TestRPCSuite(t *testing.T) { //nolint:paralleltest // suite manages its own lifecycle
	if testing.Short() {
		t.Skip("skipping RPC integration tests in short mode")
	}

	suite.Run(t, new(RPCSuite))
}

func (s *RPCSuite) SetupSuite() {
	t := s.T()
	ctx := context.Background()

	// 1. Start PostgreSQL container.
	pg := testutil.RequirePostgreSQLContainer(ctx, t)

	s.pgContainer = pg

	// 2. Create meta database (server handles migrations on boot).
	_, err := pg.CreateDatabase(ctx, metaDBName)
	require.NoError(t, err, "create meta database")

	// 3. Create external database and seed sample data.
	_, err = pg.CreateDatabase(ctx, externalDBName)
	require.NoError(t, err, "create external database")

	extDB, err := pg.ConnectToDatabase(ctx, externalDBName)
	require.NoError(t, err, "connect to external database")

	err = sampledata.Apply(ctx, extDB)
	require.NoError(t, err, "apply sample data")

	err = extDB.Close()
	require.NoError(t, err, "close external database")

	// 4. Build config YAML pointing at the meta database.
	host, err := pg.Host(ctx)
	require.NoError(t, err)

	port, err := pg.MappedPort(ctx)
	require.NoError(t, err)

	configYAML := fmt.Sprintf(`database:
  host: %s
  port: %s
  database: %s
  username: testuser
  password: testpass
  ssl_mode: disable
`, host, port, metaDBName)

	configDir := t.TempDir()
	configPath := filepath.Join(configDir, "config.yaml")
	err = os.WriteFile(configPath, []byte(configYAML), 0o600)
	require.NoError(t, err, "write config file")

	// Isolate HOME so the server doesn't pick up the real user config.
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("USERPROFILE", tempHome)
	t.Setenv("QUERYLANE_INSTANCE_SECRET_KEY", "0123456789abcdef0123456789abcdef")

	// 5. Boot the full server.
	s.serverURL = testutil.StartTestServer(t, configPath)

	// 6. Create ConnectRPC clients.
	s.instanceClient = testutil.NewInstanceClient(s.serverURL)
	s.databaseClient = testutil.NewDatabaseClient(s.serverURL)
	s.schemaClient = testutil.NewSchemaClient(s.serverURL)
	s.extensionClient = testutil.NewExtensionClient(s.serverURL)
	s.tableClient = testutil.NewTableClient(s.serverURL)
	s.consoleClient = testutil.NewConsoleServiceClient(s.serverURL)
	s.viewClient = testutil.NewViewClient(s.serverURL)
	s.tableDataClient = testutil.NewTableDataClient(s.serverURL)
	s.sqlClient = testutil.NewSQLClient(s.serverURL)

	// 7. Register the external instance via CreateInstance RPC.
	s.instanceID = "test-ext"

	pgConfig := &consolev1alpha1.PostgresConfig{
		Host:     host,
		Port:     mustAtoi(t, port),
		Database: externalDBName,
		Username: "testuser",
		Password: "testpass",
		SslMode:  consolev1alpha1.PostgresConfig_SSL_MODE_DISABLED,
	}

	_, err = s.instanceClient.CreateInstance(ctx, connect.NewRequest(&consolev1alpha1.CreateInstanceRequest{
		Spec: &consolev1alpha1.CreateInstanceSpec{
			DisplayName: "Test External Instance",
			Config:      pgConfig,
		},
		InstanceId: s.instanceID,
	}))
	require.NoError(t, err, "register external instance")

	t.Logf("RPC suite ready: server=%s instance=%s", s.serverURL, s.instanceID)
}

func (s *RPCSuite) TearDownSuite() {
	if s.pgContainer != nil {
		_ = s.pgContainer.Cleanup(context.Background())
	}
}

// instanceName returns the resource name for the registered external instance.
func (s *RPCSuite) instanceName() string {
	return "instances/" + s.instanceID
}

// databaseName returns the resource name for the external database.
func (s *RPCSuite) databaseName() string {
	return s.instanceName() + "/databases/" + externalDBName
}

// schemaName returns the resource name for a schema in the external database.
func (s *RPCSuite) schemaName(schema string) string {
	return s.databaseName() + "/schemas/" + schema
}

// tableName returns the resource name for a table.
func (s *RPCSuite) tableName(schema, table string) string {
	return s.schemaName(schema) + "/tables/" + table
}

// viewName returns the resource name for a view.
func (s *RPCSuite) viewName(schema, view string) string {
	return s.schemaName(schema) + "/views/" + view
}

func mustAtoi(t *testing.T, s string) int32 {
	t.Helper()

	v, err := strconv.Atoi(s)
	require.NoError(t, err, "parse port %q", s)

	return int32(v)
}

func (s *RPCSuite) requireNotFoundResource(err error, wantType resource.Type, wantName string) {
	s.T().Helper()

	var connectErr *connect.Error
	s.Require().ErrorAs(err, &connectErr)
	s.Equal(connect.CodeNotFound, connectErr.Code())

	for _, detail := range connectErr.Details() {
		value, valueErr := detail.Value()
		s.Require().NoError(valueErr)

		resourceInfo, ok := value.(*errdetails.ResourceInfo)
		if !ok {
			continue
		}

		s.Equal(wantType.String(), resourceInfo.GetResourceType())
		s.Equal(wantName, resourceInfo.GetResourceName())

		return
	}

	s.FailNow("expected ResourceInfo detail on not found error")
}

// requireFieldViolation asserts the connect error carries a BadRequest
// detail whose first FieldViolation targets `wantField`.
func (s *RPCSuite) requireFieldViolation(err error, wantField string) {
	s.T().Helper()

	var connectErr *connect.Error
	s.Require().ErrorAs(err, &connectErr)
	s.Equal(connect.CodeInvalidArgument, connectErr.Code())

	for _, detail := range connectErr.Details() {
		value, valueErr := detail.Value()
		s.Require().NoError(valueErr)

		br, ok := value.(*errdetails.BadRequest)
		if !ok || len(br.GetFieldViolations()) == 0 {
			continue
		}

		s.Equal(wantField, br.GetFieldViolations()[0].GetField())

		return
	}

	s.FailNow("expected BadRequest detail with field violation")
}

func (s *RPCSuite) requireErrorInfoMetadata(err error, want map[string]string) {
	s.T().Helper()

	var connectErr *connect.Error
	s.Require().ErrorAs(err, &connectErr)

	for _, detail := range connectErr.Details() {
		value, valueErr := detail.Value()
		s.Require().NoError(valueErr)

		info, ok := value.(*errdetails.ErrorInfo)
		if !ok {
			continue
		}

		for key, wantValue := range want {
			s.Equal(wantValue, info.GetMetadata()[key], "ErrorInfo metadata %q", key)
		}

		return
	}

	s.FailNow("expected ErrorInfo detail")
}
