// Package table provides the TableService implementation for managing
// table resources within external database schemas.
package table

import (
	"context"
	"errors"

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

// Ensure Service implements the TableServiceHandler interface at compile time.
var _ v1connect.TableServiceHandler = (*Service)(nil)

// Service provides table CRUD functionality for external database schemas.
// It implements the TableServiceHandler interface and serves table
// management operations for managed database instances.
type Service struct {
	catalog tableCatalog
}

type tableCatalog interface {
	ListTablesWithSyncMetadata(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.Table, string, catalogcache.CatalogSyncMetadata, error)
	GetTable(ctx context.Context, table resource.TableName) (*engine.Table, error)
	GetTablePartitionMetadata(ctx context.Context, table resource.TableName) (*engine.TablePartitionMetadata, error)
	ListTableColumns(ctx context.Context, table resource.TableName) ([]engine.Column, error)
	ListTableConstraints(ctx context.Context, table resource.TableName) ([]engine.TableConstraint, error)
	ListTableIndexes(ctx context.Context, table resource.TableName) ([]engine.TableIndex, error)
	ListTablePolicies(ctx context.Context, table resource.TableName) ([]engine.TablePolicy, error)
	ListTableTriggers(ctx context.Context, table resource.TableName) ([]engine.TableTrigger, error)
}

// NewService creates a new instance of the table service.
func NewService(catalog tableCatalog) *Service {
	return &Service{catalog: catalog}
}

// ListTables returns a paginated list of tables within the specified schema.
func (s *Service) ListTables(ctx context.Context, req *connect.Request[v1alpha1.ListTablesRequest]) (*connect.Response[v1alpha1.ListTablesResponse], error) {
	schemaResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseSchemaName)
	if connErr != nil {
		return nil, connErr
	}

	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	tables, nextToken, syncMetadata, err := s.catalog.ListTablesWithSyncMetadata(ctx, schemaResource, params)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeTable,
			Name: schemaResource.String(),
			Op:   "list_tables",
		})
	}

	// Convert to protobuf format
	pbTables := s.convertTables(tables, schemaResource)

	res := &v1alpha1.ListTablesResponse{
		Tables:        pbTables,
		NextPageToken: nextToken,
		SyncMetadata:  catalogsync.ToProto(syncMetadata),
	}

	return connect.NewResponse(res), nil
}

// GetTable retrieves details for a specific table within a schema.
func (s *Service) GetTable(ctx context.Context, req *connect.Request[v1alpha1.GetTableRequest]) (*connect.Response[v1alpha1.GetTableResponse], error) {
	// Parse the table resource name
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	tbl, err := s.catalog.GetTable(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(),
			Name: tableResource.String(),
			Op:   "get_table",
		})
	}

	// Convert to protobuf format
	pbTable := s.convertTableToProto(*tbl, tableResource.Schema())

	res := &v1alpha1.GetTableResponse{
		Table: pbTable,
	}

	return connect.NewResponse(res), nil
}

func (s *Service) GetTablePartitionMetadata(ctx context.Context, req *connect.Request[v1alpha1.GetTablePartitionMetadataRequest]) (*connect.Response[v1alpha1.GetTablePartitionMetadataResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	metadata, err := s.catalog.GetTablePartitionMetadata(ctx, tableResource)

	resourceCtx := apierrors.ResourceCtx{
		Type: tableResource.ResourceType(),
		Name: tableResource.String(),
		Op:   "get_table_partition_metadata",
	}
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, resourceCtx)
	}

	if metadata == nil {
		return nil, apierrors.MapEngineErr(ctx, errors.New("catalog returned nil table partition metadata"), resourceCtx)
	}

	return connect.NewResponse(&v1alpha1.GetTablePartitionMetadataResponse{
		PartitionMetadata: convertPartitionMetadata(*metadata, tableResource.Schema()),
	}), nil
}

// ListTableColumns returns detailed column information for a specific table.
func (s *Service) ListTableColumns(ctx context.Context, req *connect.Request[v1alpha1.ListTableColumnsRequest]) (*connect.Response[v1alpha1.ListTableColumnsResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	columns, err := s.catalog.ListTableColumns(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(),
			Name: tableResource.String(),
			Op:   "list_table_columns",
		})
	}

	// Convert to protobuf format
	pbColumns := convertColumns(columns)

	res := &v1alpha1.ListTableColumnsResponse{
		Columns: pbColumns,
	}

	return connect.NewResponse(res), nil
}

