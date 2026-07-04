-- +goose Up
-- The instance_runtime_state table (added in 0002) is now the single source of
-- truth for connection state. The legacy columns on the instance table are
-- written-but-never-read, so drop them to remove the dead shadow.
-- SET LOCAL keeps these scoped to the migration transaction so they don't leak
-- onto the pooled application connection (see migration 0002).
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- squawk-ignore ban-drop-column
ALTER TABLE instance DROP COLUMN IF EXISTS connection_error;
-- squawk-ignore ban-drop-column
ALTER TABLE instance DROP COLUMN IF EXISTS connection_state;

-- +goose Down
ALTER TABLE instance ADD COLUMN IF NOT EXISTS connection_state connection_state
    DEFAULT 'CONNECTION_STATE_UNSPECIFIED' NOT NULL;
ALTER TABLE instance ADD COLUMN IF NOT EXISTS connection_error text;
