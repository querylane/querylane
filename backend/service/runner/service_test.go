package runner

import (
	"context"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

type fakeExecutionLister struct {
	params        aip.Params
	rows          []model.RunnerExecutionState
	nextPageToken string
	err           error
}

func (f *fakeExecutionLister) ListRunnerExecutions(_ context.Context, params aip.Params) ([]model.RunnerExecutionState, string, error) {
	f.params = params
	return f.rows, f.nextPageToken, f.err
}

func TestListRunnerExecutions(t *testing.T) {
	t.Parallel()

	now := time.Now()
	past := now.Add(-time.Minute)
	future := now.Add(time.Minute)
	owner := "replica-a"
	lastErr := "context deadline exceeded"

	lister := &fakeExecutionLister{
		rows: []model.RunnerExecutionState{
			{
				RunnerName:     "probe_cache",
				TargetName:     "instances/prod",
				LeaseOwner:     &owner,
				LeaseExpiresAt: &future,
				LastStartedAt:  &past,
				LastSuccessAt:  &past,
			},
			{
				RunnerName:     "probe_vacuum",
				TargetName:     "instances/prod/databases/appdb",
				LeaseOwner:     &owner,
				LeaseExpiresAt: &past, // expired: a dead replica, not a held lease
				LastStartedAt:  &past,
				LastFinishedAt: &past,
				LastError:      &lastErr,
			},
		},
		nextPageToken: "next",
	}

	svc := NewService(lister)

	res, err := svc.ListRunnerExecutions(t.Context(), connect.NewRequest(&v1alpha1.ListRunnerExecutionsRequest{
		PageSize:  25,
		PageToken: "page-1",
		Filter:    `runner_name = "probe_cache"`,
		OrderBy:   "target desc",
	}))
	require.NoError(t, err)

	assert.Equal(t, aip.Params{
		PageSize:  25,
		PageToken: "page-1",
		Filter:    `runner_name = "probe_cache"`,
		OrderBy:   "target desc",
	}, lister.params, "request params pass through verbatim")
	assert.Equal(t, "next", res.Msg.GetNextPageToken())

	executions := res.Msg.GetRunnerExecutions()
	require.Len(t, executions, 2)

	held := executions[0]
	assert.Equal(t, "probe_cache", held.GetRunnerName())
	assert.Equal(t, "instances/prod", held.GetTarget())
	assert.True(t, held.GetLeaseHeld(), "unexpired lease with owner is held")
	assert.Equal(t, past.Unix(), held.GetLastSuccessAt().AsTime().Unix())
	assert.Nil(t, held.GetLastFinishedAt(), "unset timestamps stay nil")
	assert.Empty(t, held.GetLastError())

	expired := executions[1]
	assert.False(t, expired.GetLeaseHeld(), "expired lease is not held")
	assert.Equal(t, lastErr, expired.GetLastError())
	assert.Equal(t, past.Unix(), expired.GetLastFinishedAt().AsTime().Unix())
}

func TestListRunnerExecutions_MapsListErrors(t *testing.T) {
	t.Parallel()

	lister := &fakeExecutionLister{err: storage.ErrInvalidFilter}
	svc := NewService(lister)

	_, err := svc.ListRunnerExecutions(t.Context(), connect.NewRequest(&v1alpha1.ListRunnerExecutionsRequest{
		Filter: "bogus ===",
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
}
