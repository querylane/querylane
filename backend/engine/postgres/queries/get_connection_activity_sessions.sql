WITH activity AS (
    SELECT
    pid::integer AS pid,
    coalesce(usename, '') AS username,
    coalesce(nullif(application_name, ''), '(unnamed)') AS application_name,
    coalesce(datname, '—') AS database_name,
    coalesce(state, 'unknown') AS state,
    greatest(
        0,
        floor(extract(epoch FROM now() - coalesce(
            CASE
                WHEN state LIKE 'idle in transaction%' THEN xact_start
                ELSE query_start
            END,
            state_change,
            backend_start,
            now()
        )))
    )::bigint AS duration_seconds,
    coalesce(query, '') AS query,
    coalesce(wait_event_type, '') AS wait_event_type,
    coalesce(wait_event, '') AS wait_event,
    coalesce((pg_blocking_pids(pid))[1], 0)::integer AS blocked_by_pid,
    greatest(
        0,
        floor(extract(epoch FROM now() - coalesce(backend_start, now())))
    )::bigint AS backend_age_seconds,
    -- greatest() ignores NULL operands, so guard explicitly: a session with
    -- no open transaction (or no query yet) must stay NULL, not become 0.
    CASE
        WHEN xact_start IS NULL THEN NULL
        ELSE greatest(0, floor(extract(epoch FROM now() - xact_start)))::bigint
    END AS transaction_age_seconds,
    CASE
        WHEN query_start IS NULL THEN NULL
        ELSE greatest(0, floor(extract(epoch FROM now() - query_start)))::bigint
    END AS query_age_seconds,
    coalesce(host(client_addr), '') AS client_address,
    CASE
        WHEN client_port IS NULL OR client_port < 0 THEN 0
        ELSE client_port
    END::integer AS client_port
    FROM pg_stat_activity
    WHERE backend_type = 'client backend'
)
SELECT
    pid,
    username,
    application_name,
    database_name,
    state,
    duration_seconds,
    query,
    wait_event_type,
    wait_event,
    blocked_by_pid,
    backend_age_seconds,
    transaction_age_seconds,
    query_age_seconds,
    client_address,
    client_port
FROM activity
ORDER BY
    EXISTS (
        SELECT 1
        FROM activity blocked
        WHERE blocked.blocked_by_pid = activity.pid
    ) DESC,
    (blocked_by_pid > 0) DESC,
    (wait_event_type = 'Lock') DESC,
    (state LIKE 'idle in transaction%') DESC,
    duration_seconds DESC,
    pid ASC
LIMIT 50
