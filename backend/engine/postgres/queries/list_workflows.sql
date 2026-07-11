-- List pg_durable workflow instances visible to the connection role (RLS).
-- df.list_instances is the documented introspection surface; $1 is its listing
-- window (the extension caps it via pg_durable.list_instances_max_limit).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: instance_id, label, function_name, status, execution_count, output.
SELECT
	li.instance_id,
	COALESCE(li.label, ''),
	COALESCE(li.function_name, ''),
	COALESCE(li.status, ''),
	COALESCE(li.execution_count, 0),
	COALESCE(li.output::text, '')
FROM df.list_instances(NULL, $1) AS li
