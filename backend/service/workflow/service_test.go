package workflow

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type fakeOpener struct {
	opened resource.InstanceName
	sess   *fakeInstanceSession
	err    error
}

func (f *fakeOpener) OpenInstance(_ context.Context, name resource.InstanceName) (engine.InstanceSession, error) {
	f.opened = name
	if f.err != nil {
		return nil, f.err
	}

	return f.sess, nil
}

// fakeInstanceSession embeds the interface so only the methods the workflow
// service exercises need real implementations.
type fakeInstanceSession struct {
	engine.InstanceSession

	dbSession       *fakeDatabaseSession
	openDatabaseErr error
	openedDatabase  string
	closed          bool
}

func (f *fakeInstanceSession) OpenDatabase(_ context.Context, name string) (engine.DatabaseSession, error) {
	f.openedDatabase = name
	if f.openDatabaseErr != nil {
		return nil, f.openDatabaseErr
	}

	return f.dbSession, nil
}

func (f *fakeInstanceSession) Close() error {
	f.closed = true
	return nil
}

type fakeDatabaseSession struct {
	engine.DatabaseSession

	params         aip.Params
	workflows      []engine.Workflow
	workflow       *engine.Workflow
	getWorkflowID  string
	nodes          []engine.WorkflowNode
	nodesID        string
	token          string
	err            error
	getWorkflowErr error
	closed         bool
}

func (f *fakeDatabaseSession) ListWorkflows(_ context.Context, params aip.Params) ([]engine.Workflow, string, error) {
	f.params = params

	return f.workflows, f.token, f.err
}

func (f *fakeDatabaseSession) GetWorkflow(_ context.Context, workflowID string) (*engine.Workflow, error) {
	f.getWorkflowID = workflowID

	return f.workflow, f.getWorkflowErr
}

func (f *fakeDatabaseSession) ListWorkflowNodes(_ context.Context, workflowID string, params aip.Params) ([]engine.WorkflowNode, string, error) {
	f.nodesID = workflowID
	f.params = params

	return f.nodes, f.token, f.err
}

func (f *fakeDatabaseSession) Close() error {
	f.closed = true
	return nil
}

