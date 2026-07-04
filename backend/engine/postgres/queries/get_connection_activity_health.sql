WITH activity AS (
    SELECT state, wait_event_type, xact_start
    FROM pg_stat_activity
    WHERE backend_type = 'client backend'
), totals AS (
    SELECT
        count(*) FILTER (WHERE state = 'active')::integer AS active_connections,
        count(*) FILTER (WHERE state = 'idle')::integer AS idle_connections,
        count(*) FILTER (WHERE state LIKE 'idle in transaction%')::integer AS idle_in_transaction_connections,
        count(*)::integer AS total_connections,
        current_setting('max_connections')::integer AS max_connections,
        count(*) FILTER (WHERE wait_event_type = 'Lock')::integer AS waiting_for_lock_connections,
        count(*) FILTER (
            WHERE xact_start IS NOT NULL
              AND now() - xact_start >= interval '5 minutes'
        )::integer AS long_running_transaction_connections,
        coalesce(
            floor(extract(epoch FROM max(now() - xact_start) FILTER (WHERE xact_start IS NOT NULL))),
            0
        )::bigint AS longest_transaction_seconds
    FROM activity
)
SELECT
    active_connections,
    idle_connections,
    idle_in_transaction_connections,
    total_connections,
    max_connections,
    CASE WHEN max_connections = 0 THEN 0.0
         ELSE total_connections::double precision / max_connections
    END AS utilization_ratio,
    waiting_for_lock_connections,
    long_running_transaction_connections,
    longest_transaction_seconds
FROM totals
