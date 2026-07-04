-- List RLS policies for a specific table.
-- Args: $1 = schema name, $2 = table name.
SELECT
	pol.polname,
	CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
	pol.polcmd,
	COALESCE(
		(SELECT array_agg(r.rolname)
		 FROM unnest(pol.polroles) AS role_oid
		 JOIN pg_roles r ON r.oid = role_oid),
		'{}'::text[]
	),
	COALESCE(pg_get_expr(pol.polqual, pol.polrelid), ''),
	COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
FROM pg_policy pol
JOIN pg_class cl ON cl.oid = pol.polrelid
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
WHERE ns.nspname = $1
	AND cl.relname = $2
ORDER BY pol.polname
