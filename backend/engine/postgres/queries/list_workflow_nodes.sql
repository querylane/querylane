-- List the graph nodes of one pg_durable workflow instance via
-- df.instance_nodes ($1 is the instance id; the second argument limits the
-- result to the latest execution). Validated against pg_durable v0.2.3.
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: execution_id, node_id, node_type, query, result_name, left_node,
-- right_node, status, result, updated_at.
SELECT
	n.execution_id,
	n.node_id,
	COALESCE(n.node_type, ''),
	COALESCE(n.query, ''),
	COALESCE(n.result_name, ''),
	n.left_node,
	n.right_node,
	COALESCE(n.status, ''),
	COALESCE(n.result::text, ''),
	n.updated_at
FROM df.instance_nodes($1, 1) AS n
