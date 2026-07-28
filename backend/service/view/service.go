// Package view provides the ViewService implementation for managing
// view resources within external database schemas.
package view

import (
	"context"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.ViewServiceHandler = (*Service)(nil)

const maxSynchronousRefreshTimeout = 30 * time.Second

type viewCatalog interface {
	ListViews(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.View, string, error)
	GetView(ctx context.Context, view resource.ViewName) (*engine.View, error)
	ListViewDependencies(ctx context.Context, view resource.ViewName, params aip.Params) ([]engine.ViewDependency, string, error)
	RefreshMaterializedView(ctx context.Context, view resource.ViewName, concurrently bool) (*engine.View, error)
}

// Service implements the ViewService RPC handlers.
type Service struct {
	catalog        viewCatalog
	liveQueries    liveQueryLimiter
	refreshTimeout time.Duration
}

type liveQueryLimiter interface {
	Acquire(instance resource.InstanceName) (livequery.Release, error)
}

// NewService creates a new ViewService.
func NewService(catalog viewCatalog, liveQueries liveQueryLimiter, refreshTimeout time.Duration) *Service {
	if liveQueries == nil {
		panic("view.NewService: live query limiter is required") //nolint:forbidigo // programmer error during DI setup
	}

	if refreshTimeout <= 0 {
		panic("view.NewService: materialized view refresh timeout must be positive") //nolint:forbidigo // programmer error during DI setup
	}

	if refreshTimeout > maxSynchronousRefreshTimeout {
		panic("view.NewService: materialized view refresh timeout must not exceed 30s") //nolint:forbidigo // programmer error during DI setup
	}

	return &Service{catalog: catalog, liveQueries: liveQueries, refreshTimeout: refreshTimeout}
}

// ListViews lists views in a schema.
func (s *Service) ListViews(ctx context.Context, req *connect.Request[v1alpha1.ListViewsRequest]) (*connect.Response[v1alpha1.ListViewsResponse], error) {
	schemaRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseSchemaName)
	if connErr != nil {
		return nil, connErr
	}

	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	views, nextToken, err := s.catalog.ListViews(ctx, schemaRes, params)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeView, Name: schemaRes.String(), Op: "list_views",
		})
	}

	isFull := req.Msg.GetView() == v1alpha1.ViewView_VIEW_VIEW_FULL

	pbViews := make([]*v1alpha1.View, 0, len(views))

	for _, v := range views {
		pbViews = append(pbViews, convertViewToProto(v, schemaRes, isFull))
	}

	return connect.NewResponse(&v1alpha1.ListViewsResponse{
		Views:         pbViews,
		NextPageToken: nextToken,
	}), nil
}

// GetView retrieves a single view.
func (s *Service) GetView(ctx context.Context, req *connect.Request[v1alpha1.GetViewRequest]) (*connect.Response[v1alpha1.GetViewResponse], error) {
	viewRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseViewName)
	if connErr != nil {
		return nil, connErr
	}

	v, err := s.catalog.GetView(ctx, viewRes)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "get_view",
		})
	}

	isFull := req.Msg.GetView() == v1alpha1.ViewView_VIEW_VIEW_FULL

	return connect.NewResponse(&v1alpha1.GetViewResponse{
		View: convertViewToProto(*v, viewRes.Schema(), isFull),
	}), nil
}

// ListViewDependencies returns direct upstream and downstream relations.
func (s *Service) ListViewDependencies(ctx context.Context, req *connect.Request[v1alpha1.ListViewDependenciesRequest]) (*connect.Response[v1alpha1.ListViewDependenciesResponse], error) {
	viewRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseViewName)
	if connErr != nil {
		return nil, connErr
	}

	release, err := s.liveQueries.Acquire(viewRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "list_view_dependencies",
		})
	}
	defer release()

	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	dependencies, nextToken, err := s.catalog.ListViewDependencies(ctx, viewRes, params)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "list_view_dependencies",
		})
	}

	pbDependencies := make([]*v1alpha1.ViewDependency, 0, len(dependencies))
	for _, dependency := range dependencies {
		pbDependencies = append(pbDependencies, convertDependencyToProto(dependency, viewRes))
	}

	return connect.NewResponse(&v1alpha1.ListViewDependenciesResponse{
		ViewDependencies: pbDependencies,
		NextPageToken:    nextToken,
	}), nil
}

