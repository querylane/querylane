// Package extension provides the ExtensionService implementation for viewing
// PostgreSQL extensions available in external databases.
package extension

import (
	"context"

	"connectrpc.com/connect"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.ExtensionServiceHandler = (*Service)(nil)

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

// Service implements ExtensionService RPC handlers.
type Service struct {
	connManager instanceOpener
}

// NewService creates a new ExtensionService.
func NewService(connManager instanceOpener) *Service {
	return &Service{connManager: connManager}
}

// ListExtensions returns extensions available in a database.
func (s *Service) ListExtensions(ctx context.Context, req *connect.Request[v1alpha1.ListExtensionsRequest]) (*connect.Response[v1alpha1.ListExtensionsResponse], error) {
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	rctx := apierrors.ResourceCtx{
		Type: databaseResource.ResourceType(),
		Name: databaseResource.String(),
		Op:   "list_extensions",
	}

	instSession, err := s.connManager.OpenInstance(ctx, databaseResource.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, databaseResource.DatabaseID)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer dbSession.Close()

	extensions, nextToken, err := dbSession.ListExtensions(ctx, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	return connect.NewResponse(&v1alpha1.ListExtensionsResponse{
		Extensions:    convertExtensions(extensions, databaseResource),
		NextPageToken: nextToken,
	}), nil
}

func convertExtensions(extensions []engine.Extension, databaseResource resource.DatabaseName) []*v1alpha1.Extension {
	pbExtensions := make([]*v1alpha1.Extension, 0, len(extensions))
	for _, extension := range extensions {
		pbExtensions = append(pbExtensions, convertExtension(extension, databaseResource))
	}

	return pbExtensions
}

func convertExtension(extension engine.Extension, databaseResource resource.DatabaseName) *v1alpha1.Extension {
	return &v1alpha1.Extension{
		Name:             databaseResource.String() + "/extensions/" + extension.Name,
		DisplayName:      extension.Name,
		Schema:           extension.SchemaName,
		DefaultVersion:   extension.DefaultVersion,
		InstalledVersion: extension.InstalledVersion,
		Comment:          extension.Comment,
		Installed:        extension.Installed,
	}
}
