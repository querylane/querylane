-- Direct upstream and downstream relation dependencies for a view.
-- Args: $1 = schema name, $2 = view name.
WITH target AS (
	SELECT c.oid
	FROM pg_catalog.pg_class c
	JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = $1
		AND c.relname = $2
		AND c.relkind IN ('v', 'm')
)
SELECT DISTINCT
	source_ns.nspname,
	source.relname,
	'DIRECTION_UPSTREAM',
	source.relkind::text
FROM target
JOIN pg_catalog.pg_rewrite rewrite ON rewrite.ev_class = target.oid
JOIN pg_catalog.pg_depend dependency
	ON dependency.classid = 'pg_catalog.pg_rewrite'::regclass
	AND dependency.objid = rewrite.oid
	AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
JOIN pg_catalog.pg_class source ON source.oid = dependency.refobjid
JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source.relnamespace
WHERE source.oid <> target.oid
	AND source.relkind IN ('r', 'p', 'f', 'v', 'm')

UNION

SELECT DISTINCT
	dependent_ns.nspname,
	dependent.relname,
	'DIRECTION_DOWNSTREAM',
	dependent.relkind::text
FROM target
JOIN pg_catalog.pg_depend dependency
	ON dependency.refclassid = 'pg_catalog.pg_class'::regclass
	AND dependency.refobjid = target.oid
	AND dependency.classid = 'pg_catalog.pg_rewrite'::regclass
JOIN pg_catalog.pg_rewrite rewrite ON rewrite.oid = dependency.objid
JOIN pg_catalog.pg_class dependent ON dependent.oid = rewrite.ev_class
JOIN pg_catalog.pg_namespace dependent_ns ON dependent_ns.oid = dependent.relnamespace
WHERE dependent.oid <> target.oid
	AND dependent.relkind IN ('v', 'm')

ORDER BY 3, 1, 2
