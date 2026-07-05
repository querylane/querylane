WITH settings AS (
    SELECT current_setting('block_size')::numeric AS block_size
),
io AS (
    -- Use JSON row access so PostgreSQL 16/17 op_bytes and PostgreSQL 18+
    -- read_bytes/write_bytes/extend_bytes can be detected without selecting
    -- columns that do not exist on the connected server.
    SELECT to_jsonb(s) AS stat
    FROM pg_stat_io AS s
),
totals AS (
    SELECT
        coalesce(sum((stat ->> 'reads')::numeric), 0) AS reads,
        coalesce(
            sum(
                coalesce(
                    (stat ->> 'read_bytes')::numeric,
                    coalesce((stat ->> 'reads')::numeric, 0)
                        * coalesce((stat ->> 'op_bytes')::numeric, settings.block_size)
                )
            ),
            0
        ) AS read_bytes,
        coalesce(sum((stat ->> 'writes')::numeric), 0) AS writes,
        coalesce(
            sum(
                coalesce(
                    (stat ->> 'write_bytes')::numeric,
                    coalesce((stat ->> 'writes')::numeric, 0)
                        * coalesce((stat ->> 'op_bytes')::numeric, settings.block_size)
                )
            ),
            0
        ) AS write_bytes,
        coalesce(sum((stat ->> 'extends')::numeric), 0) AS extends,
        coalesce(
            sum(
                coalesce(
                    (stat ->> 'extend_bytes')::numeric,
                    coalesce((stat ->> 'extends')::numeric, 0)
                        * coalesce((stat ->> 'op_bytes')::numeric, settings.block_size)
                )
            ),
            0
        ) AS extend_bytes,
        coalesce(sum((stat ->> 'fsyncs')::numeric), 0) AS fsyncs,
        max((stat ->> 'stats_reset')::timestamptz) AS stats_reset
    FROM io
    CROSS JOIN settings
)
SELECT
    least(reads, 9223372036854775807::numeric)::bigint,
    least(read_bytes, 9223372036854775807::numeric)::bigint,
    least(writes, 9223372036854775807::numeric)::bigint,
    least(write_bytes, 9223372036854775807::numeric)::bigint,
    least(extends, 9223372036854775807::numeric)::bigint,
    least(extend_bytes, 9223372036854775807::numeric)::bigint,
    least(fsyncs, 9223372036854775807::numeric)::bigint,
    stats_reset
FROM totals
