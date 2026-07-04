-- List roles (base query for AIP pagination).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: name, can_login, is_superuser, can_create_database, can_create_role,
-- can_replicate, bypasses_rls, inherits_by_default, connection_limit,
-- valid_until, config, is_system_role, member_of_json, comment.
SELECT
	r.rolname,
	r.rolcanlogin,
	r.rolsuper,
	r.rolcreatedb,
	r.rolcreaterole,
	r.rolreplication,
	r.rolbypassrls,
	r.rolinherit,
	r.rolconnlimit,
	CASE
		WHEN r.rolvaliduntil IN ('infinity'::timestamptz, '-infinity'::timestamptz) THEN NULL
		ELSE r.rolvaliduntil
	END AS valid_until,
	r.rolconfig,
	r.rolname LIKE 'pg\_%' ESCAPE '\' AS is_system_role,
	COALESCE(member_roles.member_of, '[]'::jsonb)::text AS member_of_json,
	COALESCE(pg_catalog.shobj_description(r.oid, 'pg_authid'), '') AS comment
FROM pg_catalog.pg_roles r
LEFT JOIN LATERAL (
	SELECT jsonb_agg(
		jsonb_build_object(
			'roleName', parent.rolname,
			'adminOption', m.admin_option,
			-- inherit_option/set_option are PG16+ pg_auth_members columns; to_jsonb
			-- omits them on older servers, so default to true (their pre-16 behavior).
			'inheritOption', COALESCE((to_jsonb(m)->>'inherit_option')::boolean, true),
			'setOption', COALESCE((to_jsonb(m)->>'set_option')::boolean, true),
			'grantor', grantor.rolname
		)
		ORDER BY parent.rolname
	) AS member_of
	FROM pg_catalog.pg_auth_members m
	JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
	LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = m.grantor
	WHERE m.member = r.oid
) AS member_roles ON true
