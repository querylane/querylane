package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestListSchemas_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.schemaClient.ListSchemas(ctx, connect.NewRequest(&consolev1alpha1.ListSchemasRequest{
		Parent: s.databaseName(),
	}))
	s.Require().NoError(err)

	names := make(map[string]bool)
	for _, sch := range resp.Msg.GetSchemas() {
		names[sch.GetDisplayName()] = true
	}

	// The seeded schemas plus the default public schema.
	s.True(names["public"], "should contain public schema")
	s.True(names["sales"], "should contain sales schema")
	s.True(names["analytics"], "should contain analytics schema")
}

func (s *RPCSuite) TestGetSchema_Success() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.schemaClient.GetSchema(ctx, connect.NewRequest(&consolev1alpha1.GetSchemaRequest{
		Name: s.schemaName("public"),
	}))
	s.Require().NoError(err)
	s.Equal("public", resp.Msg.GetSchema().GetDisplayName())
}

func (s *RPCSuite) TestGetSchema_NotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.schemaClient.GetSchema(ctx, connect.NewRequest(&consolev1alpha1.GetSchemaRequest{
		Name: s.schemaName("nonexistent_schema"),
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeSchema, s.schemaName("nonexistent_schema"))
}
