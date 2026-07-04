SELECT
    version(),
    current_setting('server_version_num')::integer,
    pg_postmaster_start_time(),
    pg_is_in_recovery(),
    current_setting('max_connections')::integer
