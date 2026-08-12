SELECT
    version(),
    current_setting('server_version_num')::integer,
    pg_postmaster_start_time(),
    pg_is_in_recovery(),
    current_setting('max_connections')::integer,
    current_user,
    coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false),
    pg_has_role(current_user, 'pg_execute_server_program', 'member')
