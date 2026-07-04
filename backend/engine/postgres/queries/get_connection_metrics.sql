SELECT
    count(*) FILTER (WHERE state = 'active')::integer,
    count(*) FILTER (WHERE state = 'idle')::integer,
    count(*)::integer,
    current_setting('max_connections')::integer
FROM pg_stat_activity
WHERE backend_type = 'client backend'
