// Package view provides the ViewService implementation for managing
// view resources within external database schemas.
package view

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	"github.com/querylane/querylane/backend/postgreserrors"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/safety"
	"github.com/querylane/querylane/backend/storage"
)

var _ v1connect.ViewServiceHandler = (*Service)(nil)

const maxSynchronousRefreshTimeout = 30 * time.Second

type viewCatalog interface {
	ListViews(ctx context.Context, schema resource.SchemaName, params aip.Params) ([]engine.View, string, error)
	GetView(ctx context.Context, view resource.ViewName) (*engine.View, error)
	GetViewDependency(ctx context.Context, dependency resource.ViewDependencyName) (*engine.ViewDependency, error)
	ListViewDependencies(ctx context.Context, view resource.ViewName, params aip.Params) ([]engine.ViewDependency, string, error)
	RefreshMaterializedView(ctx context.Context, view resource.ViewName, concurrently bool) (*engine.View, error)
}

// Service implements the ViewService RPC handlers.
type Service struct {
	catalog        viewCatalog
	liveQueries    liveQueryLimiter
	safety         *safety.Gate
	audit          mutationAuditor
	refreshTimeout time.Duration
}

type liveQueryLimiter interface {
	Acquire(instance resource.InstanceName) (livequery.Release, error)
}

type mutationAuditor interface {
	StartMutation(context.Context, storage.AuditMutation) (int64, error)
	FinishMutation(context.Context, int64, storage.AuditMutationState, string) error
}

// NewService creates a new ViewService.
func NewService(catalog viewCatalog, liveQueries liveQueryLimiter, safetyGate *safety.Gate, audit mutationAuditor, refreshTimeout time.Duration) *Service {
	if liveQueries == nil {
		panic("view.NewService: live query limiter is required") //nolint:forbidigo // programmer error during DI setup
	}

	if safetyGate == nil {
		panic("view.NewService: safety gate is required") //nolint:forbidigo // programmer error during DI setup
	}

	if audit == nil {
		panic("view.NewService: mutation auditor is required") //nolint:forbidigo // programmer error during DI setup
	}

	if refreshTimeout <= 0 {
		panic("view.NewService: materialized view refresh timeout must be positive") //nolint:forbidigo // programmer error during DI setup
	}

	if refreshTimeout > maxSynchronousRefreshTimeout {
		panic("view.NewService: materialized view refresh timeout must not exceed 30s") //nolint:forbidigo // programmer error during DI setup
	}

	return &Service{catalog: catalog, liveQueries: liveQueries, safety: safetyGate, audit: audit, refreshTimeout: refreshTimeout}
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

// GetViewDependency retrieves one direct dependency edge.
func (s *Service) GetViewDependency(ctx context.Context, req *connect.Request[v1alpha1.GetViewDependencyRequest]) (*connect.Response[v1alpha1.ViewDependency], error) {
	dependencyRes, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseViewDependencyName)
	if connErr != nil {
		return nil, connErr
	}

	release, err := s.liveQueries.Acquire(dependencyRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dependencyRes.ResourceType(), Name: dependencyRes.String(), Op: "get_view_dependency",
		})
	}
	defer release()

	dependency, err := s.catalog.GetViewDependency(ctx, dependencyRes)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: dependencyRes.ResourceType(), Name: dependencyRes.String(), Op: "get_view_dependency",
		})
	}

	return connect.NewResponse(convertDependencyToProto(*dependency, dependencyRes.Parent())), nil
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

	confirmationTarget := pgx.Identifier{viewRes.SchemaID, viewRes.ViewID}.Sanitize()
	if req.Msg.GetConfirmation() != confirmationTarget {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("confirmation", "must exactly match the qualified view identifier"),
		)
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

	policy, err := s.safety.Policy(ctx, viewRes.Instance())
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeInstance, Name: viewRes.Instance().String(), Op: "refresh_materialized_view",
		})
	}

	if !policy.MutationsAllowed() {
		return nil, apierrors.NewConnectError(
			connect.CodeFailedPrecondition,
			errors.New("this instance is read-only; enable mutations in its safety settings before refreshing materialized views"),
			&errdetails.ErrorInfo{
				Domain:   "console.querylane.dev",
				Reason:   v1alpha1.ErrorReason_FAILED_PRECONDITION.String(),
				Metadata: map[string]string{"instance": viewRes.Instance().String()},
			},
		)
	}

	release, err := s.liveQueries.Acquire(viewRes.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "refresh_materialized_view",
		})
	}
	defer release()

	requestedTimeout := time.Duration(0)
	if req.Msg.GetTimeout() != nil {
		requestedTimeout = req.Msg.GetTimeout().AsDuration()
	}

	refreshTimeout := min(policy.StatementTimeout(requestedTimeout), s.refreshTimeout)

	refreshCtx, cancel := context.WithTimeout(ctx, refreshTimeout)
	defer cancel()

	modifier := ""
	if concurrently {
		modifier = " CONCURRENTLY"
	}

	auditID, err := s.audit.StartMutation(ctx, storage.AuditMutation{
		Actor:        req.Peer().Addr,
		Action:       storage.AuditMutationRefreshMaterializedView,
		Command:      "REFRESH MATERIALIZED VIEW" + modifier + " " + confirmationTarget,
		Target:       viewRes.String(),
		InstanceName: viewRes.Instance().String(),
		DatabaseName: resource.NewDatabaseName(viewRes.InstanceID, viewRes.DatabaseID).String(),
	})
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeAuditLogEntry, Op: "start_mutation_audit",
		})
	}

	refreshed, err := s.catalog.RefreshMaterializedView(refreshCtx, viewRes, concurrently)
	if err != nil {
		s.finishAudit(ctx, auditID, storage.AuditMutationFailed, postgreserrors.RedactedMessage(err, "refresh materialized view"))

		if errors.Is(err, context.DeadlineExceeded) {
			err = fmt.Errorf("materialized view refresh exceeded its deadline: %w", engine.ErrQueryTimeout)
		}

		return nil, apierrors.MapEngineErr(refreshCtx, err, apierrors.ResourceCtx{
			Type: viewRes.ResourceType(), Name: viewRes.String(), Op: "refresh_materialized_view",
		})
	}

	s.finishAudit(ctx, auditID, storage.AuditMutationSucceeded, "refreshed")

	return connect.NewResponse(&v1alpha1.RefreshMaterializedViewResponse{
		View: convertViewToProto(*refreshed, viewRes.Schema(), true),
	}), nil
}

func (s *Service) finishAudit(ctx context.Context, auditID int64, state storage.AuditMutationState, summary string) {
	finishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	defer cancel()

	if err := s.audit.FinishMutation(finishCtx, auditID, state, summary); err != nil {
		slog.ErrorContext(ctx, "failed to finalize mutation audit entry",
			slog.Int64("audit_id", auditID),
			slog.String("state", string(state)),
			slog.String("error", err.Error()))
	}
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
