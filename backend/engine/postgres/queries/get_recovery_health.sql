SELECT
    pause_state,
    promote_triggered,
    replay_end_lsn::text,
    replay_end_tli
FROM pg_catalog.pg_stat_recovery
