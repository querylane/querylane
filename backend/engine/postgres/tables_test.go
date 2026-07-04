package postgres

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestMapTableType(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  api.Table_TableType
	}{
		{name: "ordinary table", input: "TABLE_TYPE_BASE_TABLE", want: api.Table_TABLE_TYPE_BASE_TABLE},
		{name: "information schema base table", input: "BASE TABLE", want: api.Table_TABLE_TYPE_BASE_TABLE},
		{name: "partitioned table", input: "TABLE_TYPE_PARTITIONED", want: api.Table_TABLE_TYPE_PARTITIONED},
		{name: "foreign table", input: "TABLE_TYPE_EXTERNAL", want: api.Table_TABLE_TYPE_EXTERNAL},
		{name: "temporary table", input: "TABLE_TYPE_TEMPORARY", want: api.Table_TABLE_TYPE_TEMPORARY},
		{name: "unknown", input: "WEIRD", want: api.Table_TABLE_TYPE_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			require.Equal(t, tt.want, mapTableType(tt.input))
		})
	}
}

func TestTableSchemaAllowsTableTypeOrderingAndFiltering(t *testing.T) {
	t.Parallel()

	_, err := aip.BuildPlan(tableCoreSchema, aip.Params{
		Filter:  `table_type = "TABLE_TYPE_EXTERNAL"`,
		OrderBy: "table_type desc, name asc",
	})
	require.NoError(t, err)
}

func TestTableQueriesUsePostgresTableKinds(t *testing.T) {
	t.Parallel()

	for _, query := range []string{tableListQuery, getTableQuery} {
		require.Contains(t, query, "c.relkind IN ('r', 'p', 'f')")
		require.Contains(t, query, tableTypeSQLExpr)
		require.Equal(t, 1, strings.Count(query, tableTypeSQLExpr))
		require.NotContains(t, query, tableTypeSQLPlaceholder)
		require.NotContains(t, query, "t.table_type = 'BASE TABLE'")
	}
}

func TestTableQueriesUsePartitionAwareSize(t *testing.T) {
	t.Parallel()

	sqlExpr := tableExprs["size_bytes"]
	require.NotEmpty(t, sqlExpr)

	require.Contains(t, sqlExpr, "pg_partition_tree(c.oid)")
	require.Contains(t, sqlExpr, "pt.relid <> c.oid")
	require.Contains(t, sqlExpr, "child.relkind = 'f'")

	for _, query := range []string{tableListQuery, getTableQuery} {
		require.Contains(t, query, tableSizeSQLExpr)
		require.Equal(t, 1, strings.Count(query, tableSizeSQLExpr))
		require.NotContains(t, query, tableSizeSQLPlaceholder)
	}
}

func TestTableSchemaAllowsSizeOrdering(t *testing.T) {
	t.Parallel()

	_, err := aip.BuildPlan(tableCoreSchema, aip.Params{OrderBy: "size_bytes desc, name asc"})
	require.NoError(t, err)
}

func TestTableSchemaUsesOIDSizeLookup(t *testing.T) {
	t.Parallel()

	sqlExpr := tableExprs["size_bytes"]
	require.NotEmpty(t, sqlExpr)
	require.Contains(t, sqlExpr, "pg_total_relation_size(c.oid)")
	require.NotContains(t, sqlExpr, "::regclass")
	require.Contains(t, tableListQuery, "pg_total_relation_size(c.oid)")
	require.NotContains(t, tableListQuery, "::regclass")
}

func TestViewQueriesDoNotBuildDDLWithoutDefinitionBodies(t *testing.T) {
	t.Parallel()

	for _, query := range []string{getViewQuery, viewListQuery} {
		emptyBodyBranch := strings.Index(query, "THEN ''")
		formatBranch := strings.Index(query, "ELSE regexp_replace(")
		queryDefinition := strings.Index(query, "regexp_replace(COALESCE(pg_get_viewdef")

		require.NotEqual(t, -1, emptyBodyBranch)
		require.NotEqual(t, -1, formatBranch)
		require.NotEqual(t, -1, queryDefinition)
		require.Equal(t, 2, strings.Count(query, "ELSE regexp_replace("))
		require.NotContains(t, query, "CREATE VIEW")
		require.NotContains(t, query, "CREATE MATERIALIZED VIEW")
		require.Less(t, emptyBodyBranch, formatBranch)
		require.Less(t, formatBranch, queryDefinition)
	}
}
