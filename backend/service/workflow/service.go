// Package workflow provides the WorkflowService implementation: a read-only
// view over pg_durable workflow instances in external databases.
package workflow

import (
	"context"
	"errors"
	"strings"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.WorkflowServiceHandler = (*Service)(nil)

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (instanceSession, error)
}

type instanceSession interface {
	OpenDatabase(ctx context.Context, databaseName string) (databaseSession, error)
	Close() error
}

type databaseSession interface {
	ListWorkflows(ctx context.Context, params aip.Params) ([]engine.Workflow, string, error)
	GetWorkflow(ctx context.Context, workflowID string) (*engine.Workflow, error)
	ListWorkflowNodes(ctx context.Context, workflowID string, params aip.Params) ([]engine.WorkflowNode, string, error)
	Close() error
}

type engineInstanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

type engineOpenerAdapter struct {
	opener engineInstanceOpener
}

func (a engineOpenerAdapter) OpenInstance(ctx context.Context, name resource.InstanceName) (instanceSession, error) {
	session, err := a.opener.OpenInstance(ctx, name)
	if err != nil {
		return nil, err
	}

	return engineInstanceSession{InstanceSession: session}, nil
}

type engineInstanceSession struct {
	engine.InstanceSession
}

func (s engineInstanceSession) OpenDatabase(ctx context.Context, databaseName string) (databaseSession, error) {
	session, err := s.InstanceSession.OpenDatabase(ctx, databaseName)
	if err != nil {
		return nil, err
	}

	workflowSession, ok := session.(databaseSession)
	if !ok {
		_ = session.Close()

		return nil, errors.New("engine database session does not support workflows")
	}

	return workflowSession, nil
}

// Service implements WorkflowService RPC handlers.
type Service struct {
	connManager instanceOpener
}

// NewService creates a new WorkflowService.
func NewService(connManager engineInstanceOpener) *Service {
	return newService(engineOpenerAdapter{opener: connManager})
}

func newService(connManager instanceOpener) *Service {
	return &Service{connManager: connManager}
}