// ListTableConstraints returns constraints for a specific table.
func (s *Service) ListTableConstraints(ctx context.Context, req *connect.Request[v1alpha1.ListTableConstraintsRequest]) (*connect.Response[v1alpha1.ListTableConstraintsResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	constraints, err := s.catalog.ListTableConstraints(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(), Name: tableResource.String(), Op: "list_table_constraints",
		})
	}

	return connect.NewResponse(&v1alpha1.ListTableConstraintsResponse{
		Constraints: convertConstraints(constraints, tableResource.Schema()),
	}), nil
}

// ListTableIndexes returns indexes for a specific table.
func (s *Service) ListTableIndexes(ctx context.Context, req *connect.Request[v1alpha1.ListTableIndexesRequest]) (*connect.Response[v1alpha1.ListTableIndexesResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	indexes, err := s.catalog.ListTableIndexes(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(), Name: tableResource.String(), Op: "list_table_indexes",
		})
	}

	return connect.NewResponse(&v1alpha1.ListTableIndexesResponse{
		Indexes: convertIndexes(indexes),
	}), nil
}

// ListTablePolicies returns row-level security policies for a specific table.
func (s *Service) ListTablePolicies(ctx context.Context, req *connect.Request[v1alpha1.ListTablePoliciesRequest]) (*connect.Response[v1alpha1.ListTablePoliciesResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	policies, err := s.catalog.ListTablePolicies(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(), Name: tableResource.String(), Op: "list_table_policies",
		})
	}

	return connect.NewResponse(&v1alpha1.ListTablePoliciesResponse{
		Policies: convertPolicies(policies),
	}), nil
}

// ListTableTriggers returns triggers for a specific table.
func (s *Service) ListTableTriggers(ctx context.Context, req *connect.Request[v1alpha1.ListTableTriggersRequest]) (*connect.Response[v1alpha1.ListTableTriggersResponse], error) {
	tableResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseTableName)
	if connErr != nil {
		return nil, connErr
	}

	triggers, err := s.catalog.ListTableTriggers(ctx, tableResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: tableResource.ResourceType(), Name: tableResource.String(), Op: "list_table_triggers",
		})
	}

	return connect.NewResponse(&v1alpha1.ListTableTriggersResponse{
		Triggers: convertTriggers(triggers),
	}), nil
}

// convertTableToProto converts a connection layer Table to protobuf format.
func (s *Service) convertTableToProto(table engine.Table, schemaRes resource.SchemaName) *v1alpha1.Table {
	tableResource := resource.NewTableName(schemaRes.InstanceID, schemaRes.DatabaseID, schemaRes.SchemaID, table.Name)
	resourceName := tableResource.String()

	pbTable := &v1alpha1.Table{
		Name:          resourceName,
		DisplayName:   table.DisplayName,
		TableType:     table.TableType,
		IsSystemTable: table.IsSystemTable,
		Comment:       table.Comment,
		Owner:         table.Owner,
		RowCount:      table.RowCount,
		SizeBytes:     table.SizeBytes,
	}

	if table.CreateTime != nil {
		pbTable.CreateTime = timestamppb.New(*table.CreateTime)
	}

	if table.LastDDLTime != nil {
		pbTable.LastDdlTime = timestamppb.New(*table.LastDDLTime)
	}

	return pbTable
}

// convertTables converts tables to protobuf format.
func (s *Service) convertTables(tables []engine.Table, schemaRes resource.SchemaName) []*v1alpha1.Table {
	// Convert all tables to protobuf format
	pbTables := make([]*v1alpha1.Table, 0, len(tables))

	for _, table := range tables {
		pbTable := s.convertTableToProto(table, schemaRes)
		pbTables = append(pbTables, pbTable)
	}

	return pbTables
}

