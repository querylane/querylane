-- List triggers for a specific table (excludes internal/system triggers).
-- Args: $1 = schema name, $2 = table name.
SELECT
	t.tgname,
	CASE
		WHEN (t.tgtype & 2) != 0 THEN 'BEFORE'
		WHEN (t.tgtype & 64) != 0 THEN 'INSTEAD OF'
		ELSE 'AFTER'
	END,
	array_remove(ARRAY[
		CASE WHEN (t.tgtype & 4) != 0 THEN 'INSERT' END,
		CASE WHEN (t.tgtype & 8) != 0 THEN 'DELETE' END,
		CASE WHEN (t.tgtype & 16) != 0 THEN 'UPDATE' END,
		CASE WHEN (t.tgtype & 32) != 0 THEN 'TRUNCATE' END
	], NULL),
	p.proname,
	t.tgenabled != 'D',
	pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class cl ON cl.oid = t.tgrelid
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE ns.nspname = $1
	AND cl.relname = $2
	AND NOT t.tgisinternal
ORDER BY t.tgname
