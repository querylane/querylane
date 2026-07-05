SELECT
    coalesce(sum(n_live_tup), 0)::bigint,
    coalesce(sum(n_dead_tup), 0)::bigint,
    coalesce(sum(vacuum_count), 0)::bigint,
    coalesce(sum(autovacuum_count), 0)::bigint,
    (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database())
FROM pg_stat_user_tables
