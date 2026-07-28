package view

import (
	"context"
	"errors"
	"testing"

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
			err = tt.call(t.Context(), NewService(catalog, limiter))

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
	_, err = NewService(catalog, limiter).RefreshMaterializedView(t.Context(), connect.NewRequest(
		&v1alpha1.RefreshMaterializedViewRequest{
			Name: "instances/prod/databases/app/schemas/public/views/daily_revenue",
			Mode: v1alpha1.RefreshMaterializedViewMode(99),
		},
	))

	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.False(t, catalog.refreshCalled)
}

type viewCatalogStub struct {
	dependenciesCalled bool
	refreshCalled      bool
}

func (*viewCatalogStub) ListViews(context.Context, resource.SchemaName, aip.Params) ([]engine.View, string, error) {
	return nil, "", errors.New("unexpected ListViews call")
}

func (*viewCatalogStub) GetView(context.Context, resource.ViewName) (*engine.View, error) {
	return nil, errors.New("unexpected GetView call")
}

func (s *viewCatalogStub) ListViewDependencies(context.Context, resource.ViewName) ([]engine.ViewDependency, error) {
	s.dependenciesCalled = true

	return nil, errors.New("unexpected ListViewDependencies call")
}

func (s *viewCatalogStub) RefreshMaterializedView(context.Context, resource.ViewName, bool) (*engine.View, error) {
	s.refreshCalled = true

	return nil, errors.New("unexpected RefreshMaterializedView call")
}
