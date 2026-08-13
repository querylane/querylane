-- +goose Up
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE IF NOT EXISTS mutation_audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    statement TEXT NOT NULL,
    target TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED')),
    result_summary TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

-- Default list order is newest first; the primary key already provides a
-- stable cursor and this index keeps filtered instance histories cheap.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_mutation_audit_log_instance_id
    ON mutation_audit_log (instance_name, id DESC);

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

DROP INDEX IF EXISTS idx_mutation_audit_log_instance_id;
DROP TABLE IF EXISTS mutation_audit_log;
