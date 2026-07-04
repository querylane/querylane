-- List the objects owned by a role within the connected database. $1 is the
-- exact PostgreSQL role name (the owner). The AIP framework appends cursor
-- predicates, ORDER BY, and LIMIT to the outer query. Owners implicitly hold
-- every privilege on the objects they own, so this is the access source most
-- often missed when a role shows no direct grants.
-- Columns: object_type, schema_name, object_name.
-- System schemas (pg_catalog, information_schema, pg_toast, pg_temp*) are
-- excluded: the bootstrap superuser owns every catalog object, which would
-- otherwise bury the role's real, user-managed objects under thousands of rows.
-- The database itself (DATABASE) is always reported regardless of ownership of
-- system schemas, as it is a single meaningful row.
WITH target AS (
	SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
)
SELECT
	g.object_type,
	g.schema_name,
	g.object_name
FROM (
	-- Ownership of the connected database itself (pg_database.datdba). Scoped to
	-- current_database() because pg_database is a cluster-global catalog.
	SELECT
		'DATABASE' AS object_type,
		'' AS schema_name,
		d.datname AS object_name
	FROM pg_catalog.pg_database d
	JOIN target t ON t.oid = d.datdba
	WHERE d.datname = current_database()

	UNION ALL

	-- Schemas owned by the role (pg_namespace.nspowner).
	SELECT
		'SCHEMA' AS object_type,
		n.nspname AS schema_name,
		'' AS object_name
	FROM pg_catalog.pg_namespace n
	JOIN target t ON t.oid = n.nspowner
	WHERE n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Relations owned by the role (pg_class.relowner): tables, partitioned
	-- tables, views, materialized views, sequences, and foreign tables.
	SELECT
		CASE c.relkind
			WHEN 'r' THEN 'TABLE'
			WHEN 'p' THEN 'TABLE'
			WHEN 'v' THEN 'VIEW'
			WHEN 'm' THEN 'MATERIALIZED_VIEW'
			WHEN 'S' THEN 'SEQUENCE'
			WHEN 'f' THEN 'FOREIGN_TABLE'
		END AS object_type,
		n.nspname AS schema_name,
		c.relname AS object_name
	FROM pg_catalog.pg_class c
	JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
	JOIN target t ON t.oid = c.relowner
	WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
		AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Functions owned by the role (pg_proc.proowner). Identity arguments are
	-- folded into object_name so overloaded routines (same proname) remain
	-- distinct rows — required for the keyset pagination total order. COALESCE
	-- guards the keyset key against a NULL from the concatenation.
	SELECT
		'FUNCTION' AS object_type,
		n.nspname AS schema_name,
		p.proname || '(' || COALESCE(pg_catalog.pg_get_function_identity_arguments(p.oid), '') || ')' AS object_name
	FROM pg_catalog.pg_proc p
	JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
	JOIN target t ON t.oid = p.proowner
	WHERE n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Large objects owned by the role (pg_largeobject_metadata.lomowner). Large
	-- objects are database-scoped but not schema-qualified, so schema_name is
	-- empty and object_name is the large object's OID text.
	SELECT
		'LARGE_OBJECT' AS object_type,
		'' AS schema_name,
		lom.oid::text AS object_name
	FROM pg_catalog.pg_largeobject_metadata lom
	JOIN target t ON t.oid = lom.lomowner
) AS g
