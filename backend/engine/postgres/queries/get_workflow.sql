-- Get one pg_durable workflow instance by id via df.instance_info.
-- Returns zero rows when the instance does not exist or is not visible to the
-- connection role under RLS (validated against pg_durable v0.2.3).
SELECT
	ii.instance_id,
	COALESCE(ii.label, ''),
	COALESCE(ii.function_name, ''),
	COALESCE(ii.function_version, ''),
	COALESCE(ii.status, ''),
	COALESCE(ii.output::text, ''),
	COALESCE(ii.current_execution_id::text, ''),
	COALESCE(i.created_at, TIMESTAMPTZ 'epoch')
FROM df.instance_info($1) AS ii
JOIN df.instances AS i ON i.id = ii.instance_id