// ListWorkflows returns pg_durable workflow instances visible in a database.
func (s *Service) ListWorkflows(ctx context.Context, req *connect.Request[v1alpha1.ListWorkflowsRequest]) (*connect.Response[v1alpha1.ListWorkflowsResponse], error) {
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	rctx := apierrors.ResourceCtx{
		Type: resource.TypeWorkflow,
		Name: databaseResource.String(),
		Op:   "list_workflows",
	}

	dbSession, cleanup, err := s.openDatabase(ctx, databaseResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer cleanup()

	workflows, nextToken, err := dbSession.ListWorkflows(ctx, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	pbWorkflows := make([]*v1alpha1.Workflow, 0, len(workflows))
	for _, workflow := range workflows {
		pbWorkflows = append(pbWorkflows, convertWorkflow(workflow, databaseResource))
	}

	return connect.NewResponse(&v1alpha1.ListWorkflowsResponse{
		Workflows:     pbWorkflows,
		NextPageToken: nextToken,
	}), nil
}

// GetWorkflow returns one pg_durable workflow instance.
func (s *Service) GetWorkflow(ctx context.Context, req *connect.Request[v1alpha1.GetWorkflowRequest]) (*connect.Response[v1alpha1.Workflow], error) {
	workflowResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseWorkflowName)
	if connErr != nil {
		return nil, connErr
	}

	rctx := apierrors.ResourceCtx{
		Type: resource.TypeWorkflow,
		Name: workflowResource.String(),
		Op:   "get_workflow",
	}

	dbSession, cleanup, err := s.openDatabase(ctx, workflowResource.Database())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer cleanup()

	workflow, err := dbSession.GetWorkflow(ctx, workflowResource.WorkflowID)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	return connect.NewResponse(convertWorkflow(*workflow, workflowResource.Database())), nil
}

// ListWorkflowNodes returns the graph nodes of one workflow instance.
func (s *Service) ListWorkflowNodes(ctx context.Context, req *connect.Request[v1alpha1.ListWorkflowNodesRequest]) (*connect.Response[v1alpha1.ListWorkflowNodesResponse], error) {
	workflowResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseWorkflowName)
	if connErr != nil {
		return nil, connErr
	}

	rctx := apierrors.ResourceCtx{
		Type: resource.TypeWorkflow,
		Name: workflowResource.String(),
		Op:   "list_workflow_nodes",
	}

	dbSession, cleanup, err := s.openDatabase(ctx, workflowResource.Database())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer cleanup()

	if _, err := dbSession.GetWorkflow(ctx, workflowResource.WorkflowID); err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	nodes, nextToken, err := dbSession.ListWorkflowNodes(ctx, workflowResource.WorkflowID, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	pbNodes := make([]*v1alpha1.WorkflowNode, 0, len(nodes))
	for _, node := range nodes {
		pbNodes = append(pbNodes, convertWorkflowNode(node))
	}

	return connect.NewResponse(&v1alpha1.ListWorkflowNodesResponse{
		WorkflowNodes: pbNodes,
		NextPageToken: nextToken,
	}), nil
}

// openDatabase opens the instance and database sessions for a request. The
// returned cleanup closes both sessions and is safe to defer immediately.
func (s *Service) openDatabase(ctx context.Context, databaseResource resource.DatabaseName) (databaseSession, func(), error) {
	instSession, err := s.connManager.OpenInstance(ctx, databaseResource.Instance())
	if err != nil {
		return nil, nil, err
	}

	dbSession, err := instSession.OpenDatabase(ctx, databaseResource.DatabaseID)
	if err != nil {
		_ = instSession.Close()

		return nil, nil, err
	}

	cleanup := func() {
		_ = dbSession.Close()
		_ = instSession.Close()
	}

	return dbSession, cleanup, nil
}

func convertWorkflow(workflow engine.Workflow, databaseResource resource.DatabaseName) *v1alpha1.Workflow {
	pbWorkflow := &v1alpha1.Workflow{
		Name:               resource.NewWorkflowName(databaseResource.InstanceID, databaseResource.DatabaseID, workflow.ID).String(),
		WorkflowId:         workflow.ID,
		Label:              workflow.Label,
		FunctionName:       workflow.FunctionName,
		FunctionVersion:    workflow.FunctionVersion,
		Status:             workflowStatusFromString(workflow.Status),
		ExecutionCount:     workflow.ExecutionCount,
		Output:             workflow.Output,
		CurrentExecutionId: workflow.CurrentExecutionID,
	}

	if !workflow.CreateTime.IsZero() {
		pbWorkflow.CreateTime = timestamppb.New(workflow.CreateTime)
	}

	return pbWorkflow
}

func convertWorkflowNode(node engine.WorkflowNode) *v1alpha1.WorkflowNode {
	pbNode := &v1alpha1.WorkflowNode{
		ExecutionId: node.ExecutionID,
		NodeId:      node.NodeID,
		NodeType:    node.NodeType,
		Query:       node.Query,
		ResultName:  node.ResultName,
		LeftNode:    node.LeftNode,
		RightNode:   node.RightNode,
		Status:      node.Status,
		Result:      node.Result,
	}

	if node.UpdatedAt != nil {
		pbNode.UpdateTime = timestamppb.New(*node.UpdatedAt)
	}

	return pbNode
}

// workflowStatusFromString maps pg_durable's raw status vocabulary to the
// proto enum. Unknown values (a preview extension may grow new states) map to
// UNSPECIFIED rather than failing the request.
func workflowStatusFromString(status string) v1alpha1.WorkflowStatus {
	switch strings.ToLower(status) {
	case "pending":
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_PENDING
	case "running":
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_RUNNING
	case "completed":
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_COMPLETED
	case "failed":
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_FAILED
	case "cancelled", "canceled":
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED
	default:
		return v1alpha1.WorkflowStatus_WORKFLOW_STATUS_UNSPECIFIED
	}
}
