SELECT
    EXISTS(SELECT 1 FROM pg_stat_wal_receiver) AS wal_receiver_active,
    pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS statistics_visible,
    floor(extract(epoch FROM now() - pg_last_xact_replay_timestamp()))::bigint AS replay_lag_seconds,
    (SELECT status FROM pg_stat_wal_receiver) AS wal_receiver_status
