SELECT coalesce(sum(pg_database_size(datname)), 0)::bigint
FROM pg_database
WHERE NOT datistemplate