// RefreshMaterializedView replaces a materialized view's stored rows.
func (s *Service) RefreshMaterializedView(ctx context.Context, req *connect.Request[v1alpha1.RefreshMaterializedViewRequest]) (*connect.Response[v1alpha1.RefreshMaterializedViewResponse], error) {
	viewRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseViewName)
	if connErr != nil {
		return nil, connErr
	}

	var concurrently bool

	switch req.Msg.GetMode() {
	case v1alpha1.RefreshMaterializedViewMode_REFRESH_MATERIALIZED_VIEW_MODE_UNSPECIFIED,
		v1alpha1.RefreshMaterializedViewMode_REFRESH_MATERIALIZED_VIEW_MODE_STANDARD:
		concurrently = false
	case v1alpha1.RefreshMaterializedViewMode_REFRESH_MATERIALIZED_VIEW_MODE_CONCURRENT:
		concurrently = true
	default:
		return nil, apierrors.MapEngineErr(ctx, engine.NewInvalidQueryError("mode", "unsupported refresh mode"), apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "refresh_materialized_view",
		})
	}

	release, err := s.liveQueries.Acquire(viewRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "refresh_materialized_view",
		})
	}
	defer release()

	refreshCtx, cancel := context.WithTimeout(ctx, s.refreshTimeout)
	defer cancel()

	refreshed, err := s.catalog.RefreshMaterializedView(refreshCtx, viewRes, concurrently)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			err = fmt.Errorf("materialized view refresh exceeded its deadline: %w", engine.ErrQueryTimeout)
		}

		return nil, apierrors.MapEngineErr(refreshCtx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "refresh_materialized_view",
		})
	}

	return connect.NewResponse(&v1alpha1.RefreshMaterializedViewResponse{
		View: convertViewToProto(*refreshed, viewRes.Schema(), true),
	}), nil
}

func convertDependencyToProto(dependency engine.ViewDependency, viewRes resource.ViewName) *v1alpha1.ViewDependency {
	var relation string

	switch dependency.RelationType {
	case v1alpha1.ViewDependency_RELATION_TYPE_VIEW,
		v1alpha1.ViewDependency_RELATION_TYPE_MATERIALIZED_VIEW:
		relation = resource.NewViewName(
			viewRes.InstanceID, viewRes.DatabaseID, dependency.SchemaName, dependency.Name,
		).String()
	case v1alpha1.ViewDependency_RELATION_TYPE_TABLE,
		v1alpha1.ViewDependency_RELATION_TYPE_FOREIGN_TABLE,
		v1alpha1.ViewDependency_RELATION_TYPE_PARTITIONED_TABLE,
		v1alpha1.ViewDependency_RELATION_TYPE_UNSPECIFIED:
		relation = resource.NewTableName(
			viewRes.InstanceID, viewRes.DatabaseID, dependency.SchemaName, dependency.Name,
		).String()
	}

	return &v1alpha1.ViewDependency{
		Name:         viewRes.String() + "/viewDependencies/" + dependency.ResourceID,
		Relation:     relation,
		SchemaName:   dependency.SchemaName,
		DisplayName:  dependency.Name,
		Direction:    dependency.Direction,
		RelationType: dependency.RelationType,
	}
}

func convertViewToProto(v engine.View, schemaRes resource.SchemaName, isFull bool) *v1alpha1.View {
	viewRes := resource.NewViewName(schemaRes.InstanceID, schemaRes.DatabaseID, schemaRes.SchemaID, v.Name)

	pb := &v1alpha1.View{
		Name:         viewRes.String(),
		DisplayName:  v.DisplayName,
		ViewType:     v.ViewType,
		Owner:        v.Owner,
		Comment:      v.Comment,
		IsSystemView: v.IsSystemView,
		SizeBytes:    v.SizeBytes,
		RowCount:     v.RowCount,
		IsPopulated:  v.IsPopulated,
	}

	if isFull {
		pb.Definition = v.Definition
	}

	if v.CreateTime != nil {
		pb.CreateTime = timestamppb.New(*v.CreateTime)
	}

	if v.LastDDLTime != nil {
		pb.LastDdlTime = timestamppb.New(*v.LastDDLTime)
	}

	return pb
}
