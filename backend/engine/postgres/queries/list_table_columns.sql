-- List columns for a specific table.
-- Args: $1 = schema name, $2 = table name.
SELECT
	c.column_name,
	c.ordinal_position,
	-- Canonical PostgreSQL type name (e.g. int4, varchar(255), numeric(10,2),
	-- timestamptz, text[]) rather than the verbose SQL-standard spelling that
	-- information_schema.columns.data_type returns ("timestamp with time zone").
	-- pg_type.typname gives the short name; the parenthetical modifier is taken
	-- from format_type (computed once) so Postgres formats it precisely; arrays
	-- use the element name plus a "[]" suffix.
	CASE
		WHEN pt.typcategory = 'A'
			THEN regexp_replace(COALESCE(pet.typname, pt.typname), '^_', '')
		ELSE pt.typname
	END
		|| COALESCE(substring(pg_catalog.format_type(pa.atttypid, pa.atttypmod) FROM '\(.*\)'), '')
		|| CASE WHEN pt.typcategory = 'A' THEN '[]' ELSE '' END,
	CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END,
	COALESCE(
		EXISTS(
			SELECT 1
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
				AND tc.table_name = kcu.table_name
			WHERE tc.constraint_type = 'PRIMARY KEY'
				AND tc.table_schema = c.table_schema
				AND tc.table_name = c.table_name
				AND kcu.column_name = c.column_name
		), false
	),
	COALESCE(c.column_default, ''),
	COALESCE(c.character_maximum_length, 0),
	COALESCE(col_description(
		(quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
		c.ordinal_position
	), ''),
	COALESCE(
		EXISTS(
			SELECT 1
			FROM information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
				AND tc.table_name = kcu.table_name
			WHERE tc.constraint_type = 'UNIQUE'
				AND tc.table_schema = c.table_schema
				AND tc.table_name = c.table_name
				AND kcu.column_name = c.column_name
		), false
	),
	-- Canonical base type name and array flag straight from the catalog, used to
	-- classify into our abstract DataType enum without re-parsing the display string.
	pt.typname,
	pt.typcategory = 'A',
	pa.attgenerated <> '',
	CASE
		WHEN pa.attgenerated <> ''
			THEN COALESCE(pg_catalog.pg_get_expr(pad.adbin, pad.adrelid), '')
		ELSE ''
	END,
	pa.attidentity <> '',
	pa.attidentity::text
FROM information_schema.columns c
JOIN pg_catalog.pg_namespace pn
	ON pn.nspname = c.table_schema
JOIN pg_catalog.pg_class pcl
	ON pcl.relname = c.table_name
	AND pcl.relnamespace = pn.oid
JOIN pg_catalog.pg_attribute pa
	ON pa.attrelid = pcl.oid
	AND pa.attname = c.column_name
JOIN pg_catalog.pg_type pt
	ON pt.oid = pa.atttypid
LEFT JOIN pg_catalog.pg_type pet
	ON pet.oid = pt.typelem
LEFT JOIN pg_catalog.pg_attrdef pad
	ON pad.adrelid = pa.attrelid
	AND pad.adnum = pa.attnum
WHERE c.table_schema = $1
	AND c.table_name = $2
ORDER BY c.ordinal_position
