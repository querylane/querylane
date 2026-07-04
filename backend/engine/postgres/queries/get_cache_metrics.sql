SELECT
    CASE WHEN sum(blks_hit) + sum(blks_read) = 0 THEN 0.0
         ELSE sum(blks_hit)::double precision / (sum(blks_hit) + sum(blks_read))
    END,
    coalesce(sum(blks_hit), 0)::bigint,
    coalesce(sum(blks_read), 0)::bigint
FROM pg_stat_database
