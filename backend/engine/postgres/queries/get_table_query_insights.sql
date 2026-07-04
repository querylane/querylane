WITH visible_tables AS (
    SELECT
        c.oid AS relid,
        n.nspname AS schema_name,
        c.relname AS table_name,
        pg_total_relation_size(c.oid)::bigint AS total_size_bytes
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'f')
        AND (
            pg_catalog.pg_has_role(c.relowner, 'USAGE')
            OR pg_catalog.has_table_privilege(c.oid, 'SELECT')
            OR pg_catalog.has_table_privilege(c.oid, 'INSERT')
            OR pg_catalog.has_table_privilege(c.oid, 'UPDATE')
            OR pg_catalog.has_table_privilege(c.oid, 'DELETE')
            OR pg_catalog.has_table_privilege(c.oid, 'TRUNCATE')
            OR pg_catalog.has_table_privilege(c.oid, 'REFERENCES')
            OR pg_catalog.has_table_privilege(c.oid, 'TRIGGER')
        )
)
SELECT
    visible.schema_name,
    visible.table_name,
    stat.seq_scan::bigint AS sequential_scans,
    stat.seq_tup_read::bigint AS sequential_tuples_read,
    COALESCE(stat.idx_scan, 0)::bigint AS index_scans,
    stat.n_live_tup::bigint AS estimated_live_rows,
    visible.total_size_bytes,
    CASE WHEN stat.seq_scan + COALESCE(stat.idx_scan, 0) = 0 THEN 0.0
         ELSE stat.seq_scan::double precision / (stat.seq_scan + COALESCE(stat.idx_scan, 0))
    END AS sequential_scan_ratio
FROM visible_tables AS visible
JOIN pg_stat_user_tables AS stat ON stat.relid = visible.relid
WHERE stat.seq_scan > 0 OR stat.seq_tup_read > 0
ORDER BY stat.seq_tup_read DESC, visible.total_size_bytes DESC, visible.table_name ASC
LIMIT 10
