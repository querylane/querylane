-- +goose Up
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- Existing cached rows remain unknown until the next live catalog refresh.
ALTER TABLE catalog_column
    -- squawk-ignore prefer-bigint-over-int
    ADD COLUMN IF NOT EXISTS generated_kind INTEGER NOT NULL DEFAULT 0;

ALTER TABLE catalog_table_constraint
    ADD COLUMN IF NOT EXISTS is_enforced BOOLEAN,
    ADD COLUMN IF NOT EXISTS is_validated BOOLEAN;

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE catalog_table_constraint
    DROP COLUMN IF EXISTS is_validated,
    DROP COLUMN IF EXISTS is_enforced;

ALTER TABLE catalog_column
    DROP COLUMN IF EXISTS generated_kind;
