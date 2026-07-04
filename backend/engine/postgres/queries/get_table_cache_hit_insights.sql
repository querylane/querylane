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
), cache_stats AS (
    SELECT
        visible.schema_name,
        visible.table_name,
        visible.total_size_bytes,
        io.heap_blks_hit::bigint AS heap_blocks_hit,
        io.heap_blks_read::bigint AS heap_blocks_read,
        CASE WHEN io.heap_blks_hit + io.heap_blks_read = 0 THEN 0.0
             ELSE io.heap_blks_hit::double precision / (io.heap_blks_hit + io.heap_blks_read)
        END AS cache_hit_ratio,
        (io.heap_blks_hit + io.heap_blks_read)::bigint AS heap_blocks_observed
    FROM visible_tables AS visible
    JOIN pg_statio_user_tables AS io ON io.relid = visible.relid
)
SELECT
    schema_name,
    table_name,
    heap_blocks_hit,
    heap_blocks_read,
    cache_hit_ratio,
    total_size_bytes
FROM cache_stats
WHERE heap_blocks_observed > 0
ORDER BY cache_hit_ratio ASC, heap_blocks_observed DESC, total_size_bytes DESC, table_name ASC
LIMIT 10
