package postgres

import (
	_ "embed"
	"strings"
)

// List queries include SELECT, FROM, JOIN, and WHERE clauses.
// The AIP framework appends cursor predicates, ORDER BY, and LIMIT.

//go:embed queries/list_databases.sql
var databaseListQuery string

//go:embed queries/list_roles.sql
var roleListQuery string

//go:embed queries/list_role_grants.sql
var listRoleGrantsQuery string

//go:embed queries/list_role_owned_objects.sql
var listRoleOwnedObjectsQuery string

//go:embed queries/list_role_default_privileges.sql
var listRoleDefaultPrivilegesQuery string

//go:embed queries/list_public_grants.sql
var listPublicGrantsQuery string

//go:embed queries/list_schemas.sql
var schemaListQuery string

//go:embed queries/list_extensions.sql
var extensionListQuery string

//go:embed queries/list_tables.sql
var rawTableListQuery string

var tableListQuery = hydrateTableQuery(rawTableListQuery, tableTypeSQLExpr, tableSizeSQLExpr)

// Get queries are complete statements with their own WHERE clause.

//go:embed queries/get_database.sql
var getDatabaseQuery string

//go:embed queries/get_role.sql
var getRoleQuery string

//go:embed queries/get_schema.sql
var getSchemaQuery string

//go:embed queries/get_table.sql
var rawGetTableQuery string

var getTableQuery = hydrateTableQuery(rawGetTableQuery, tableTypeSQLExpr, tableSizeSQLExpr)

//go:embed queries/get_table_partition_metadata.sql
var getTablePartitionMetadataQuery string

//go:embed queries/list_table_columns.sql
var listTableColumnsQuery string

//go:embed queries/table_exists.sql
var tableExistsQuery string

//go:embed queries/discover_row_identity.sql
var discoverRowIdentityQuery string

//go:embed queries/list_table_constraints.sql
var listTableConstraintsQuery string

//go:embed queries/list_table_indexes.sql
var listTableIndexesQuery string

//go:embed queries/list_table_policies.sql
var listTablePoliciesQuery string

//go:embed queries/list_table_triggers.sql
var listTableTriggersQuery string

//go:embed queries/get_server_info.sql
var getServerInfoQuery string

//go:embed queries/get_connection_metrics.sql
var getConnectionMetricsQuery string

//go:embed queries/get_storage_metrics.sql
var getStorageMetricsQuery string

//go:embed queries/get_cache_metrics.sql
var getCacheMetricsQuery string

//go:embed queries/get_io_metrics.sql
var getIOMetricsQuery string

//go:embed queries/get_cache_counters.sql
var getCacheCountersQuery string

//go:embed queries/list_database_sizes.sql
var listDatabaseSizesQuery string

//go:embed queries/get_vacuum_counters.sql
var getVacuumCountersQuery string

//go:embed queries/get_top_queries.sql
var getTopQueriesQuery string

//go:embed queries/get_table_query_insights.sql
var getTableQueryInsightsQuery string

//go:embed queries/get_table_cache_hit_insights.sql
var getTableCacheHitInsightsQuery string

//go:embed queries/get_connection_activity_health.sql
var getConnectionActivityHealthQuery string

//go:embed queries/get_connection_activity_by_application.sql
var getConnectionActivityByApplicationQuery string

//go:embed queries/get_connection_activity_sessions.sql
var getConnectionActivitySessionsQuery string

//go:embed queries/get_recovery_state.sql
var getRecoveryStateQuery string

//go:embed queries/get_primary_replication_health.sql
var getPrimaryReplicationHealthQuery string

//go:embed queries/get_replica_replication_health.sql
var getReplicaReplicationHealthQuery string

//go:embed queries/get_stats_access_health.sql
var getStatsAccessHealthQuery string

//go:embed queries/get_pg_stat_statements_config.sql
var getPGStatStatementsConfigQuery string

//go:embed queries/get_pg_stat_statements_stats.sql
var getPGStatStatementsStatsQuery string

//go:embed queries/get_autovacuum_health.sql
var getAutovacuumHealthQuery string

//go:embed queries/list_views.sql
var viewListQuery string

//go:embed queries/get_view.sql
var getViewQuery string

func hydrateTableQuery(query, tableTypeExpr, tableSizeExpr string) string {
	query = strings.ReplaceAll(query, tableTypeSQLPlaceholder, tableTypeExpr)
	query = strings.ReplaceAll(query, tableSizeSQLPlaceholder, tableSizeExpr)

	return query
}
