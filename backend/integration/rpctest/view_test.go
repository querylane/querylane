package rpctest

import (
	"context"
	"time"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func (s *RPCSuite) TestListViews_SalesSchema() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.ListViews(ctx, connect.NewRequest(&consolev1alpha1.ListViewsRequest{
		Parent: s.schemaName("sales"),
	}))
	s.Require().NoError(err)

	names := make(map[string]bool)
	for _, v := range resp.Msg.GetViews() {
		names[v.GetDisplayName()] = true
	}

	s.True(names["customer_orders"], "should contain customer_orders view")
}

func (s *RPCSuite) TestGetView_Full() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.GetView(ctx, connect.NewRequest(&consolev1alpha1.GetViewRequest{
		Name: s.viewName("sales", "customer_orders"),
		View: consolev1alpha1.ViewView_VIEW_VIEW_FULL,
	}))
	s.Require().NoError(err)

	view := resp.Msg.GetView()
	s.Equal("customer_orders", view.GetDisplayName())
	s.Equal(consolev1alpha1.View_VIEW_TYPE_STANDARD, view.GetViewType())
	definition := view.GetDefinition()
	s.NotContains(definition, "CREATE VIEW sales.customer_orders AS")
	s.Contains(definition, "FROM sales.orders")
	s.Contains(definition, "JOIN customers")
	s.Contains(definition, "customer_id")
}

func (s *RPCSuite) TestListViews_AnalyticsSchema() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.ListViews(ctx, connect.NewRequest(&consolev1alpha1.ListViewsRequest{
		Parent: s.schemaName("analytics"),
	}))
	s.Require().NoError(err)

	found := false

	for _, v := range resp.Msg.GetViews() {
		if v.GetDisplayName() == "order_summary" {
			found = true

			s.Equal(consolev1alpha1.View_VIEW_TYPE_MATERIALIZED, v.GetViewType())
		}
	}

	s.True(found, "should contain order_summary materialized view")
}

func (s *RPCSuite) TestMaterializedViewExposesColumnsAndIndexes() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	name := s.viewName("analytics", "order_summary")
	columns, err := s.tableClient.ListTableColumns(ctx, connect.NewRequest(&consolev1alpha1.ListTableColumnsRequest{
		Parent: name,
	}))
	s.Require().NoError(err)
	s.Require().Len(columns.Msg.GetColumns(), 3)
	s.Equal("order_date", columns.Msg.GetColumns()[0].GetColumnName())

	indexes, err := s.tableClient.ListTableIndexes(ctx, connect.NewRequest(&consolev1alpha1.ListTableIndexesRequest{
		Parent: name,
	}))
	s.Require().NoError(err)
	s.Require().Len(indexes.Msg.GetIndexes(), 1)
	s.True(indexes.Msg.GetIndexes()[0].GetIsUnique())
	s.Equal([]string{"order_date"}, indexes.Msg.GetIndexes()[0].GetKeyColumns())
}

func (s *RPCSuite) TestReadMaterializedViewRows() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.tableDataClient.ReadRows(ctx, connect.NewRequest(&consolev1alpha1.ReadRowsRequest{
		Name:     s.viewName("analytics", "order_summary"),
		PageSize: 10,
	}))
	s.Require().NoError(err)
	s.NotEmpty(resp.Msg.GetResultSet().GetColumns())
	s.NotEmpty(resp.Msg.GetResultSet().GetRows())
}

func (s *RPCSuite) TestGetMaterializedViewDependencies() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.GetViewDependencies(ctx, connect.NewRequest(&consolev1alpha1.GetViewDependenciesRequest{
		Name: s.viewName("analytics", "order_summary"),
	}))
	s.Require().NoError(err)
	s.Require().Len(resp.Msg.GetDependencies(), 1)

	dependency := resp.Msg.GetDependencies()[0]
	s.Equal(consolev1alpha1.ViewDependency_DIRECTION_UPSTREAM, dependency.GetDirection())
	s.Equal(consolev1alpha1.ViewDependency_RELATION_TYPE_TABLE, dependency.GetRelationType())
	s.Equal(s.tableName("sales", "orders"), dependency.GetResourceName())
}

func (s *RPCSuite) TestRefreshMaterializedViewConcurrently() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.RefreshMaterializedView(ctx, connect.NewRequest(&consolev1alpha1.RefreshMaterializedViewRequest{
		Name: s.viewName("analytics", "order_summary"),
		Mode: consolev1alpha1.RefreshMaterializedViewMode_REFRESH_MATERIALIZED_VIEW_MODE_CONCURRENT,
	}))
	s.Require().NoError(err)
	s.True(resp.Msg.GetView().GetIsPopulated())
	s.NotEmpty(resp.Msg.GetView().GetDefinition())
}

func (s *RPCSuite) TestListViews_SchemaNotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.viewClient.ListViews(ctx, connect.NewRequest(&consolev1alpha1.ListViewsRequest{
		Parent: s.schemaName("nonexistent_schema"),
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeSchema, s.schemaName("nonexistent_schema"))
}

func (s *RPCSuite) TestGetView_NotFound() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.viewClient.GetView(ctx, connect.NewRequest(&consolev1alpha1.GetViewRequest{
		Name: s.viewName("sales", "nonexistent_view"),
	}))
	s.Require().Error(err)
	s.requireNotFoundResource(err, resource.TypeView, s.viewName("sales", "nonexistent_view"))
}
