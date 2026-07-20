-- List schemas (base query for AIP pagination).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, owner, is_system_schema.
-- Session-scoped temp namespaces (pg_temp_N, pg_toast_temp_N) are excluded:
-- they exist only for the lifetime of a backend session and are not
-- administrable objects.
SELECT
	s.schema_name,
	COALESCE(s.schema_owner, ''),
	s.schema_name IN ('information_schema', 'pg_catalog', 'pg_toast')
FROM information_schema.schemata s
WHERE s.schema_name NOT LIKE 'pg\_temp\_%' ESCAPE '\'
	AND s.schema_name NOT LIKE 'pg\_toast\_temp\_%' ESCAPE '\'
