-- Get a single database by name.
-- Columns: name, character_set, collation, owner, is_system_database.
-- Args: $1 = database name.
SELECT
	d.datname,
	COALESCE(pg_encoding_to_char(d.encoding), ''),
	COALESCE(d.datcollate, ''),
	COALESCE(r.rolname, ''),
	d.datname IN ('template0', 'template1', 'postgres')
FROM pg_catalog.pg_database d
JOIN pg_catalog.pg_roles r ON d.datdba = r.oid
WHERE d.datname = $1 AND d.datistemplate = false
