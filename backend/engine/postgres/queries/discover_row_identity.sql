-- Returns one row per primary-key column for the given (schema, table),
-- ordered by the column's position in the index. Returns zero rows when
-- the table has no valid+ready primary key; callers fall back to ctid.
--
--   $1 = schema name (bare; will be quoted by format())
--   $2 = table name  (bare)
SELECT
    a.attname                         AS column_name,
    a.atttypid::regtype::text         AS raw_type,
    array_position(i.indkey, a.attnum) AS pos
FROM   pg_index i
JOIN   pg_attribute a
       ON a.attrelid = i.indrelid
      AND a.attnum   = ANY(i.indkey)
WHERE  i.indrelid = format('%I.%I', $1::text, $2::text)::regclass
  AND  i.indisprimary
  AND  i.indisvalid
  AND  i.indisready
  AND  a.attnum > 0
ORDER  BY pos;