func convertPartitionMetadata(metadata engine.TablePartitionMetadata, schemaRes resource.SchemaName) *v1alpha1.TablePartitionMetadata {
	pb := &v1alpha1.TablePartitionMetadata{
		PartitionKey:   metadata.PartitionKey,
		PartitionBound: metadata.PartitionBound,
		PartitionCount: metadata.PartitionCount,
	}

	if metadata.ParentTableName != "" {
		pb.ParentTable = resource.NewTableName(
			schemaRes.InstanceID,
			schemaRes.DatabaseID,
			metadata.ParentSchemaName,
			metadata.ParentTableName,
		).String()
	}

	pb.ChildPartitions = make([]*v1alpha1.TablePartition, 0, len(metadata.ChildPartitions))
	for _, child := range metadata.ChildPartitions {
		pb.ChildPartitions = append(pb.ChildPartitions, &v1alpha1.TablePartition{
			Table: resource.NewTableName(
				schemaRes.InstanceID,
				schemaRes.DatabaseID,
				child.SchemaName,
				child.TableName,
			).String(),
			DisplayName:    child.TableName,
			PartitionBound: child.PartitionBound,
		})
	}

	return pb
}

// convertColumns converts columns to protobuf format.
func convertColumns(columns []engine.Column) []*v1alpha1.Column {
	pbColumns := make([]*v1alpha1.Column, 0, len(columns))

	for _, column := range columns {
		pbColumn := &v1alpha1.Column{
			ColumnName:             column.Name,
			OrdinalPosition:        column.OrdinalPosition,
			DataType:               column.DataType,
			RawType:                column.RawType,
			IsNullable:             column.IsNullable,
			IsPrimaryKey:           column.IsPrimaryKey,
			DefaultValue:           column.DefaultValue,
			CharacterMaximumLength: column.CharacterMaximumLength,
			Comment:                column.Comment,
			IsUnique:               column.IsUnique,
			IsGenerated:            column.IsGenerated,
			GenerationExpression:   column.GenerationExpression,
			IsIdentity:             column.IsIdentity,
			IdentityGeneration:     column.IdentityGeneration,
		}
		pbColumns = append(pbColumns, pbColumn)
	}

	return pbColumns
}

func convertConstraints(constraints []engine.TableConstraint, schemaRes resource.SchemaName) []*v1alpha1.TableConstraint {
	pb := make([]*v1alpha1.TableConstraint, 0, len(constraints))

	for _, c := range constraints {
		tc := &v1alpha1.TableConstraint{
			ConstraintName:        c.Name,
			Type:                  c.Type,
			ColumnNames:           c.ColumnNames,
			ReferencedColumnNames: c.ReferencedColumnNames,
			OnUpdate:              c.OnUpdate,
			OnDelete:              c.OnDelete,
			Definition:            c.Definition,
		}

		if c.ReferencedTableName != "" {
			tc.ReferencedTable = resource.NewTableName(
				schemaRes.InstanceID, schemaRes.DatabaseID, c.ReferencedSchemaName, c.ReferencedTableName,
			).String()
		}

		pb = append(pb, tc)
	}

	return pb
}

func convertIndexes(indexes []engine.TableIndex) []*v1alpha1.TableIndex {
	pb := make([]*v1alpha1.TableIndex, 0, len(indexes))

	for _, idx := range indexes {
		pb = append(pb, &v1alpha1.TableIndex{
			IndexName:       idx.Name,
			Method:          idx.Method,
			IsUnique:        idx.IsUnique,
			KeyColumns:      idx.KeyColumns,
			IncludedColumns: idx.IncludedColumns,
			Predicate:       idx.Predicate,
			SizeBytes:       idx.SizeBytes,
		})
	}

	return pb
}

func convertPolicies(policies []engine.TablePolicy) []*v1alpha1.TablePolicy {
	pb := make([]*v1alpha1.TablePolicy, 0, len(policies))

	for _, p := range policies {
		pb = append(pb, &v1alpha1.TablePolicy{
			PolicyName:      p.Name,
			Mode:            p.Mode,
			Command:         p.Command,
			Roles:           p.Roles,
			UsingExpression: p.UsingExpression,
			CheckExpression: p.CheckExpression,
		})
	}

	return pb
}

func convertTriggers(triggers []engine.TableTrigger) []*v1alpha1.TableTrigger {
	pb := make([]*v1alpha1.TableTrigger, 0, len(triggers))

	for _, t := range triggers {
		pb = append(pb, &v1alpha1.TableTrigger{
			TriggerName:  t.Name,
			Timing:       t.Timing,
			Events:       t.Events,
			FunctionName: t.FunctionName,
			Enabled:      t.Enabled,
			Definition:   t.Definition,
		})
	}

	return pb
}
