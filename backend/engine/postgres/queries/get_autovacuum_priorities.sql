-- Current database-local scores, not an exact prediction of a worker's queue.
-- Filter visibility before ranking: pg_read_all_stats alone does not confer
-- access to table metadata in Querylane.
SELECT
    n.nspname,
    c.relname,
    s.score,
    s.xid_score,
    s.mxid_score,
    s.vacuum_score,
    s.vacuum_insert_score,
    s.analyze_score,
    s.do_vacuum,
    s.do_analyze,
    s.for_wraparound
FROM pg_catalog.pg_stat_autovacuum_scores AS s
JOIN pg_catalog.pg_class AS c ON c.oid = s.relid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'm')
    AND n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
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
ORDER BY s.score DESC, n.nspname ASC, c.relname ASC
LIMIT 10
