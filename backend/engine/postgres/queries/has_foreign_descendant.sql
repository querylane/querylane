-- Physical row identities require local tuple storage for every descendant.
WITH RECURSIVE relations(oid) AS (
    SELECT pg_catalog.to_regclass(format('%I.%I', $1::text, $2::text))::oid
    UNION
    SELECT i.inhrelid
    FROM pg_catalog.pg_inherits i
    JOIN relations r ON i.inhparent = r.oid
)
SELECT EXISTS (
    SELECT 1
    FROM relations r
    JOIN pg_catalog.pg_class c ON c.oid = r.oid
    WHERE c.relkind = 'f'
)
