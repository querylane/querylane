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
	"github.com/querylane/querylane/backend/safety"
	"github.com/querylane/querylane/backend/storage"
)

const (
	testViewName         = "instances/prod/databases/app/schemas/public/views/daily_revenue"
	testViewConfirmation = `"public"."daily_revenue"`
)

type viewInstanceReaderStub struct {
	allowMutations bool
}

func (s viewInstanceReaderStub) GetInstance(context.Context, string) (*v1alpha1.Instance, error) {
	return &v1alpha1.Instance{Config: &v1alpha1.PostgresConfig{AllowMutations: s.allowMutations}}, nil
}

type auditRecorderStub struct {
	started  []storage.AuditMutation
	finished []storage.AuditMutationStatus
	startErr error
}

func (s *auditRecorderStub) StartMutation(_ context.Context, mutation storage.AuditMutation) (int64, error) {
	s.started = append(s.started, mutation)
	return 42, s.startErr
}

func (s *auditRecorderStub) FinishMutation(_ context.Context, _ int64, status storage.AuditMutationStatus, _ string) error {
	s.finished = append(s.finished, status)
	return nil
}

func newTestService(catalog viewCatalog, limiter liveQueryLimiter, timeout time.Duration) *Service {
	return NewService(catalog, limiter, safety.NewGate(viewInstanceReaderStub{allowMutations: true}), &auditRecorderStub{}, timeout)
}

func TestViewLiveOperationsHonorQueryLimit(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		call func(context.Context, *Service) error
	}{
		{
			name: "get dependency",
			call: func(ctx context.Context, service *Service) error {
				_, err := service.GetViewDependency(ctx, connect.NewRequest(&v1alpha1.GetViewDependencyRequest{
					Name: "instances/prod/databases/app/schemas/public/views/daily_revenue/viewDependencies/abc123",
				}))

				return err
			},
		},
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
					Name:         testViewName,
					Confirmation: testViewConfirmation,
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
			err = tt.call(t.Context(), newTestService(catalog, limiter, 30*time.Second))

			require.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
			require.False(t, catalog.getDependencyCalled)
			require.False(t, catalog.dependenciesCalled)
			require.False(t, catalog.refreshCalled)
		})
	}
}

func TestGetViewDependencyReturnsNamedEdge(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	wantName := resource.NewViewDependencyName("prod", "app", "public", "daily_revenue", "abc123")
	catalog := &viewCatalogStub{
		getDependencyFunc: func(_ context.Context, name resource.ViewDependencyName) (*engine.ViewDependency, error) {
			require.Equal(t, wantName, name)

			return &engine.ViewDependency{
				ResourceID:   "abc123",
				SchemaName:   "sales",
				Name:         "orders",
				Direction:    v1alpha1.ViewDependency_DIRECTION_UPSTREAM,
				RelationType: v1alpha1.ViewDependency_RELATION_TYPE_TABLE,
			}, nil
		},
	}

	response, err := newTestService(catalog, limiter, 30*time.Second).GetViewDependency(t.Context(), connect.NewRequest(
		&v1alpha1.GetViewDependencyRequest{Name: wantName.String()},
	))
	require.NoError(t, err)
	require.Equal(t, wantName.String(), response.Msg.GetName())
	require.Equal(t, "instances/prod/databases/app/schemas/sales/tables/orders", response.Msg.GetRelation())
}

func TestRefreshMaterializedViewValidatesModeBeforeAdmission(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	release, err := limiter.Acquire(resource.NewInstanceName("prod"))
	require.NoError(t, err)
	t.Cleanup(release)

	catalog := &viewCatalogStub{}
	_, err = newTestService(catalog, limiter, 30*time.Second).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name:         testViewName,
			Confirmation: testViewConfirmation,
			Mode:         v1alpha1.RefreshMaterializedViewMode(99),
		},
	))

	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.False(t, catalog.refreshCalled)
}

func TestRefreshMaterializedViewRequiresExactConfirmation(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	catalog := &viewCatalogStub{}

	_, err = newTestService(catalog, limiter, 30*time.Second).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name:         testViewName,
			Confirmation: "daily_revenue",
		},
	))

	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.False(t, catalog.refreshCalled)
}

