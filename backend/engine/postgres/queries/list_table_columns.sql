-- List columns for a table-like relation, including materialized views.
-- Args: $1 = schema name, $2 = relation name.
SELECT
	pa.attname,
	pa.attnum,
	CASE
		WHEN pt.typcategory = 'A'
			THEN regexp_replace(COALESCE(pet.typname, pt.typname), '^_', '')
		ELSE pt.typname
	END
		|| COALESCE(substring(pg_catalog.format_type(pa.atttypid, pa.atttypmod) FROM '\(.*\)'), '')
		|| CASE WHEN pt.typcategory = 'A' THEN '[]' ELSE '' END,
	NOT pa.attnotnull,
	EXISTS (
		SELECT 1
		FROM pg_catalog.pg_index idx
		WHERE idx.indrelid = pcl.oid
			AND idx.indisprimary
			AND idx.indisvalid
			AND pa.attnum = ANY(idx.indkey)
	),
	COALESCE(pg_catalog.pg_get_expr(pad.adbin, pad.adrelid), ''),
	COALESCE(info.character_maximum_length, 0),
	COALESCE(pg_catalog.col_description(pcl.oid, pa.attnum), ''),
	EXISTS (
		SELECT 1
		FROM pg_catalog.pg_index idx
		WHERE idx.indrelid = pcl.oid
			AND idx.indisunique
			AND idx.indisvalid
			AND idx.indnkeyatts = 1
			AND pa.attnum = ANY(idx.indkey)
	),
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
FROM pg_catalog.pg_class pcl
JOIN pg_catalog.pg_namespace pn
	ON pn.oid = pcl.relnamespace
JOIN pg_catalog.pg_attribute pa
	ON pa.attrelid = pcl.oid
	AND pa.attnum > 0
	AND NOT pa.attisdropped
JOIN pg_catalog.pg_type pt
	ON pt.oid = pa.atttypid
LEFT JOIN pg_catalog.pg_type pet
	ON pet.oid = pt.typelem
LEFT JOIN pg_catalog.pg_attrdef pad
	ON pad.adrelid = pa.attrelid
	AND pad.adnum = pa.attnum
LEFT JOIN information_schema.columns info
	ON info.table_schema = pn.nspname
	AND info.table_name = pcl.relname
	AND info.column_name = pa.attname
WHERE pn.nspname = $1
	AND pcl.relname = $2
	AND pcl.relkind IN ('r', 'p', 'f', 'm')
ORDER BY pa.attnum
