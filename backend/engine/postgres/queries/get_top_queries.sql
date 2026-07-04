WITH ranked AS (
    SELECT
        COALESCE(queryid, 0)::bigint AS query_id,
        query AS query_text,
        calls::bigint AS calls,
        total_exec_time::double precision AS total_time_ms,
        mean_exec_time::double precision AS mean_time_ms
    FROM pg_stat_statements
    WHERE dbid = (
        SELECT oid
        FROM pg_database
        WHERE datname = current_database()
    )
    ORDER BY total_exec_time DESC
    LIMIT 10
), max_total AS (
    SELECT max(total_time_ms) AS value
    FROM ranked
)
SELECT
    query_id,
    query_text,
    calls,
    total_time_ms,
    mean_time_ms,
    CASE WHEN coalesce(max_total.value, 0) = 0 THEN 0.0
         ELSE total_time_ms / max_total.value
    END AS total_time_ratio
FROM ranked
CROSS JOIN max_total
ORDER BY total_time_ms DESC