func TestRefreshMaterializedViewBlocksReadOnlyInstanceBeforeAdmission(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	catalog := &viewCatalogStub{}
	audit := &auditRecorderStub{}
	service := NewService(catalog, limiter, safety.NewGate(viewInstanceReaderStub{}), audit, 30*time.Second)

	_, err = service.RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{Name: testViewName, Confirmation: testViewConfirmation},
	))

	require.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
	require.False(t, catalog.refreshCalled)
	require.Empty(t, audit.started)
}

func TestRefreshMaterializedViewAuditsSuccessAndFailure(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name       string
		refreshErr error
		wantStatus storage.AuditMutationStatus
	}{
		{name: "success", wantStatus: storage.AuditMutationSucceeded},
		{name: "failure", refreshErr: errors.New("permission denied"), wantStatus: storage.AuditMutationFailed},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			limiter, err := livequery.NewLimiter(1, 1)
			require.NoError(t, err)

			audit := &auditRecorderStub{}
			catalog := &viewCatalogStub{refreshFunc: func(context.Context, resource.ViewName, bool) (*engine.View, error) {
				require.Len(t, audit.started, 1, "attempt must be durable before target execution")

				if test.refreshErr != nil {
					return nil, test.refreshErr
				}

				return &engine.View{}, nil
			}}
			service := NewService(catalog, limiter, safety.NewGate(viewInstanceReaderStub{allowMutations: true}), audit, 30*time.Second)

			_, callErr := service.RefreshMaterializedView(t.Context(), connect.NewRequest(
				&v1alpha1.RefreshMaterializedViewRequest{Name: testViewName, Confirmation: testViewConfirmation},
			))
			if test.refreshErr == nil {
				require.NoError(t, callErr)
			} else {
				require.Error(t, callErr)
			}

			require.Equal(t, []storage.AuditMutationStatus{test.wantStatus}, audit.finished)
			require.Equal(t, "instances/prod", audit.started[0].InstanceName)
			require.Equal(t, "app", audit.started[0].DatabaseName)
			require.Contains(t, audit.started[0].Statement, "REFRESH MATERIALIZED VIEW")
		})
	}
}

func TestRefreshMaterializedViewFailsClosedWhenAuditStartFails(t *testing.T) {
	t.Parallel()

	limiter, err := livequery.NewLimiter(1, 1)
	require.NoError(t, err)

	catalog := &viewCatalogStub{}
	audit := &auditRecorderStub{startErr: errors.New("audit unavailable")}
	service := NewService(catalog, limiter, safety.NewGate(viewInstanceReaderStub{allowMutations: true}), audit, 30*time.Second)

	_, err = service.RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{Name: testViewName, Confirmation: testViewConfirmation},
	))

	require.Error(t, err)
	require.False(t, catalog.refreshCalled, "the target mutation must not run without a durable audit start")
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

	_, err = newTestService(catalog, limiter, refreshTimeout).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name:         testViewName,
			Confirmation: testViewConfirmation,
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

	_, err = newTestService(catalog, limiter, time.Millisecond).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name:         testViewName,
			Confirmation: testViewConfirmation,
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
			newTestService(&viewCatalogStub{}, limiter, 31*time.Second)
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

	response, err := newTestService(catalog, limiter, 30*time.Second).ListViewDependencies(t.Context(), connect.NewRequest(
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
	getDependencyCalled bool
	dependenciesCalled  bool
	refreshCalled       bool
	getDependencyFunc   func(context.Context, resource.ViewDependencyName) (*engine.ViewDependency, error)
	dependenciesFunc    func(context.Context, resource.ViewName, aip.Params) ([]engine.ViewDependency, string, error)
	refreshFunc         func(context.Context, resource.ViewName, bool) (*engine.View, error)
}

func (*viewCatalogStub) ListViews(context.Context, resource.SchemaName, aip.Params) ([]engine.View, string, error) {
	return nil, "", errors.New("unexpected ListViews call")
}

func (*viewCatalogStub) GetView(context.Context, resource.ViewName) (*engine.View, error) {
	return nil, errors.New("unexpected GetView call")
}

func (s *viewCatalogStub) GetViewDependency(ctx context.Context, name resource.ViewDependencyName) (*engine.ViewDependency, error) {
	s.getDependencyCalled = true

	if s.getDependencyFunc != nil {
		return s.getDependencyFunc(ctx, name)
	}

	return nil, errors.New("unexpected GetViewDependency call")
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
