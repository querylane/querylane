-- +goose Up
-- SET LOCAL keeps these timeouts scoped to the migration transaction. A plain
-- SET would persist on the pooled connection (shared with the application) and
-- cause sporadic statement/lock timeout errors for minutes after startup.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- Registry of live querylane backend replicas. Each process upserts its row
-- on a heartbeat interval; id is the per-process lease-owner token used in
-- runner_execution_state.lease_owner. Rows of dead replicas are pruned
-- opportunistically by the heartbeat loop.
CREATE TABLE IF NOT EXISTS replica (
    id text NOT NULL,
    hostname text NOT NULL,
    pid bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT replica_pkey PRIMARY KEY (id)
);

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

DROP TABLE IF EXISTS replica;
