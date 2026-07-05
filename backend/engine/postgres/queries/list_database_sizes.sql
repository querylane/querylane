-- pg_database_size raises "permission denied" for databases the caller can
-- neither CONNECT to nor read via pg_read_all_stats (PostgreSQL 14+), and one
-- failing row aborts the whole statement — e.g. RDS's rdsadmin. Mirror the
-- function's ACL check (as psql \l+ does) so inaccessible databases are
-- skipped instead of killing the probe.
SELECT
    datname,
    pg_database_size(datname)::bigint
FROM pg_database
WHERE NOT datistemplate
  AND (
      has_database_privilege(datname, 'CONNECT')
      OR (
          -- to_regrole yields NULL (never an error) when pg_read_all_stats is
          -- absent, so pg_has_role is only reached on servers that define the
          -- role -- a fork lacking it falls back to the CONNECT check instead
          -- of aborting with "role ... does not exist".
          current_setting('server_version_num')::int >= 140000
          AND to_regrole('pg_read_all_stats') IS NOT NULL
          AND pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER')
      )
  )
ORDER BY datname
