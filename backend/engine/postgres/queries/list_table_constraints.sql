-- List constraints for a specific table.
-- Args: $1 = schema name, $2 = table name.
SELECT
	con.conname,
	con.contype,
	COALESCE(
		(SELECT array_agg(a.attname ORDER BY k.ord)
		 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
		 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum),
		'{}'::text[]
	),
	COALESCE(ref_ns.nspname, ''),
	COALESCE(ref_cl.relname, ''),
	COALESCE(
		(SELECT array_agg(a.attname ORDER BY k.ord)
		 FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
		 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum),
		'{}'::text[]
	),
	COALESCE(con.confupdtype, ' '),
	COALESCE(con.confdeltype, ' '),
	pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
LEFT JOIN pg_class ref_cl ON ref_cl.oid = con.confrelid
LEFT JOIN pg_namespace ref_ns ON ref_ns.oid = ref_cl.relnamespace
WHERE ns.nspname = $1
	AND cl.relname = $2
ORDER BY con.conname
