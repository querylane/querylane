-- Check if a table-like relation exists.
-- Args: $1 = schema name, $2 = relation name.
SELECT EXISTS(
	SELECT 1
	FROM pg_catalog.pg_class relation
	JOIN pg_catalog.pg_namespace namespace
		ON namespace.oid = relation.relnamespace
	WHERE namespace.nspname = $1
		AND relation.relname = $2
		AND relation.relkind IN ('r', 'p', 'f', 'm')
)
