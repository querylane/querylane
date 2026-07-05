-- +goose Up
-- SET LOCAL keeps these timeouts scoped to the migration transaction. A plain
-- SET would persist on the pooled connection (shared with the application) and
-- cause sporadic statement/lock timeout errors for minutes after startup.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- stats_reset partitions cumulative counters: rate computations window over
-- rows sharing one stats_reset so a crash or pg_stat_reset() never yields a
-- negative delta. Windowing alone is not sufficient — dropped objects shrink
-- aggregated counters without a new stats_reset — so readers must also treat
-- any negative delta as a discontinuity. Nullable because the sample tables
-- predate the column and pg_stat_* views report NULL until the first reset.
ALTER TABLE instance_cache_sample
    ADD COLUMN IF NOT EXISTS stats_reset timestamp with time zone;

-- The cache probe scans pg_stat_database, which carries the instance-wide
-- activity counters (transactions, tuples, deadlocks, temp spill, PostgreSQL
-- 14+ session tallies) alongside the buffer-cache blocks. Persist them from
-- the same scan rather than adding a second probe. NOT NULL DEFAULT 0 because
-- the probe always supplies a value (0 when a server or fork omits the
-- counter), and the constant default keeps the column add cheap on existing
-- rows. They are cumulative counters -- window on stats_reset and treat any
-- negative delta as a discontinuity, exactly like blocks_hit/blocks_read.
ALTER TABLE instance_cache_sample
    ADD COLUMN IF NOT EXISTS xact_commit bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS xact_rollback bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tup_returned bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tup_fetched bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tup_inserted bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tup_updated bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tup_deleted bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS conflicts bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deadlocks bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS temp_files bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS temp_bytes bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sessions bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sessions_abandoned bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sessions_fatal bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sessions_killed bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS instance_io_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    reads bigint NOT NULL,
    read_bytes bigint NOT NULL,
    writes bigint NOT NULL,
    write_bytes bigint NOT NULL,
    extends bigint NOT NULL,
    extend_bytes bigint NOT NULL,
    fsyncs bigint NOT NULL,
    stats_reset timestamp with time zone,
    CONSTRAINT instance_io_sample_pkey PRIMARY KEY (instance_id, observed_at)
);

CREATE TABLE IF NOT EXISTS database_size_sample (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    size_bytes bigint NOT NULL,
    CONSTRAINT database_size_sample_pkey PRIMARY KEY (instance_id, database_name, observed_at)
);

CREATE TABLE IF NOT EXISTS database_vacuum_sample (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    live_tuples bigint NOT NULL,
    dead_tuples bigint NOT NULL,
    vacuum_count bigint NOT NULL,
    autovacuum_count bigint NOT NULL,
    stats_reset timestamp with time zone,
    CONSTRAINT database_vacuum_sample_pkey PRIMARY KEY (instance_id, database_name, observed_at)
);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_instance_io_sample_observed_at
    ON instance_io_sample USING btree (observed_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_database_size_sample_observed_at
    ON database_size_sample USING btree (observed_at);

-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_database_vacuum_sample_observed_at
    ON database_vacuum_sample USING btree (observed_at);

-- +goose Down
DROP INDEX IF EXISTS idx_database_vacuum_sample_observed_at;
DROP INDEX IF EXISTS idx_database_size_sample_observed_at;
DROP INDEX IF EXISTS idx_instance_io_sample_observed_at;

DROP TABLE IF EXISTS database_vacuum_sample;
DROP TABLE IF EXISTS database_size_sample;
DROP TABLE IF EXISTS instance_io_sample;

ALTER TABLE instance_cache_sample
    DROP COLUMN IF EXISTS sessions_killed,
    DROP COLUMN IF EXISTS sessions_fatal,
    DROP COLUMN IF EXISTS sessions_abandoned,
    DROP COLUMN IF EXISTS sessions,
    DROP COLUMN IF EXISTS temp_bytes,
    DROP COLUMN IF EXISTS temp_files,
    DROP COLUMN IF EXISTS deadlocks,
    DROP COLUMN IF EXISTS conflicts,
    DROP COLUMN IF EXISTS tup_deleted,
    DROP COLUMN IF EXISTS tup_updated,
    DROP COLUMN IF EXISTS tup_inserted,
    DROP COLUMN IF EXISTS tup_fetched,
    DROP COLUMN IF EXISTS tup_returned,
    DROP COLUMN IF EXISTS xact_rollback,
    DROP COLUMN IF EXISTS xact_commit;

ALTER TABLE instance_cache_sample
    DROP COLUMN IF EXISTS stats_reset;
