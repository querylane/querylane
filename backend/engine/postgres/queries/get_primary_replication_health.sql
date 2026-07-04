SELECT
    count(*)::integer AS attached_replicas,
    count(*) FILTER (WHERE state = 'streaming')::integer AS streaming_replicas,
    count(*) FILTER (WHERE sync_state IN ('sync', 'quorum'))::integer AS synchronous_replicas,
    coalesce(
        max(
            greatest(
                pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn),
                pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn),
                pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn),
                pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)
            )
        ),
        0
    )::bigint AS max_replication_lag_bytes
FROM pg_stat_replication
