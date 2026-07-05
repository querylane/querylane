-- Keep the visibility predicate identical to list_database_sizes.sql so the
-- overview total and the probe's per-database samples cover the same set.
SELECT coalesce(sum(pg_database_size(datname)), 0)::bigint
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
