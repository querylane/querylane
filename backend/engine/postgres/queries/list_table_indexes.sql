-- List indexes for a specific table.
-- Args: $1 = schema name, $2 = table name.
SELECT
	ic.relname,
	am.amname,
	ix.indisunique,
	COALESCE(
		(SELECT array_agg(a.attname ORDER BY k.ord)
		 FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
		 JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
		 WHERE k.attnum != 0
		 AND k.ord <= ix.indnkeyatts),
		'{}'::text[]
	),
	COALESCE(
		(SELECT array_agg(a.attname ORDER BY k.ord)
		 FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
		 JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
		 WHERE k.ord > ix.indnkeyatts),
		'{}'::text[]
	),
	COALESCE(pg_get_expr(ix.indpred, ix.indrelid), ''),
	pg_relation_size(ic.oid)
FROM pg_index ix
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_namespace ns ON ns.oid = tc.relnamespace
JOIN pg_am am ON am.oid = ic.relam
WHERE ns.nspname = $1
	AND tc.relname = $2
ORDER BY ic.relname
