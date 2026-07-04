-- +goose Up
-- SET LOCAL keeps these timeouts scoped to the migration transaction. A plain
-- SET would persist on the pooled connection (shared with the application) and
-- cause sporadic statement/lock timeout errors for minutes after startup.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE IF NOT EXISTS instance_runtime_state (
    instance_id text NOT NULL,
    connection_state connection_state DEFAULT 'CONNECTION_STATE_UNSPECIFIED' NOT NULL,
    connection_error text,
    connection_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT instance_runtime_state_pkey PRIMARY KEY (instance_id)
);

CREATE TABLE IF NOT EXISTS runner_execution_state (
    runner_name text NOT NULL,
    target_name text NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_started_at timestamp with time zone,
    last_finished_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT runner_execution_state_pkey PRIMARY KEY (runner_name, target_name)
);

CREATE TABLE IF NOT EXISTS instance_connection_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    active bigint NOT NULL,
    idle bigint NOT NULL,
    total bigint NOT NULL,
    max_conn bigint NOT NULL,
    CONSTRAINT instance_connection_sample_pkey PRIMARY KEY (instance_id, observed_at)
);

CREATE TABLE IF NOT EXISTS instance_storage_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    total_size_bytes bigint NOT NULL,
    CONSTRAINT instance_storage_sample_pkey PRIMARY KEY (instance_id, observed_at)
);

CREATE TABLE IF NOT EXISTS instance_cache_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    blocks_hit bigint NOT NULL,
    blocks_read bigint NOT NULL,
    CONSTRAINT instance_cache_sample_pkey PRIMARY KEY (instance_id, observed_at)
);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_instance_runtime_state_connection_checked_at
    ON instance_runtime_state USING btree (connection_checked_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_runner_execution_state_lease_expires_at
    ON runner_execution_state USING btree (lease_expires_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_instance_connection_sample_observed_at
    ON instance_connection_sample USING btree (observed_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_instance_storage_sample_observed_at
    ON instance_storage_sample USING btree (observed_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_instance_cache_sample_observed_at
    ON instance_cache_sample USING btree (observed_at);

CREATE TRIGGER update_instance_runtime_state_updated_at
    BEFORE UPDATE ON instance_runtime_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_runner_execution_state_updated_at
    BEFORE UPDATE ON runner_execution_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- +goose Down
DROP TRIGGER IF EXISTS update_runner_execution_state_updated_at ON runner_execution_state;
DROP TRIGGER IF EXISTS update_instance_runtime_state_updated_at ON instance_runtime_state;

DROP INDEX IF EXISTS idx_instance_cache_sample_observed_at;
DROP INDEX IF EXISTS idx_instance_storage_sample_observed_at;
DROP INDEX IF EXISTS idx_instance_connection_sample_observed_at;
DROP INDEX IF EXISTS idx_runner_execution_state_lease_expires_at;
DROP INDEX IF EXISTS idx_instance_runtime_state_connection_checked_at;

DROP TABLE IF EXISTS instance_cache_sample;
DROP TABLE IF EXISTS instance_storage_sample;
DROP TABLE IF EXISTS instance_connection_sample;
DROP TABLE IF EXISTS runner_execution_state;
DROP TABLE IF EXISTS instance_runtime_state;
