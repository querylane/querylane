-- List default privileges (ALTER DEFAULT PRIVILEGES) that grant access to a
-- role on objects created later by other roles, within the connected database.
-- $1 is the exact PostgreSQL role name (the grantee/beneficiary). The AIP
-- framework appends cursor predicates, ORDER BY, and LIMIT to the outer query.
-- Columns: creator_role_name, object_type, schema_name, privilege, with_grant_option.
-- The WHERE defaclobjtype IN (...) guard keeps an unexpected future objtype from
-- producing a NULL object_type, which would break the keyset tuple comparison.
WITH target AS (
	SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
)
SELECT
	g.creator_role_name,
	g.object_type,
	g.schema_name,
	g.privilege,
	g.with_grant_option
FROM (
	SELECT
		creator.rolname AS creator_role_name,
		CASE da.defaclobjtype
			WHEN 'r' THEN 'TABLES'
			WHEN 'S' THEN 'SEQUENCES'
			WHEN 'f' THEN 'FUNCTIONS'
			WHEN 'T' THEN 'TYPES'
			WHEN 'n' THEN 'SCHEMAS'
			WHEN 'L' THEN 'LARGE_OBJECTS'
		END AS object_type,
		COALESCE(ns.nspname, '') AS schema_name,
		acl.privilege_type AS privilege,
		acl.is_grantable AS with_grant_option
	FROM pg_catalog.pg_default_acl da
	CROSS JOIN LATERAL aclexplode(da.defaclacl) AS acl
	JOIN target t ON t.oid = acl.grantee
	JOIN pg_catalog.pg_roles creator ON creator.oid = da.defaclrole
	LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid = da.defaclnamespace
	WHERE da.defaclobjtype IN ('r', 'S', 'f', 'T', 'n', 'L')
) AS g
