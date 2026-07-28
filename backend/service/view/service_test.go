package view

import (
	"context"
	"errors"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/livequery"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestViewLiveOperationsHonorQueryLimit(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		call func(context.Context, *Service) error
	}{
		{
			name: "list dependencies",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.ListViewDependencies(ctx, connect.NewRequest(&v1alpha1.ListViewDependenciesRequest{
					Parent: "instances/prod/databases/app/schemas/public/views/daily_revenue",
				}))

				return err
			},
		},
		{
			name: "refresh materialized view",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.RefreshMaterializedView(ctx, connect.NewRequest(&v1alpha1.RefreshMaterializedViewRequest{
					Name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
				}))

				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			limiter, err := livequery.NewLimiter(1, 1)
			require.NoError(t, err)

			release, err := limiter.Acquire(resource.NewInstanceName("prod"))
			require.NoError(t, err)
			t.Cleanup(release)

			catalog := &viewCatalogStub{}
			err = tt.call(t.Context(), NewService(catalog, limiter, 30*time.Second))

			require.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
			require.False(t, catalog.dependenciesCalled)
			require.False(t, catalog.refreshCalled)
		})
	}
}

func TestRefreshMaterializedViewValidatesModeBeforeAdmission(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	release, err := limiter.Acquire(resource.NewInstanceName("prod"))
	require.NoError(t, err)
	t.Cleanup(release)

	catalog := &viewCatalogStub{}
	_, err = NewService(catalog, limiter, 30*time.Second).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
			Mode: v1alpha1.RefreshMaterializedViewMode(99),
		},
	))

	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.False(t, catalog.refreshCalled)
}

func TestRefreshMaterializedViewAddsConfiguredDeadline(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	const refreshTimeout = time.Second

	startedAt := time.Now()

	catalog := &viewCatalogStub{
		refreshFunc: func(ctx context.Context, _ resource.ViewName, _ bool) (*engine.View, error) {
			deadline, ok := ctx.Deadline()
			require.True(t, ok, "refresh context must have a deadline")
			require.GreaterOrEqual(t, deadline.Sub(startedAt), refreshTimeout)
			require.Less(t, deadline.Sub(startedAt), refreshTimeout+time.Second)

			return &engine.View{}, nil
		},
	}

	_, err = NewService(catalog, limiter, refreshTimeout).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
		},
	))
	require.NoError(t, err)
}

func TestRefreshMaterializedViewReportsConfiguredTimeout(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	catalog := &viewCatalogStub{
		refreshFunc: func(ctx context.Context, _ resource.ViewName, _ bool) (*engine.View, error) {
			<-ctx.Done()

			return nil, ctx.Err()
		},
	}

	_, err = NewService(catalog, limiter, time.Millisecond).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
		},
	))
	require.Equal(t, connect.CodeDeadlineExceeded, connect.CodeOf(err))
}

func TestNewServiceRejectsUnboundedRefreshTimeout(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	require.PanicsWithValue(
		t,
		"view.NewService: materialized view refresh timeout must not exceed 30s",
		func() {
			NewService(&viewCatalogStub{}, limiter, 31*time.Second)
		},
	)
}

func TestListViewDependenciesForwardsAIPParameters(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	wantParams := aip.Params{
		PageSize:  7,
		PageToken: "next",
		Filter:    `direction = "DIRECTION_UPSTREAM"`,
		OrderBy:   "schema_name asc",
	}
	catalog := &viewCatalogStub{
		dependenciesFunc: func(_ context.Context, _ resource.ViewName, params aip.Params) ([]engine.ViewDependency, string, error) {
			require.Equal(t, wantParams, params)

			return []engine.ViewDependency{{ResourceID: "edge"}}, "after", nil
		},
	}

	response, err := NewService(catalog, limiter, 30*time.Second).ListViewDependencies(t.Context(), connect.NewRequest(
		&v1alpha1.ListViewDependenciesRequest{
			Parent:    "instances/prod/databases/app/schemas/public/views/daily_revenue",
			PageSize:  wantParams.PageSize,
			PageToken: wantParams.PageToken,
			Filter:    wantParams.Filter,
			OrderBy:   wantParams.OrderBy,
		},
	))
	require.NoError(t, err)
	require.Len(t, response.Msg.GetViewDependencies(), 1)
	require.Equal(t, "after", response.Msg.GetNextPageToken())
}

type viewCatalogStub struct {
	dependenciesCalled bool
	refreshCalled      bool
	dependenciesFunc   func(context.Context, resource.ViewName, aip.Params) ([]engine.ViewDependency, string, error)
	refreshFunc        func(context.Context, resource.ViewName, bool) (*engine.View, error)
}

func (*viewCatalogStub) ListViews(context.Context, resource.SchemaName, aip.Params) ([]engine.View, string, error) {
	return nil, "", errors.New("unexpected ListViews call")
}

func (*viewCatalogStub) GetView(context.Context, resource.ViewName) (*engine.View, error) {
	return nil, errors.New("unexpected GetView call")
}

func (s *viewCatalogStub) ListViewDependencies(ctx context.Context, name resource.ViewName, params aip.Params) ([]engine.ViewDependency, string, error) {
	s.dependenciesCalled = true

	if s.dependenciesFunc != nil {
		return s.dependenciesFunc(ctx, name, params)
	}

	return nil, "", errors.New("unexpected ListViewDependencies call")
}

func (s *viewCatalogStub) RefreshMaterializedView(ctx context.Context, name resource.ViewName, concurrently bool) (*engine.View, error) {
	s.refreshCalled = true

	if s.refreshFunc != nil {
		return s.refreshFunc(ctx, name, concurrently)
	}

	return nil, errors.New("unexpected RefreshMaterializedView call")
}
