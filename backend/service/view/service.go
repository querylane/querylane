// Package view provides the ViewService implementation for managing
// view resources within external database schemas.
package view

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.ViewServiceHandler = (*Service)(nil)

type viewCatalog interface {
	ListViews(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.View, string, error)
	GetView(ctx context.Context, view resource.ViewName) (*engine.View, error)
}

// Service implements the ViewService RPC handlers.
type Service struct {
	catalog viewCatalog
}

// NewService creates a new ViewService.
func NewService(catalog viewCatalog) *Service {
	return &Service{catalog: catalog}
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