func TestListWorkflows(t *testing.T) {
	t.Parallel()

	databaseName := resource.NewDatabaseName("prod", "appdb").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListWorkflowsRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListWorkflowsResponse], err error)
	}{
		{
			name: "opens database and converts workflows",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				workflows: []engine.Workflow{
					{
						ID:             "wf-01hq3",
						Label:          "embed-docs",
						FunctionName:   "adhoc",
						Status:         "running",
						ExecutionCount: 3,
						Output:         `{"rows": 12}`,
					},
					{
						ID:     "wf-01hq4",
						Status: "cancelled",
					},
				},
				token: "next",
			}}},
			req: &v1alpha1.ListWorkflowsRequest{
				Parent:    databaseName,
				PageSize:  25,
				PageToken: "page-1",
				Filter:    `status = "running"`,
				OrderBy:   "name desc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListWorkflowsResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.True(t, opener.sess.closed)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", Filter: `status = "running"`, OrderBy: "name desc"}, opener.sess.dbSession.params)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				workflows := res.Msg.GetWorkflows()
				require.Len(t, workflows, 2)
				got := workflows[0]
				assert.Equal(t, "instances/prod/databases/appdb/workflows/wf-01hq3", got.GetName())
				assert.Equal(t, "wf-01hq3", got.GetWorkflowId())
				assert.Equal(t, "embed-docs", got.GetLabel())
				assert.Equal(t, "adhoc", got.GetFunctionName())
				assert.Equal(t, v1alpha1.WorkflowStatus_WORKFLOW_STATUS_RUNNING, got.GetStatus())
				assert.Equal(t, int64(3), got.GetExecutionCount())
				assert.Equal(t, `{"rows": 12}`, got.GetOutput())
				assert.Equal(t, v1alpha1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED, workflows[1].GetStatus())
			},
		},
		{
			name:   "rejects invalid parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListWorkflowsRequest{Parent: "instances/prod"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListWorkflowsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name: "maps pg_durable not installed to failed precondition",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				err: fmt.Errorf("query execution failed: %w", engine.ErrDurableNotInstalled),
			}}},
			req: &v1alpha1.ListWorkflowsRequest{Parent: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListWorkflowsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.ListWorkflowsRequest{Parent: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListWorkflowsResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListWorkflows(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestGetWorkflow(t *testing.T) {
	t.Parallel()

	workflowName := resource.NewWorkflowName("prod", "appdb", "wf-01hq3").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.GetWorkflowRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.Workflow], err error)
	}{
		{
			name: "opens database and converts workflow",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				workflow: &engine.Workflow{
					ID:                 "wf-01hq3",
					Label:              "embed-docs",
					FunctionName:       "adhoc",
					FunctionVersion:    "v3",
					Status:             "completed",
					Output:             `{"ok": true}`,
					CurrentExecutionID: "exec-9",
				},
			}}},
			req: &v1alpha1.GetWorkflowRequest{Name: workflowName},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.Workflow], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.Equal(t, "wf-01hq3", opener.sess.dbSession.getWorkflowID)
				assert.True(t, opener.sess.closed)
				assert.True(t, opener.sess.dbSession.closed)

				assert.Equal(t, workflowName, res.Msg.GetName())
				assert.Equal(t, "wf-01hq3", res.Msg.GetWorkflowId())
				assert.Equal(t, "v3", res.Msg.GetFunctionVersion())
				assert.Equal(t, "exec-9", res.Msg.GetCurrentExecutionId())
				assert.Equal(t, v1alpha1.WorkflowStatus_WORKFLOW_STATUS_COMPLETED, res.Msg.GetStatus())
			},
		},
		{
			name:   "rejects non-workflow name",
			opener: &fakeOpener{},
			req:    &v1alpha1.GetWorkflowRequest{Name: "instances/prod/databases/appdb"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.Workflow], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name: "maps not-found error",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				getWorkflowErr: engine.ErrWorkflowNotFound,
			}}},
			req: &v1alpha1.GetWorkflowRequest{Name: workflowName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.Workflow], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.GetWorkflow(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestListWorkflowNodes(t *testing.T) {
	t.Parallel()

	workflowName := resource.NewWorkflowName("prod", "appdb", "wf-01hq3").String()
	updatedAt := time.Date(2026, time.July, 1, 12, 0, 0, 0, time.UTC)
	leftNode := "fd79a31b"

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListWorkflowNodesRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListWorkflowNodesResponse], err error)
	}{
		{
			name: "opens database and converts nodes",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				nodes: []engine.WorkflowNode{
					{
						ExecutionID: 1,
						NodeID:      "8bb139e2",
						NodeType:    "THEN",
						LeftNode:    &leftNode,
						Status:      "completed",
						UpdatedAt:   &updatedAt,
					},
					{
						ExecutionID: 1,
						NodeID:      "fd79a31b",
						NodeType:    "SQL",
						Query:       "SELECT 1",
						ResultName:  "batch",
						Status:      "failed",
						Result:      `"SQL execution failed: division by zero"`,
					},
				},
				token: "next",
			}}},
			req: &v1alpha1.ListWorkflowNodesRequest{
				Parent:   workflowName,
				PageSize: 50,
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListWorkflowNodesResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "wf-01hq3", opener.sess.dbSession.nodesID)
				assert.Equal(t, aip.Params{PageSize: 50}, opener.sess.dbSession.params)
				assert.True(t, opener.sess.closed)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				nodes := res.Msg.GetWorkflowNodes()
				require.Len(t, nodes, 2)
				first := nodes[0]
				assert.Equal(t, int64(1), first.GetExecutionId())
				assert.Equal(t, "8bb139e2", first.GetNodeId())
				assert.Equal(t, "THEN", first.GetNodeType())
				assert.Equal(t, "fd79a31b", first.GetLeftNode())
				assert.Nil(t, first.RightNode)
				assert.Equal(t, "completed", first.GetStatus())
				require.NotNil(t, first.GetUpdateTime())
				assert.Equal(t, updatedAt, first.GetUpdateTime().AsTime())

				second := nodes[1]
				assert.Equal(t, "SELECT 1", second.GetQuery())
				assert.Equal(t, "batch", second.GetResultName())
				assert.Equal(t, `"SQL execution failed: division by zero"`, second.GetResult())
				assert.Nil(t, second.LeftNode)
				assert.Nil(t, second.GetUpdateTime())
			},
		},
		{
			name:   "rejects non-workflow parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListWorkflowNodesRequest{Parent: "instances/prod/databases/appdb"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListWorkflowNodesResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name: "maps pg_durable not installed to failed precondition",
			opener: &fakeOpener{sess: &fakeInstanceSession{dbSession: &fakeDatabaseSession{
				err: fmt.Errorf("query execution failed: %w", engine.ErrDurableNotInstalled),
			}}},
			req: &v1alpha1.ListWorkflowNodesRequest{Parent: workflowName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListWorkflowNodesResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListWorkflowNodes(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestWorkflowStatusFromString(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  v1alpha1.WorkflowStatus
	}{
		{input: "pending", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_PENDING},
		{input: "running", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_RUNNING},
		{input: "Running", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_RUNNING},
		{input: "completed", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_COMPLETED},
		{input: "failed", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_FAILED},
		{input: "cancelled", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED},
		{input: "canceled", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED},
		{input: "", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_UNSPECIFIED},
		{input: "suspended", want: v1alpha1.WorkflowStatus_WORKFLOW_STATUS_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run("status "+tt.input, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, workflowStatusFromString(tt.input))
		})
	}
}
