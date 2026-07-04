-- List views for a specific schema (both standard and materialized).
-- Used as base query for AIP pagination.
-- Args: $1 = schema name.
SELECT
	v.view_name,
	v.view_type,
	v.owner,
	v.comment,
	v.is_system,
	v.definition,
	v.size_bytes,
	v.row_count,
	v.is_populated
FROM (
	-- Standard views
	SELECT
		v.viewname AS view_name,
		'STANDARD' AS view_type,
		v.viewowner AS owner,
		COALESCE(obj_description(c.oid), '') AS comment,
		v.schemaname IN ('information_schema', 'pg_catalog') AS is_system,
		CASE
			WHEN btrim(COALESCE(pg_get_viewdef(c.oid, true), v.definition, '')) = '' THEN ''
			ELSE regexp_replace(COALESCE(pg_get_viewdef(c.oid, true), v.definition, ''), ';[[:space:]]*$', '')
		END AS definition,
		0::bigint AS size_bytes,
		0::bigint AS row_count,
		true AS is_populated
	FROM pg_views v
	JOIN pg_namespace n ON n.nspname = v.schemaname
	JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = v.viewname AND c.relkind = 'v'
	WHERE v.schemaname = $1

	UNION ALL

	-- Materialized views
	SELECT
		m.matviewname AS view_name,
		'MATERIALIZED' AS view_type,
		m.matviewowner AS owner,
		COALESCE(obj_description(c.oid), '') AS comment,
		false AS is_system,
		CASE
			WHEN btrim(COALESCE(pg_get_viewdef(c.oid, true), m.definition, '')) = '' THEN ''
			ELSE regexp_replace(COALESCE(pg_get_viewdef(c.oid, true), m.definition, ''), ';[[:space:]]*$', '')
		END AS definition,
		pg_relation_size(c.oid) AS size_bytes,
		COALESCE(c.reltuples::bigint, 0) AS row_count,
		m.ispopulated AS is_populated
	FROM pg_matviews m
	JOIN pg_namespace n ON n.nspname = m.schemaname
	JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = m.matviewname AND c.relkind = 'm'
	WHERE m.schemaname = $1
) v
