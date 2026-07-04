WITH installed AS (
    SELECT e.extversion, n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_stat_statements'
), settings AS (
    SELECT
        current_setting('shared_preload_libraries', true) AS shared_preload_libraries,
        current_setting('pg_stat_statements.track', true) AS track_mode
)
SELECT
    EXISTS(SELECT 1 FROM installed) AS extension_installed,
    coalesce((SELECT nspname FROM installed), '') AS extension_schema,
    coalesce((SELECT extversion FROM installed), '') AS extension_version,
    position('pg_stat_statements' IN coalesce(settings.shared_preload_libraries, '')) > 0 AS shared_preload_configured,
    coalesce(settings.track_mode, '') AS track_mode
FROM settings
