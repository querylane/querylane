-- Get PostgreSQL partition metadata for a specific table.
-- Args: $1 = schema name, $2 = table name.
WITH target AS (
	SELECT
		c.oid,
		n.nspname,
		c.relname,
		c.relpartbound
	FROM pg_catalog.pg_class c
	JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = $1
		AND c.relname = $2
		AND c.relkind IN ('r', 'p', 'f')
),
parent_table AS (
	-- Declarative partitions have one parent; ordering is defensive for legacy inheritance.
	SELECT
		parent_ns.nspname,
		parent_class.relname
	FROM target t
	JOIN pg_catalog.pg_inherits inh ON inh.inhrelid = t.oid
	JOIN pg_catalog.pg_class parent_class ON parent_class.oid = inh.inhparent
	JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent_class.relnamespace
	ORDER BY parent_ns.nspname, parent_class.relname
	LIMIT 1
),
child_partitions AS (
	SELECT
		child_ns.nspname,
		child_class.relname,
		COALESCE(pg_catalog.pg_get_expr(child_class.relpartbound, child_class.oid), '') AS partition_bound
	FROM target t
	JOIN pg_catalog.pg_inherits inh ON inh.inhparent = t.oid
	JOIN pg_catalog.pg_class child_class ON child_class.oid = inh.inhrelid
	JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child_class.relnamespace
	ORDER BY child_ns.nspname, child_class.relname
)
SELECT
	COALESCE(pg_catalog.pg_get_partkeydef(t.oid), '') AS partition_key,
	COALESCE(pg_catalog.pg_get_expr(t.relpartbound, t.oid), '') AS partition_bound,
	COALESCE((SELECT nspname FROM parent_table), '') AS parent_schema_name,
	COALESCE((SELECT relname FROM parent_table), '') AS parent_table_name,
	COALESCE((SELECT array_agg(nspname ORDER BY nspname, relname) FROM child_partitions), '{}'::text[]) AS child_schema_names,
	COALESCE((SELECT array_agg(relname ORDER BY nspname, relname) FROM child_partitions), '{}'::text[]) AS child_table_names,
	COALESCE((SELECT array_agg(partition_bound ORDER BY nspname, relname) FROM child_partitions), '{}'::text[]) AS child_partition_bounds,
	(SELECT COUNT(*)::int FROM child_partitions) AS partition_count
FROM target t
