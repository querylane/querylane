-- List object-level privileges granted directly to a role within the connected
-- database. $1 is the exact PostgreSQL role name (the grantee). The AIP
-- framework appends cursor predicates, ORDER BY, and LIMIT to the outer query.
-- Only privileges granted directly to the role are reported; PUBLIC grants and
-- membership inheritance are excluded, as are owner-implicit privileges. Those
-- hide in two forms: a NULL acl (no grants made yet), and an explicit owner
-- self-grant (e.g. owner=arwdDxt/owner) that PostgreSQL materializes into the acl
-- on the first GRANT/REVOKE touching the object.
-- Each branch therefore excludes the owning role (acl.grantee <> the owner oid);
-- ownership is reported separately by list_role_owned_objects.sql.
-- Note: FUNCTION rows reflect explicit pg_proc.proacl entries only. A NULL
-- proacl means the default (PUBLIC EXECUTE) applies and is NOT reported here.
-- Columns: object_type, schema_name, object_name, privilege, with_grant_option, grantor.
-- Each branch pre-filters `acl IS NOT NULL`: aclexplode(NULL) yields no rows, so
-- this is result-identical, but it lets the planner skip the LATERAL call (and,
-- in the function branch, pg_get_function_identity_arguments) for the vast
-- majority of catalog rows that carry no explicit ACL.
WITH target AS (
	SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
)
SELECT
	g.object_type,
	g.schema_name,
	g.object_name,
	g.privilege,
	g.with_grant_option,
	g.grantor
FROM (
	-- Database-level grants (pg_database.datacl) for the connected database.
	SELECT
		'DATABASE' AS object_type,
		'' AS schema_name,
		d.datname AS object_name,
		acl.privilege_type AS privilege,
		acl.is_grantable AS with_grant_option,
		COALESCE(grantor.rolname, '') AS grantor
	FROM pg_catalog.pg_database d
	CROSS JOIN LATERAL aclexplode(d.datacl) AS acl
	JOIN target t ON t.oid = acl.grantee
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE d.datname = current_database() AND d.datacl IS NOT NULL AND acl.grantee <> d.datdba

	UNION ALL

	-- Schema-level grants (pg_namespace.nspacl).
	SELECT
		'SCHEMA' AS object_type,
		n.nspname AS schema_name,
		'' AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_namespace n
	CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
	JOIN target t ON t.oid = acl.grantee
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE n.nspacl IS NOT NULL AND acl.grantee <> n.nspowner

	UNION ALL

	-- Relation-level grants (pg_class.relacl): tables, partitioned tables,
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
	JOIN target t ON t.oid = acl.grantee
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') AND c.relacl IS NOT NULL AND acl.grantee <> c.relowner

	UNION ALL

	-- Function-level grants (pg_proc.proacl): functions, procedures, aggregates,
	-- and window functions. The identity arguments are folded into object_name so
	-- overloaded routines (same proname) remain distinct rows — required for the
	-- keyset pagination total order. Only explicit ACL entries appear; a NULL
	-- proacl (default PUBLIC EXECUTE) is not reported here.
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
	JOIN target t ON t.oid = acl.grantee
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE p.proacl IS NOT NULL AND acl.grantee <> p.proowner

	UNION ALL

	-- Large object grants (pg_largeobject_metadata.lomacl). Large objects are
	-- database-scoped but not schema-qualified, so schema_name is empty and
	-- object_name is the large object's OID text.
	SELECT
		'LARGE_OBJECT' AS object_type,
		'' AS schema_name,
		lom.oid::text AS object_name,
		acl.privilege_type,
		acl.is_grantable,
		COALESCE(grantor.rolname, '')
	FROM pg_catalog.pg_largeobject_metadata lom
	CROSS JOIN LATERAL aclexplode(lom.lomacl) AS acl
	JOIN target t ON t.oid = acl.grantee
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
	WHERE lom.lomacl IS NOT NULL AND acl.grantee <> lom.lomowner
) AS g
