-- Autovacuum worker saturation and most recent auto-maintenance activity.
--
-- running_workers and max_workers are instance-wide: autovacuum workers are a
-- cluster-level resource, and pg_stat_activity lists every backend on the
-- server. last_autovacuum_at, however, is derived from pg_stat_all_tables,
-- which is PER CONNECTED DATABASE, so it reflects only the database this
-- connection is attached to, not the whole cluster.
--
-- last_autovacuum_at is NULL when nothing in the connected database has ever
-- been auto-vacuumed or auto-analyzed; scan it into a nullable time.
SELECT
    (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'autovacuum worker')::int AS running_workers,
    current_setting('autovacuum_max_workers')::int AS max_workers,
    (SELECT max(greatest(last_autovacuum, last_autoanalyze)) FROM pg_stat_all_tables) AS last_autovacuum_at
