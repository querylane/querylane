-- List databases (base query for AIP pagination).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, character_set, collation, owner, is_system_database.
SELECT
	d.datname,
	COALESCE(pg_encoding_to_char(d.encoding), ''),
	COALESCE(d.datcollate, ''),
	COALESCE(r.rolname, ''),
	d.datname IN ('template0', 'template1', 'postgres')
FROM pg_catalog.pg_database d
JOIN pg_catalog.pg_roles r ON d.datdba = r.oid
WHERE d.datistemplate = false
