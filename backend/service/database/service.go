// Package database provides the DatabaseService implementation for managing
// database resources within external instances.
package database

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

// Ensure Service implements the DatabaseServiceHandler interface at compile time.
var _ v1connect.DatabaseServiceHandler = (*Service)(nil)

// Service provides database CRUD functionality for external instances.
// It implements the DatabaseServiceHandler interface and serves database
// management operations for managed database instances.
type Service struct {
	catalog       databaseCatalog
	queryInsights databaseQueryInsightsProvider
}

type databaseCatalog interface {
	ListDatabases(ctx context.Context, instance resource.InstanceName, params aip.Params) ([]engine.Database, string, error)
	GetDatabase(ctx context.Context, db resource.DatabaseName) (*engine.Database, error)
}

type databaseQueryInsightsProvider interface {
	GetDatabaseQueryInsights(ctx context.Context, db resource.DatabaseName) (*engine.DatabaseQueryInsights, error)
}

// NewService creates a new instance of the database service.
func NewService(catalog databaseCatalog, queryInsights databaseQueryInsightsProvider) *Service {
	return &Service{
		catalog:       catalog,
		queryInsights: queryInsights,
	}
}

// ListDatabases returns a paginated list of databases within the specified instance.
func (s *Service) ListDatabases(ctx context.Context, req *connect.Request[v1alpha1.ListDatabasesRequest]) (*connect.Response[v1alpha1.ListDatabasesResponse], error) {
	// Parse the parent instance name
	instanceResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseInstanceName)
	if connErr != nil {
		return nil, connErr
	}

	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	databases, nextToken, err := s.catalog.ListDatabases(ctx, instanceResource, params)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeDatabase,
			Name: instanceResource.String(),
			Op:   "list_databases",
		})
	}

	// Convert to protobuf format
	pbDatabases := s.convertDatabases(databases, instanceResource.InstanceID)

	res := &v1alpha1.ListDatabasesResponse{
		Databases:     pbDatabases,
		NextPageToken: nextToken,
	}

	return connect.NewResponse(res), nil
}

// GetDatabase retrieves details for a specific database within an instance.
func (s *Service) GetDatabase(ctx context.Context, req *connect.Request[v1alpha1.GetDatabaseRequest]) (*connect.Response[v1alpha1.GetDatabaseResponse], error) {
	// Parse the database resource name
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	database, err := s.catalog.GetDatabase(ctx, databaseResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: databaseResource.ResourceType(),
			Name: databaseResource.String(),
			Op:   "get_database",
		})
	}

	// Convert to protobuf format
	pbDatabase := s.convertDatabaseToProto(*database, databaseResource.InstanceID)

	res := &v1alpha1.GetDatabaseResponse{
		Database: pbDatabase,
	}

	return connect.NewResponse(res), nil
}

// GetDatabaseQueryInsights returns live query optimization signals for a database.
func (s *Service) GetDatabaseQueryInsights(ctx context.Context, req *connect.Request[v1alpha1.GetDatabaseQueryInsightsRequest]) (*connect.Response[v1alpha1.GetDatabaseQueryInsightsResponse], error) {
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	insights, err := s.queryInsights.GetDatabaseQueryInsights(ctx, databaseResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: databaseResource.ResourceType(),
			Name: databaseResource.String(),
			Op:   "get_database_query_insights",
		})
	}

	var partialErrors []engine.OverviewMetricError
	if insights != nil {
		partialErrors = insights.PartialErrors
	}

	resp := &v1alpha1.GetDatabaseQueryInsightsResponse{
		QueryInsights: convertQueryInsightsToProto(insights),
		PartialErrors: convertQueryInsightPartialErrors(partialErrors),
	}

	return connect.NewResponse(resp), nil
}

// convertDatabaseToProto converts a connection layer Database to protobuf format.
func (s *Service) convertDatabaseToProto(db engine.Database, instanceID string) *v1alpha1.Database {
	databaseResource := resource.NewDatabaseName(instanceID, db.Name)
	resourceName := databaseResource.String()

	pbDatabase := &v1alpha1.Database{
		Name:             resourceName,
		DisplayName:      db.DisplayName,
		CharacterSet:     db.CharacterSet,
		Collation:        db.Collation,
		Owner:            db.Owner,
		IsSystemDatabase: db.IsSystemDatabase,
	}

	// Convert timestamps if available
	if db.LastDDLTime != nil {
		pbDatabase.LastDdlTime = timestamppb.New(*db.LastDDLTime)
	}

	if db.CreateTime != nil {
		pbDatabase.CreateTime = timestamppb.New(*db.CreateTime)
	}

	return pbDatabase
}

