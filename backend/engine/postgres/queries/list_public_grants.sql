-- List object-level privileges granted to PUBLIC within the connected database.
-- Every role implicitly holds these. No args. The AIP framework appends cursor
-- predicates, ORDER BY, and LIMIT to the outer query.
-- Columns: object_type, schema_name, object_name, privilege, with_grant_option, grantor.
-- Returns explicit "GRANT ... TO PUBLIC" ACL entries (acl.grantee = 0) plus a
-- synthesized DATABASE CONNECT/TEMPORARY pair when datacl is unset (PostgreSQL's
-- default grants PUBLIC the right to connect and create temp objects).
-- Categorical defaults that cannot be enumerated per object (PUBLIC EXECUTE on
-- every function, the public-schema USAGE default) are intentionally not reported.
-- System schemas (pg_catalog, information_schema, pg_toast, pg_temp*) are excluded
-- from the schema/relation/function branches: PostgreSQL grants PUBLIC USAGE on
-- the system catalogs by default, which is noise for the "extra access in this
-- database" story. The user-facing `public` schema is NOT a system schema and is
-- retained.
SELECT
	g.object_type,
	g.schema_name,
	g.object_name,
	g.privilege,
	g.with_grant_option,
	g.grantor
FROM (
	-- Explicit database-level PUBLIC grants (pg_database.datacl).
	SELECT
		'DATABASE' AS object_type,
		'' AS schema_name,
		d.datname AS object_name,
		acl.privilege_type AS privilege,
		acl.is_grantable AS with_grant_option,
		COALESCE(grantor.rolname, '') AS grantor
	FROM pg_catalog.pg_database d
	CROSS JOIN LATERAL aclexplode(d.datacl) AS acl
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE d.datname = current_database() AND d.datacl IS NOT NULL AND acl.grantee = 0

	UNION ALL

	-- Synthesized database-level PUBLIC defaults when datacl is unset: PostgreSQL
	-- grants PUBLIC CONNECT and TEMPORARY by default. Mutually exclusive with the
	-- explicit branch above via `datacl IS NULL`, so no double counting.
	SELECT
		'DATABASE' AS object_type,
		'' AS schema_name,
		d.datname AS object_name,
		p.priv AS privilege,
		false AS with_grant_option,
		'' AS grantor
	FROM pg_catalog.pg_database d
	CROSS JOIN (VALUES ('CONNECT'), ('TEMPORARY')) AS p(priv)
	WHERE d.datname = current_database() AND d.datacl IS NULL

	UNION ALL

	-- Schema-level PUBLIC grants (pg_namespace.nspacl).
	SELECT
		'SCHEMA' AS object_type,
		n.nspname AS schema_name,
		'' AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_namespace n
	CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE n.nspacl IS NOT NULL AND acl.grantee = 0
		AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Relation-level PUBLIC grants (pg_class.relacl): tables, partitioned tables,
	-- views, materialized views, sequences, and foreign tables.
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
		c.relname AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_class c
	JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
	CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') AND c.relacl IS NOT NULL AND acl.grantee = 0
		AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Function-level PUBLIC grants (pg_proc.proacl). Identity arguments folded
	-- into object_name. A NULL proacl (default PUBLIC EXECUTE) is not reported.
	SELECT
		'FUNCTION' AS object_type,
		n.nspname AS schema_name,
		p.proname || '(' || COALESCE(pg_catalog.pg_get_function_identity_arguments(p.oid), '') || ')' AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_proc p
	JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
	CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE p.proacl IS NOT NULL AND acl.grantee = 0
		AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		AND n.nspname <> 'information_schema'

	UNION ALL

	-- Large object PUBLIC grants (pg_largeobject_metadata.lomacl). Large
	-- objects are database-scoped but not schema-qualified, so schema_name is
	-- empty and object_name is the large object's OID text.
	SELECT
		'LARGE_OBJECT' AS object_type,
		'' AS schema_name,
		lom.oid::text AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_largeobject_metadata lom
	CROSS JOIN LATERAL aclexplode(lom.lomacl) AS acl
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE lom.lomacl IS NOT NULL AND acl.grantee = 0
) AS g
