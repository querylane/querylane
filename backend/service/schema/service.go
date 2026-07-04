// Package schema provides the SchemaService implementation for managing
// schema resources within external database instances.
package schema

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/catalogcache"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/service/catalogsync"
)

// Ensure Service implements the SchemaServiceHandler interface at compile time.
var _ v1connect.SchemaServiceHandler = (*Service)(nil)

// Service provides schema CRUD functionality for external instances.
// It implements the SchemaServiceHandler interface and serves schema
// management operations for managed database instances.
type Service struct {
	catalog schemaCatalog
}

type schemaCatalog interface {
	ListSchemasWithSyncMetadata(ctx context.Context, db resource.DatabaseName, params aip.Params) ([]engine.Schema, string, catalogcache.CatalogSyncMetadata, error)
	GetSchema(ctx context.Context, schema resource.SchemaName) (*engine.Schema, error)
}

// NewService creates a new instance of the schema service.
func NewService(catalog schemaCatalog) *Service {
	return &Service{
		catalog: catalog,
	}
}

// ListSchemas returns a paginated list of schemas within the specified database.
func (s *Service) ListSchemas(ctx context.Context, req *connect.Request[v1alpha1.ListSchemasRequest]) (*connect.Response[v1alpha1.ListSchemasResponse], error) {
	// Parse the parent database name
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	schemas, nextToken, syncMetadata, err := s.catalog.ListSchemasWithSyncMetadata(ctx, databaseResource, params)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeSchema,
			Name: databaseResource.String(),
			Op:   "list_schemas",
		})
	}

	// Convert to protobuf format
	pbSchemas := s.convertSchemas(schemas, databaseResource)

	res := &v1alpha1.ListSchemasResponse{
		Schemas:       pbSchemas,
		NextPageToken: nextToken,
		SyncMetadata:  catalogsync.ToProto(syncMetadata),
	}

	return connect.NewResponse(res), nil
}

// GetSchema retrieves details for a specific schema within a database.
func (s *Service) GetSchema(ctx context.Context, req *connect.Request[v1alpha1.GetSchemaRequest]) (*connect.Response[v1alpha1.GetSchemaResponse], error) {
	// Parse the schema resource name
	schemaResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseSchemaName)
	if connErr != nil {
		return nil, connErr
	}

	schema, err := s.catalog.GetSchema(ctx, schemaResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: schemaResource.ResourceType(),
			Name: schemaResource.String(),
			Op:   "get_schema",
		})
	}

	// Convert to protobuf format
	pbSchema := s.convertSchemaToProto(*schema, schemaResource.InstanceID, schemaResource.DatabaseID)

	res := &v1alpha1.GetSchemaResponse{
		Schema: pbSchema,
	}

	return connect.NewResponse(res), nil
}

// convertSchemas converts schemas to protobuf format.
func (s *Service) convertSchemas(schemas []engine.Schema, db resource.DatabaseName) []*v1alpha1.Schema {
	pbSchemas := make([]*v1alpha1.Schema, 0, len(schemas))

	for _, schema := range schemas {
		pbSchema := s.convertSchemaToProto(schema, db.InstanceID, db.DatabaseID)
		pbSchemas = append(pbSchemas, pbSchema)
	}

	return pbSchemas
}

// convertSchemaToProto converts a connection layer Schema to protobuf format.
func (s *Service) convertSchemaToProto(schema engine.Schema, instanceID, dbName string) *v1alpha1.Schema {
	schemaResource := resource.NewSchemaName(instanceID, dbName, schema.Name)
	resourceName := schemaResource.String()

	pbSchema := &v1alpha1.Schema{
		Name:           resourceName,
		DisplayName:    schema.DisplayName,
		Owner:          schema.Owner,
		IsSystemSchema: schema.IsSystemSchema,
	}

	// Convert timestamps if available
	if schema.CreateTime != nil {
		pbSchema.CreateTime = timestamppb.New(*schema.CreateTime)
	}

	if schema.LastDDLTime != nil {
		pbSchema.LastDdlTime = timestamppb.New(*schema.LastDDLTime)
	}

	return pbSchema
}
