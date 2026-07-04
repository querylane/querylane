package catalog_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/catalog"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
)

// Databases and schemas document display_name as orderable and the catalog
// cache stores it, so order_by must accept it and paginate correctly.
func TestIntegrationCatalogListOrderByDisplayName(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	ctx := context.Background()
	repo := catalog.New(storage.NewTestDB(t).DB())
	now := time.Now()

	// Display names sort in the opposite order of names so the test fails if
	// ordering falls back to name.
	require.NoError(t, repo.SyncDatabases(ctx, "inst", []model.CatalogDatabase{
		{InstanceID: "inst", Name: "alpha", DisplayName: "zeta", Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", Name: "beta", DisplayName: "apex", Owner: "owner", SyncedAt: now},
	}))
	require.NoError(t, repo.SyncSchemas(ctx, "inst", "alpha", []model.CatalogSchema{
		{InstanceID: "inst", DatabaseName: "alpha", Name: "first", DisplayName: "omega", Owner: "owner", SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "alpha", Name: "second", DisplayName: "delta", Owner: "owner", SyncedAt: now},
	}))
	require.NoError(t, repo.SyncTables(ctx, "inst", "alpha", "first", []model.CatalogTable{
		{InstanceID: "inst", DatabaseName: "alpha", SchemaName: "first", Name: "small", DisplayName: "small", Owner: "owner", SizeBytes: 10, SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "alpha", SchemaName: "first", Name: "large", DisplayName: "large", Owner: "owner", SizeBytes: 200, SyncedAt: now},
		{InstanceID: "inst", DatabaseName: "alpha", SchemaName: "first", Name: "medium", DisplayName: "medium", Owner: "owner", SizeBytes: 100, SyncedAt: now},
	}))

	t.Run("databases", func(t *testing.T) {
		t.Parallel()

		databases, _, err := repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 10, OrderBy: "display_name desc"})
		require.NoError(t, err)
		require.Equal(t, []string{"alpha", "beta"}, namesOfDatabases(databases))

		// Keyset pagination must resume correctly on the display_name cursor.
		firstPage, token, err := repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 1, OrderBy: "display_name desc"})
		require.NoError(t, err)
		require.Equal(t, []string{"alpha"}, namesOfDatabases(firstPage))
		require.NotEmpty(t, token)

		secondPage, token, err := repo.ListDatabases(ctx, "inst", aip.Params{PageSize: 1, OrderBy: "display_name desc", PageToken: token})
		require.NoError(t, err)
		require.Equal(t, []string{"beta"}, namesOfDatabases(secondPage))
		require.Empty(t, token)
	})

	t.Run("schemas", func(t *testing.T) {
		t.Parallel()

		schemas, _, err := repo.ListSchemas(ctx, "inst", "alpha", aip.Params{PageSize: 10, OrderBy: "display_name desc"})
		require.NoError(t, err)
		require.Equal(t, []string{"first", "second"}, namesOfSchemas(schemas))
	})

	t.Run("tables", func(t *testing.T) {
		t.Parallel()

		tables, _, err := repo.ListTables(ctx, "inst", "alpha", "first", aip.Params{PageSize: 10, OrderBy: "size_bytes desc"})
		require.NoError(t, err)
		require.Equal(t, []string{"large", "medium", "small"}, namesOfTables(tables))
	})
}
