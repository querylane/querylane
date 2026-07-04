-- List schemas (base query for AIP pagination).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, owner, is_system_schema.
SELECT
	s.schema_name,
	COALESCE(s.schema_owner, ''),
	s.schema_name IN ('information_schema', 'pg_catalog', 'pg_toast')
FROM information_schema.schemata s