// convertDatabases converts databases to protobuf format.
func (s *Service) convertDatabases(databases []engine.Database, instanceID string) []*v1alpha1.Database {
	// Convert all databases to protobuf format
	pbDatabases := make([]*v1alpha1.Database, 0, len(databases))

	for _, db := range databases {
		pbDatabase := s.convertDatabaseToProto(db, instanceID)
		pbDatabases = append(pbDatabases, pbDatabase)
	}

	return pbDatabases
}

func convertQueryInsightsToProto(insights *engine.DatabaseQueryInsights) *v1alpha1.DatabaseQueryInsights {
	queryInsights := &v1alpha1.DatabaseQueryInsights{
		ObservedAt: timestamppb.New(time.Now()),
	}
	if insights == nil {
		return queryInsights
	}

	queryInsights.QueryStatsAvailable = insights.QueryStatsAvailable
	queryInsights.TableStatsAvailable = insights.TableStatsAvailable
	queryInsights.TopQueries = make([]*v1alpha1.QueryRuntimeInsight, 0, len(insights.TopQueries))
	queryInsights.SequentialScanHotspots = make([]*v1alpha1.SequentialScanHotspot, 0, len(insights.SequentialScanHotspots))
	queryInsights.TableCacheHits = make([]*v1alpha1.TableCacheHitInsight, 0, len(insights.TableCacheHits))

	for _, query := range insights.TopQueries {
		queryInsights.TopQueries = append(queryInsights.TopQueries, &v1alpha1.QueryRuntimeInsight{
			QueryId:        query.QueryID,
			Query:          query.Query,
			Calls:          query.Calls,
			TotalTimeMs:    query.TotalTimeMs,
			MeanTimeMs:     query.MeanTimeMs,
			TotalTimeRatio: query.TotalTimeRatio,
		})
	}

	for _, hotspot := range insights.SequentialScanHotspots {
		queryInsights.SequentialScanHotspots = append(queryInsights.SequentialScanHotspots, &v1alpha1.SequentialScanHotspot{
			SchemaName:           hotspot.SchemaName,
			TableName:            hotspot.TableName,
			SequentialScans:      hotspot.SequentialScans,
			SequentialTuplesRead: hotspot.SequentialTuplesRead,
			IndexScans:           hotspot.IndexScans,
			EstimatedLiveRows:    hotspot.EstimatedLiveRows,
			TotalSizeBytes:       hotspot.TotalSizeBytes,
			SequentialScanRatio:  hotspot.SequentialScanRatio,
		})
	}

	for _, cacheHit := range insights.TableCacheHits {
		queryInsights.TableCacheHits = append(queryInsights.TableCacheHits, &v1alpha1.TableCacheHitInsight{
			SchemaName:     cacheHit.SchemaName,
			TableName:      cacheHit.TableName,
			HeapBlocksHit:  cacheHit.HeapBlocksHit,
			HeapBlocksRead: cacheHit.HeapBlocksRead,
			HitRatio:       cacheHit.HitRatio,
			TotalSizeBytes: cacheHit.TotalSizeBytes,
		})
	}

	return queryInsights
}

func convertQueryInsightPartialErrors(partialErrors []engine.OverviewMetricError) []*rpcstatus.Status {
	if len(partialErrors) == 0 {
		return nil
	}

	statuses := make([]*rpcstatus.Status, 0, len(partialErrors))
	for _, partialError := range partialErrors {
		statuses = append(statuses, queryInsightPartialError(partialError.Metric, partialError.Err))
	}

	return statuses
}

func queryInsightPartialError(metric string, err error) *rpcstatus.Status {
	code := connect.CodeUnavailable
	metadata := map[string]string{"metric": metric}
	message := "Query insights unavailable"

	var postgresDetail *v1alpha1.PostgreSqlErrorDetail

	if response, ok := apierrors.PostgresErrorResponseFromError(err, ""); ok {
		code = response.ConnectCode

		message = response.Message
		for key, value := range response.Metadata {
			if value != "" {
				metadata[key] = value
			}
		}

		postgresDetail = response.Detail
	}

	info := &errdetails.ErrorInfo{
		Reason:   "QUERY_INSIGHTS_UNAVAILABLE",
		Domain:   string(apierrors.DomainConsole),
		Metadata: metadata,
	}

	status := &rpcstatus.Status{
		Code:    int32(code),
		Message: message,
	}

	if detail, detailErr := anypb.New(info); detailErr == nil {
		status.Details = append(status.Details, detail)
	}

	if postgresDetail != nil {
		if detail, detailErr := anypb.New(postgresDetail); detailErr == nil {
			status.Details = append(status.Details, detail)
		}
	}

	return status
}
