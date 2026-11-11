-- Cumulative cluster-wide counters, not live lock waiters. PostgreSQL records
-- waits only after successful acquisition following a wait > deadlock_timeout.
-- One row per built-in lock type; the extra row detects unexpected cardinality.
SELECT locktype, waits, wait_time, fastpath_exceeded, stats_reset
FROM pg_catalog.pg_stat_lock
ORDER BY locktype
LIMIT 65
