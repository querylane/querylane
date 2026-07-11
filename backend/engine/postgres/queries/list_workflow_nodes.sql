-- List the graph nodes of one pg_durable workflow instance via
-- df.instance_nodes ($1 is the instance id).
-- Cursor, ORDER BY, and LIMIT are appended by the AIP framework.
-- Columns: node_id, node_type, query, result_name, left_node, right_node,
-- status, result, status_details, inferred_status, updated_at.
SELECT
	n.node_id,
	COALESCE(n.node_type, ''),
	COALESCE(n.query, ''),
	COALESCE(n.result_name, ''),
	n.left_node,
	n.right_node,
	COALESCE(n.status, ''),
	COALESCE(n.result::text, ''),
	COALESCE(n.status_details, ''),
	COALESCE(n.inferred_status, ''),
	n.updated_at
FROM df.instance_nodes($1) AS n
