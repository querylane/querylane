-- +goose Up
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE catalog_table_index
    ADD COLUMN IF NOT EXISTS key_parts TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS has_expression BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS definition TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS scan_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tuples_read BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tuples_fetched BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blocks_hit BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blocks_read BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS has_usage_stats BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE catalog_table_index
    DROP COLUMN IF EXISTS blocks_read,
    DROP COLUMN IF EXISTS blocks_hit,
    DROP COLUMN IF EXISTS has_usage_stats,
    DROP COLUMN IF EXISTS tuples_fetched,
    DROP COLUMN IF EXISTS tuples_read,
    DROP COLUMN IF EXISTS scan_count,
    DROP COLUMN IF EXISTS definition,
    DROP COLUMN IF EXISTS has_expression,
    DROP COLUMN IF EXISTS is_valid,
    DROP COLUMN IF EXISTS key_parts;
