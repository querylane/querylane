-- Candidate metadata comes from df.instances, the RLS-protected source of
-- truth that df.grant_usage explicitly grants SELECT on in pg_durable 0.2.3.
-- ListWorkflows appends its validated filter, keyset cursor, order, and limit
-- inside this MATERIALIZED CTE before hydrating the bounded page through
-- df.instance_info. This avoids df.list_instances' sequential fan-out across
-- its entire requested window.
WITH candidates AS MATERIALIZED (
	SELECT
		i.id,
		COALESCE(i.label, '') AS label,
		COALESCE(i.status, '') AS status,
		COALESCE(i.created_at, TIMESTAMPTZ 'epoch') AS created_at
	FROM df.instances AS i
