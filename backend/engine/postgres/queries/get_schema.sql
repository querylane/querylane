-- Get a single schema by name.
-- Columns: name, owner, is_system_schema.
-- Args: $1 = schema name.
SELECT
	s.schema_name,
	COALESCE(s.schema_owner, ''),
	s.schema_name IN ('information_schema', 'pg_catalog', 'pg_toast')
FROM information_schema.schemata s
WHERE s.schema_name = $1
