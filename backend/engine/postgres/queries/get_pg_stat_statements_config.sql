WITH installed AS (
    SELECT e.extversion, n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_stat_statements'
), settings AS (
    -- shared_preload_libraries is a superuser-only GUC: current_setting() raises
    -- 42501 for roles outside pg_read_all_settings, whereas pg_settings simply
    -- omits the row. A missing row yields NULL, which callers treat as unknown.
    SELECT
        (
            SELECT position('pg_stat_statements' IN setting) > 0
            FROM pg_settings
            WHERE name = 'shared_preload_libraries'
        ) AS shared_preload_configured,
        current_setting('pg_stat_statements.track', true) AS track_mode
)
SELECT
    EXISTS(SELECT 1 FROM installed) AS extension_installed,
    coalesce((SELECT nspname FROM installed), '') AS extension_schema,
    coalesce((SELECT extversion FROM installed), '') AS extension_version,
    settings.shared_preload_configured,
    coalesce(settings.track_mode, '') AS track_mode
FROM settings
