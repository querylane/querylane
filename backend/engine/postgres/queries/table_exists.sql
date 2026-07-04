-- Check if a table exists.
-- Args: $1 = schema name, $2 = table name.
SELECT EXISTS(
	SELECT 1 FROM information_schema.tables
	WHERE table_schema = $1 AND table_name = $2
)
