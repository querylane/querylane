package catalog_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

func TestIntegrationCatalogListNameContainsFilterIsCaseInsensitive(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	repo := catalog.New(storage.NewTestDB(t).DB())
	now := time.Now()

	require.NoError(t, repo.SyncDatabases(ctx, "inst", []model.CatalogDatabase{
		{InstanceID: "inst", Name: "Inventory", DisplayName: "Inventory", Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", Name: "billing", DisplayName: "billing", Owner: "owner", SyncedAt: now},
	}))
	require.NoError(t, repo.SyncSchemas(ctx, "inst", "db", []model.CatalogSchema{
		{InstanceID: "inst", DatabaseName: "db", Name: "public", DisplayName: "public", Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "db", Name: "Audit", DisplayName: "Audit", Owner: "owner", SyncedAt: now},
	}))
	require.NoError(t, repo.SyncTables(ctx, "inst", "db", "public", []model.CatalogTable{
		{InstanceID: "inst", DatabaseName: "db", SchemaName: "public", Name: "Invoices", DisplayName: "Invoices", Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "db", SchemaName: "public", Name: "payments", DisplayName: "payments", Owner: "owner", SyncedAt: now},
	}))
	require.NoError(t, repo.SyncViews(ctx, "inst", "db", "public", []model.CatalogView{
		{InstanceID: "inst", DatabaseName: "db", SchemaName: "public", Name: "INVOICE_LINES", DisplayName: "INVOICE_LINES", ViewType: int32(consolev1alpha1.View_VIEW_TYPE_STANDARD), Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "db", SchemaName: "public", Name: "daily_totals", DisplayName: "daily_totals", ViewType: int32(consolev1alpha1.View_VIEW_TYPE_STANDARD), Owner: "owner", SyncedAt: now},
	}))

	params := aip.Params{PageSize: 10, Filter: `name:"inv"`, OrderBy: "name asc"}
	databases, _, err := repo.ListDatabases(ctx, "inst", params)
	require.NoError(t, err)
	require.Equal(t, []string{"Inventory"}, namesOfDatabases(databases))

	schemas, _, err := repo.ListSchemas(ctx, "inst", "db", aip.Params{PageSize: 10, Filter: `name:"aud"`, OrderBy: "name asc"})
	require.NoError(t, err)
	require.Equal(t, []string{"Audit"}, namesOfSchemas(schemas))

	tables, _, err := repo.ListTables(ctx, "inst", "db", "public", params)
	require.NoError(t, err)
	require.Equal(t, []string{"Invoices"}, namesOfTables(tables))

	views, _, err := repo.ListViews(ctx, "inst", "db", "public", params)
	require.NoError(t, err)
	require.Equal(t, []string{"INVOICE_LINES"}, namesOfViews(views))
}

func TestIntegrationCatalogListAIPFilterGrammar(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	repo := catalog.New(storage.NewTestDB(t).DB())
	now := time.Now()

	require.NoError(t, repo.SyncDatabases(ctx, "inst", []model.CatalogDatabase{
		{InstanceID: "inst", Name: "appdb", DisplayName: "appdb", Owner: "app_owner", SyncedAt: now},
		{InstanceID: "inst", Name: "postgres", DisplayName: "postgres", Owner: "postgres", IsSystemDatabase: true, SyncedAt: now},
	}))
	require.NoError(t, repo.SyncTables(ctx, "inst", "appdb", "public", []model.CatalogTable{
		{InstanceID: "inst", DatabaseName: "appdb", SchemaName: "public", Name: "orders", DisplayName: "orders", TableType: "TABLE_TYPE_BASE_TABLE", Owner: "app_owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "appdb", SchemaName: "public", Name: "events", DisplayName: "events", TableType: "TABLE_TYPE_PARTITIONED", Owner: "app_owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "appdb", SchemaName: "public", Name: "remote_orders", DisplayName: "remote_orders", TableType: "TABLE_TYPE_EXTERNAL", Owner: "app_owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "appdb", SchemaName: "public", Name: "users", DisplayName: "users", TableType: "TABLE_TYPE_BASE_TABLE", Owner: "other_owner", SyncedAt: now},
	}))

	// Substring via the ":" operator.
	databases, _, err := repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 10, Filter: `name:"APP"`})
	require.NoError(t, err)
	require.Equal(t, []string{"appdb"}, namesOfDatabases(databases))

	// Bool equality on a DisableOrdering field.
	databases, _, err = repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 10, Filter: "is_system_database = false"})
	require.NoError(t, err)
	require.Equal(t, []string{"appdb"}, namesOfDatabases(databases))

	// String equality combined with substring.
	tables, _, err := repo.ListTables(ctx, "inst", "appdb", "public", aip.Params{
		PageSize: 10,
		Filter:   `owner = "app_owner" AND name:"ord"`,
	})
	require.NoError(t, err)
	require.Equal(t, []string{"orders", "remote_orders"}, namesOfTables(tables))

	// Bounded table type equality supports advanced table-kind filters.
	tables, _, err = repo.ListTables(ctx, "inst", "appdb", "public", aip.Params{
		PageSize: 10,
		Filter:   `table_type = "TABLE_TYPE_PARTITIONED"`,
	})
	require.NoError(t, err)
	require.Equal(t, []string{"events"}, namesOfTables(tables))

	_, _, err = repo.ListTables(ctx, "inst", "appdb", "public", aip.Params{
		PageSize: 10,
		Filter:   `table_type = "TABLE_TYPE_MATERIALIZED_VIEW"`,
	})
	require.ErrorIs(t, err, aip.ErrInvalidFilter)

	// Unknown fields are rejected with the filter sentinel.
	_, _, err = repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 10, Filter: `nope = "x"`})
	require.ErrorIs(t, err, aip.ErrInvalidFilter)

	// The current UI emits canonical filters, so the legacy function spelling is rejected.
	_, _, err = repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 10, Filter: `name.contains('abc')`})
	require.ErrorIs(t, err, aip.ErrInvalidFilter)
}

func namesOfDatabases(rows []model.CatalogDatabase) []string {
	names := make([]string, len(rows))
	for i, row := range rows {
		names[i] = row.Name
	}

	return names
}

func namesOfSchemas(rows []model.CatalogSchema) []string {
	names := make([]string, len(rows))
	for i, row := range rows {
		names[i] = row.Name
	}

	return names
}

func namesOfTables(rows []model.CatalogTable) []string {
	names := make([]string, len(rows))
	for i, row := range rows {
		names[i] = row.Name
	}

	return names
}

func namesOfViews(rows []model.CatalogView) []string {
	names := make([]string, len(rows))
	for i, row := range rows {
		names[i] = row.Name
	}

	return names
}
