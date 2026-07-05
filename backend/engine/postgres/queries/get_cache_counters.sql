WITH db_stats AS (
    -- JSON row access so columns absent on the connected server -- or on a
    -- PostgreSQL-compatible fork that exposes only a subset of
    -- pg_stat_database -- degrade to 0 instead of raising "column does not
    -- exist" and aborting the whole probe. The session counters (sessions,
    -- sessions_abandoned, sessions_fatal, sessions_killed) are PostgreSQL 14+;
    -- on older servers they simply stay 0. Mirrors get_io_metrics.sql.
    SELECT to_jsonb(d) AS stat
    FROM pg_stat_database AS d
),
totals AS (
    SELECT
        coalesce(sum((stat ->> 'blks_hit')::numeric), 0) AS blocks_hit,
        coalesce(sum((stat ->> 'blks_read')::numeric), 0) AS blocks_read,
        coalesce(sum((stat ->> 'xact_commit')::numeric), 0) AS xact_commit,
        coalesce(sum((stat ->> 'xact_rollback')::numeric), 0) AS xact_rollback,
        coalesce(sum((stat ->> 'tup_returned')::numeric), 0) AS tup_returned,
        coalesce(sum((stat ->> 'tup_fetched')::numeric), 0) AS tup_fetched,
        coalesce(sum((stat ->> 'tup_inserted')::numeric), 0) AS tup_inserted,
        coalesce(sum((stat ->> 'tup_updated')::numeric), 0) AS tup_updated,
        coalesce(sum((stat ->> 'tup_deleted')::numeric), 0) AS tup_deleted,
        coalesce(sum((stat ->> 'conflicts')::numeric), 0) AS conflicts,
        coalesce(sum((stat ->> 'deadlocks')::numeric), 0) AS deadlocks,
        coalesce(sum((stat ->> 'temp_files')::numeric), 0) AS temp_files,
        coalesce(sum((stat ->> 'temp_bytes')::numeric), 0) AS temp_bytes,
        coalesce(sum((stat ->> 'sessions')::numeric), 0) AS sessions,
        coalesce(sum((stat ->> 'sessions_abandoned')::numeric), 0) AS sessions_abandoned,
        coalesce(sum((stat ->> 'sessions_fatal')::numeric), 0) AS sessions_fatal,
        coalesce(sum((stat ->> 'sessions_killed')::numeric), 0) AS sessions_killed,
        max((stat ->> 'stats_reset')::timestamptz) AS stats_reset
    FROM db_stats
)
SELECT
    least(blocks_hit, 9223372036854775807::numeric)::bigint,
    least(blocks_read, 9223372036854775807::numeric)::bigint,
    least(xact_commit, 9223372036854775807::numeric)::bigint,
    least(xact_rollback, 9223372036854775807::numeric)::bigint,
    least(tup_returned, 9223372036854775807::numeric)::bigint,
    least(tup_fetched, 9223372036854775807::numeric)::bigint,
    least(tup_inserted, 9223372036854775807::numeric)::bigint,
    least(tup_updated, 9223372036854775807::numeric)::bigint,
    least(tup_deleted, 9223372036854775807::numeric)::bigint,
    least(conflicts, 9223372036854775807::numeric)::bigint,
    least(deadlocks, 9223372036854775807::numeric)::bigint,
    least(temp_files, 9223372036854775807::numeric)::bigint,
    least(temp_bytes, 9223372036854775807::numeric)::bigint,
    least(sessions, 9223372036854775807::numeric)::bigint,
    least(sessions_abandoned, 9223372036854775807::numeric)::bigint,
    least(sessions_fatal, 9223372036854775807::numeric)::bigint,
    least(sessions_killed, 9223372036854775807::numeric)::bigint,
    stats_reset
FROM totals
