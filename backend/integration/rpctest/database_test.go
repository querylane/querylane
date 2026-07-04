package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestListDatabases_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.databaseClient.ListDatabases(ctx, connect.NewRequest(&consolev1alpha1.ListDatabasesRequest{
		Parent: s.instanceName(),
	}))
	s.Require().NoError(err)

	// The external instance should contain at least the test_external database.
	s.GreaterOrEqual(len(resp.Msg.GetDatabases()), 1)

	var found bool

	for _, db := range resp.Msg.GetDatabases() {
		if db.GetDisplayName() == externalDBName {
			found = true

			break
		}
	}

	s.True(found, "database %q should appear in ListDatabases", externalDBName)
}

func (s *RPCSuite) TestListDatabases_InstanceNotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.databaseClient.ListDatabases(ctx, connect.NewRequest(&consolev1alpha1.ListDatabasesRequest{
		Parent: "instances/nonexistent",
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeInstance, "instances/nonexistent")
}

func (s *RPCSuite) TestGetDatabase_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.databaseClient.GetDatabase(ctx, connect.NewRequest(&consolev1alpha1.GetDatabaseRequest{
		Name: s.databaseName(),
	}))
	s.Require().NoError(err)
	s.Equal(externalDBName, resp.Msg.GetDatabase().GetDisplayName())
}

func (s *RPCSuite) TestGetDatabase_NotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.databaseClient.GetDatabase(ctx, connect.NewRequest(&consolev1alpha1.GetDatabaseRequest{
		Name: s.instanceName() + "/databases/nonexistent_db",
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeDatabase, s.instanceName()+"/databases/nonexistent_db")
}
