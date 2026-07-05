// Package runner provides the RunnerService implementation exposing the
// scheduling state of querylane's background jobs (sampling probes and
// maintenance jobs).
package runner

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

var _ v1connect.RunnerServiceHandler = (*Service)(nil)

// runnerExecutionLister pages runner scheduling state from the meta DB.
// Implemented by *storage.PGRunnerExecutionStore.
type runnerExecutionLister interface {
	ListRunnerExecutions(ctx context.Context, params aip.Params) ([]model.RunnerExecutionState, string, error)
}

// Service implements RunnerService RPC handlers.
type Service struct {
	executions runnerExecutionLister
}

// NewService creates a new RunnerService.
func NewService(executions runnerExecutionLister) *Service {
	return &Service{executions: executions}
}

// ListRunnerExecutions returns a paginated list of background-runner
// scheduling state, one entry per (runner, target) pair.
func (s *Service) ListRunnerExecutions(ctx context.Context, req *connect.Request[v1alpha1.ListRunnerExecutionsRequest]) (*connect.Response[v1alpha1.ListRunnerExecutionsResponse], error) {
	params := aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	}

	rows, nextPageToken, err := s.executions.ListRunnerExecutions(ctx, params)
	if err != nil {
		return nil, apierrors.MapRepoErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeRunnerExecution,
			Op:   "list_runner_executions",
		})
	}

	executions := make([]*v1alpha1.RunnerExecution, len(rows))
	for i, row := range rows {
		executions[i] = toProtoRunnerExecution(row, time.Now())
	}

	return connect.NewResponse(&v1alpha1.ListRunnerExecutionsResponse{
		RunnerExecutions: executions,
		NextPageToken:    nextPageToken,
	}), nil
}

// toProtoRunnerExecution maps one lease row to the API shape. now decides
// lease_held: a lease is held only while unexpired — expired leases mean a
// replica died mid-run and the target is up for reclaim.
func toProtoRunnerExecution(row model.RunnerExecutionState, now time.Time) *v1alpha1.RunnerExecution {
	execution := &v1alpha1.RunnerExecution{
		RunnerName: row.RunnerName,
		Target:     row.TargetName,
		LeaseHeld:  row.LeaseOwner != nil && row.LeaseExpiresAt != nil && row.LeaseExpiresAt.After(now),
	}

	if row.LastStartedAt != nil {
		execution.LastStartedAt = timestamppb.New(*row.LastStartedAt)
	}

	if row.LastFinishedAt != nil {
		execution.LastFinishedAt = timestamppb.New(*row.LastFinishedAt)
	}

	if row.LastSuccessAt != nil {
		execution.LastSuccessAt = timestamppb.New(*row.LastSuccessAt)
	}

	if row.LastError != nil {
		execution.LastError = *row.LastError
	}

	return execution
}
