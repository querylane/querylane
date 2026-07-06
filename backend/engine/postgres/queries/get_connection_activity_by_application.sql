SELECT
    coalesce(nullif(application_name, ''), '(unnamed)') AS application_name,
    count(*) FILTER (WHERE state = 'active')::integer AS active_connections,
    count(*) FILTER (WHERE state = 'idle')::integer AS idle_connections,
    count(*) FILTER (WHERE state LIKE 'idle in transaction%')::integer AS idle_in_transaction_connections,
    count(*)::integer AS total_connections
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY coalesce(nullif(application_name, ''), '(unnamed)')
ORDER BY total_connections DESC, application_name ASC
LIMIT 10
