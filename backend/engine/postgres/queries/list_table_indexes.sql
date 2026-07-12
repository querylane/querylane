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
	pg_relation_size(ic.oid),
	COALESCE(
		(SELECT array_agg(pg_get_indexdef(ix.indexrelid, k.ord::int, false) ORDER BY k.ord)
		 FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
		 WHERE k.ord <= ix.indnkeyatts),
		'{}'::text[]
	),
	ix.indisvalid,
	EXISTS (
		SELECT 1
		FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
		WHERE k.attnum = 0
			AND k.ord <= ix.indnkeyatts
	),
	pg_get_indexdef(ic.oid),
	COALESCE(stat.idx_scan, 0),
	COALESCE(stat.idx_tup_read, 0),
	COALESCE(stat.idx_tup_fetch, 0),
	COALESCE(statio.idx_blks_hit, 0),
	COALESCE(statio.idx_blks_read, 0),
	stat.indexrelid IS NOT NULL
FROM pg_index ix
JOIN pg_class tc ON tc.oid = ix.indrelid
JOIN pg_class ic ON ic.oid = ix.indexrelid
JOIN pg_namespace ns ON ns.oid = tc.relnamespace
JOIN pg_am am ON am.oid = ic.relam
LEFT JOIN pg_stat_user_indexes stat ON stat.indexrelid = ic.oid
LEFT JOIN pg_statio_user_indexes statio ON statio.indexrelid = ic.oid
WHERE ns.nspname = $1
	AND tc.relname = $2
ORDER BY ic.relname
