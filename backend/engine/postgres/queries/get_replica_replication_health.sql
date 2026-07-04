SELECT
    EXISTS(SELECT 1 FROM pg_stat_wal_receiver) AS wal_receiver_active,
    coalesce(
        floor(extract(epoch FROM now() - pg_last_xact_replay_timestamp())),
        0
    )::bigint AS replay_lag_seconds
