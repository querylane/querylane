-- List extensions available in the connected database.
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, schema_name, default_version, installed_version, comment, installed.
SELECT
	ae.name,
	COALESCE(n.nspname, ''),
	COALESCE(ae.default_version, ''),
	COALESCE(ae.installed_version, ''),
	COALESCE(ae.comment, ''),
	ae.installed_version IS NOT NULL
FROM pg_catalog.pg_available_extensions ae
LEFT JOIN pg_catalog.pg_extension e ON e.extname = ae.name
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
