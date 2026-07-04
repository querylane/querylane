SELECT
    current_user,
    coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS superuser,
    pg_has_role(current_user, 'pg_monitor', 'member') AS pg_monitor_member,
    pg_has_role(current_user, 'pg_read_all_stats', 'member') AS pg_read_all_stats_member,
    has_table_privilege(current_user, 'pg_catalog.pg_stat_activity', 'SELECT') AS can_read_pg_stat_activity,
    has_table_privilege(current_user, 'pg_catalog.pg_stat_database', 'SELECT') AS can_read_pg_stat_database
