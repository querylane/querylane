-- +goose Up
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE catalog_column
    ADD COLUMN IF NOT EXISTS is_generated BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS generation_expression TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_identity BOOLEAN NOT NULL DEFAULT false,
    -- squawk-ignore prefer-bigint-over-int
    ADD COLUMN IF NOT EXISTS identity_generation INTEGER NOT NULL DEFAULT 0;

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE catalog_column
    DROP COLUMN IF EXISTS identity_generation,
    DROP COLUMN IF EXISTS is_identity,
    DROP COLUMN IF EXISTS generation_expression,
    DROP COLUMN IF EXISTS is_generated;
