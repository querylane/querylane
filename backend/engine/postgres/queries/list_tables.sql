-- List tables (base query for AIP pagination).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, table_type, comment, owner, row_count, size_bytes.
SELECT
	c.relname,
	/*QUERYLANE_TABLE_TYPE_SQL*/,
	COALESCE(obj_description(c.oid, 'pg_class'), ''),
	COALESCE(r.rolname, ''),
	COALESCE(c.reltuples::bigint, 0),
	/*QUERYLANE_TABLE_SIZE_SQL*/
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
WHERE n.nspname = $1
	AND c.relkind IN ('r', 'p', 'f')
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
