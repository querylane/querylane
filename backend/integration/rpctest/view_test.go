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

func (s *RPCSuite) TestListMaterializedViewDependencies() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := s.viewClient.ListViewDependencies(ctx, connect.NewRequest(&consolev1alpha1.ListViewDependenciesRequest{
		Parent: s.viewName("analytics", "order_summary"),
	}))
	s.Require().NoError(err)
	s.Require().Len(resp.Msg.GetViewDependencies(), 1)

	dependency := resp.Msg.GetViewDependencies()[0]
	s.Equal(consolev1alpha1.ViewDependency_DIRECTION_UPSTREAM, dependency.GetDirection())
	s.Equal(consolev1alpha1.ViewDependency_RELATION_TYPE_TABLE, dependency.GetRelationType())
	s.Equal(s.tableName("sales", "orders"), dependency.GetRelation())
	s.NotEmpty(dependency.GetName())

	getResp, err := s.viewClient.GetViewDependency(ctx, connect.NewRequest(&consolev1alpha1.GetViewDependencyRequest{
		Name: dependency.GetName(),
	}))
	s.Require().NoError(err)
	s.Equal(dependency.GetName(), getResp.Msg.GetName())
	s.Equal(dependency.GetRelation(), getResp.Msg.GetRelation())
	s.Equal(dependency.GetSchemaName(), getResp.Msg.GetSchemaName())
	s.Equal(dependency.GetDisplayName(), getResp.Msg.GetDisplayName())
	s.Equal(dependency.GetDirection(), getResp.Msg.GetDirection())
	s.Equal(dependency.GetRelationType(), getResp.Msg.GetRelationType())

	_, err = s.viewClient.GetViewDependency(ctx, connect.NewRequest(&consolev1alpha1.GetViewDependencyRequest{
		Name: s.viewName("analytics", "order_summary") + "/viewDependencies/d0000000000000000",
	}))
	s.Equal(connect.CodeNotFound, connect.CodeOf(err))
}

func (s *RPCSuite) TestListViewDependenciesPaginates() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	targetDB, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer targetDB.Close()

	_, err = targetDB.ExecContext(ctx, `
		CREATE TABLE public.rpc_dependency_source (id integer);
		CREATE VIEW public.rpc_dependency_target AS SELECT * FROM public.rpc_dependency_source;
		CREATE VIEW public.rpc_dependency_downstream_one AS SELECT * FROM public.rpc_dependency_target;
		CREATE VIEW public.rpc_dependency_downstream_two AS SELECT * FROM public.rpc_dependency_target;
	`)
	s.Require().NoError(err)

	defer func() {
		_, cleanupErr := targetDB.ExecContext(context.Background(), `
			DROP VIEW IF EXISTS public.rpc_dependency_downstream_two;
			DROP VIEW IF EXISTS public.rpc_dependency_downstream_one;
			DROP VIEW IF EXISTS public.rpc_dependency_target;
			DROP TABLE IF EXISTS public.rpc_dependency_source;
		`)
		s.Require().NoError(cleanupErr)
	}()

	parent := s.viewName("public", "rpc_dependency_target")
	first, err := s.viewClient.ListViewDependencies(ctx, connect.NewRequest(&consolev1alpha1.ListViewDependenciesRequest{
		Parent:   parent,
		PageSize: 1,
		OrderBy:  "direction asc, schema_name asc, display_name asc",
	}))
	s.Require().NoError(err)
	s.Require().Len(first.Msg.GetViewDependencies(), 1)
	s.NotEmpty(first.Msg.GetNextPageToken())

	second, err := s.viewClient.ListViewDependencies(ctx, connect.NewRequest(&consolev1alpha1.ListViewDependenciesRequest{
		Parent:    parent,
		PageSize:  1,
		PageToken: first.Msg.GetNextPageToken(),
		OrderBy:   "direction asc, schema_name asc, display_name asc",
	}))
	s.Require().NoError(err)
	s.Require().Len(second.Msg.GetViewDependencies(), 1)
	s.NotEqual(first.Msg.GetViewDependencies()[0].GetName(), second.Msg.GetViewDependencies()[0].GetName())
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

func (s *RPCSuite) TestRefreshMaterializedViewConcurrentRequiresUniqueIndex() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	targetDB, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer targetDB.Close()

	_, err = targetDB.ExecContext(ctx, "DROP INDEX analytics.order_summary_refresh_idx")
	s.Require().NoError(err)

	defer func() {
		_, cleanupErr := targetDB.ExecContext(
			context.Background(),
			"CREATE UNIQUE INDEX order_summary_refresh_idx ON analytics.order_summary (order_date)",
		)
		s.Require().NoError(cleanupErr)
	}()

	_, err = s.viewClient.RefreshMaterializedView(ctx, connect.NewRequest(&consolev1alpha1.RefreshMaterializedViewRequest{
		Name: s.viewName("analytics", "order_summary"),
		Mode: consolev1alpha1.RefreshMaterializedViewMode_REFRESH_MATERIALIZED_VIEW_MODE_CONCURRENT,
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
}

func (s *RPCSuite) TestRefreshMaterializedViewUsesStandardModeWhenUnspecified() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	targetDB, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer targetDB.Close()

	var before int

	err = targetDB.QueryRowContext(ctx, "SELECT sum(order_count) FROM analytics.order_summary").Scan(&before)
	s.Require().NoError(err)

	var insertedOrderID int

	err = targetDB.QueryRowContext(ctx, `
		INSERT INTO sales.orders (customer_id, total_amount)
		VALUES (1, 10)
		RETURNING id
	`).Scan(&insertedOrderID)
	s.Require().NoError(err)

	defer func() {
		_, cleanupErr := targetDB.ExecContext(
			context.Background(),
			"DELETE FROM sales.orders WHERE id = $1",
			insertedOrderID,
		)
		s.Require().NoError(cleanupErr)

		_, cleanupErr = targetDB.ExecContext(context.Background(), "REFRESH MATERIALIZED VIEW analytics.order_summary")
		s.Require().NoError(cleanupErr)
	}()

	_, err = s.viewClient.RefreshMaterializedView(ctx, connect.NewRequest(&consolev1alpha1.RefreshMaterializedViewRequest{
		Name: s.viewName("analytics", "order_summary"),
	}))
	s.Require().NoError(err)

	var after int

	err = targetDB.QueryRowContext(ctx, "SELECT sum(order_count) FROM analytics.order_summary").Scan(&after)
	s.Require().NoError(err)
	s.Equal(before+1, after)
}

func (s *RPCSuite) TestRefreshMaterializedViewRejectsStandardView() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.viewClient.RefreshMaterializedView(ctx, connect.NewRequest(&consolev1alpha1.RefreshMaterializedViewRequest{
		Name: s.viewName("sales", "customer_orders"),
	}))
	s.Require().Error(err)
	s.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	s.requireFieldViolation(err, "name")
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
