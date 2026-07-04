SELECT
    (SELECT count(*) FROM %s.pg_stat_statements)::bigint AS statement_count,
    stats_reset
FROM %s.pg_stat_statements_info
