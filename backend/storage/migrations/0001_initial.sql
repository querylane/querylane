-- +goose Up

-- Extension for fuzzy search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum types mapping to protobuf enums
CREATE TYPE database_engine AS ENUM (
    'DATABASE_ENGINE_UNSPECIFIED',
    'DATABASE_ENGINE_POSTGRESQL'
);

CREATE TYPE connection_state AS ENUM (
    'CONNECTION_STATE_UNSPECIFIED',
    'CONNECTION_STATE_VALIDATING',
    'CONNECTION_STATE_ACTIVE',
    'CONNECTION_STATE_ERROR'
);

-- Shared trigger function for updated_at columns
-- +goose StatementBegin
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- ---------------------------------------------------------------------------
-- Instance: user-managed PostgreSQL server connections
-- ---------------------------------------------------------------------------

CREATE TABLE instance (
    id                TEXT PRIMARY KEY,
    display_name      TEXT NOT NULL,
    labels            JSONB NOT NULL DEFAULT '{}',
    engine            database_engine NOT NULL,
    engine_version    TEXT,
    config            JSONB NOT NULL,
    connection_state  connection_state NOT NULL DEFAULT 'CONNECTION_STATE_UNSPECIFIED',
    connection_error  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_instance_deleted_at ON instance(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_instance_updated_at
    BEFORE UPDATE ON instance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Catalog: cached metadata from user instances
-- ---------------------------------------------------------------------------

CREATE TABLE catalog_sync_state (
    scope           TEXT PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'pending',
    error           TEXT,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_catalog_sync_state_updated_at
    BEFORE UPDATE ON catalog_sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE catalog_database (
    instance_id        TEXT NOT NULL,
    name               TEXT NOT NULL,
    display_name       TEXT NOT NULL DEFAULT '',
    character_set      TEXT NOT NULL DEFAULT '',
    "collation"        TEXT NOT NULL DEFAULT '',
    owner              TEXT NOT NULL DEFAULT '',
    is_system_database BOOLEAN NOT NULL DEFAULT false,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, name)
);

CREATE TABLE catalog_schema (
    instance_id      TEXT NOT NULL,
    database_name    TEXT NOT NULL,
    name             TEXT NOT NULL,
    display_name     TEXT NOT NULL DEFAULT '',
    owner            TEXT NOT NULL DEFAULT '',
    is_system_schema BOOLEAN NOT NULL DEFAULT false,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, name)
);

CREATE TABLE catalog_table (
    instance_id     TEXT NOT NULL,
    database_name   TEXT NOT NULL,
    schema_name     TEXT NOT NULL,
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    table_type      TEXT NOT NULL DEFAULT 'BASE_TABLE',
    is_system_table BOOLEAN NOT NULL DEFAULT false,
    comment         TEXT NOT NULL DEFAULT '',
    owner           TEXT NOT NULL DEFAULT '',
    row_count       BIGINT NOT NULL DEFAULT 0,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, name)
);

CREATE TABLE catalog_column (
    instance_id              TEXT NOT NULL,
    database_name            TEXT NOT NULL,
    schema_name              TEXT NOT NULL,
    table_name               TEXT NOT NULL,
    name                     TEXT NOT NULL,
    ordinal_position         INT NOT NULL DEFAULT 0,
    data_type                INT NOT NULL DEFAULT 0,
    raw_type                 TEXT NOT NULL DEFAULT '',
    is_nullable              BOOLEAN NOT NULL DEFAULT false,
    is_primary_key           BOOLEAN NOT NULL DEFAULT false,
    is_unique                BOOLEAN NOT NULL DEFAULT false,
    default_value            TEXT,
    character_maximum_length INT,
    comment                  TEXT NOT NULL DEFAULT '',
    synced_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, table_name, name)
);

CREATE TABLE catalog_view (
    instance_id     TEXT NOT NULL,
    database_name   TEXT NOT NULL,
    schema_name     TEXT NOT NULL,
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    view_type       INT NOT NULL DEFAULT 0,
    owner           TEXT NOT NULL DEFAULT '',
    comment         TEXT NOT NULL DEFAULT '',
    is_system_view  BOOLEAN NOT NULL DEFAULT false,
    definition      TEXT NOT NULL DEFAULT '',
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    row_count       BIGINT NOT NULL DEFAULT 0,
    is_populated    BOOLEAN NOT NULL DEFAULT false,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, name)
);

CREATE TABLE catalog_table_constraint (
    instance_id              TEXT NOT NULL,
    database_name            TEXT NOT NULL,
    schema_name              TEXT NOT NULL,
    table_name               TEXT NOT NULL,
    name                     TEXT NOT NULL,
    type                     INT NOT NULL DEFAULT 0,
    column_names             TEXT[] NOT NULL DEFAULT '{}',
    referenced_schema_name   TEXT NOT NULL DEFAULT '',
    referenced_table_name    TEXT NOT NULL DEFAULT '',
    referenced_column_names  TEXT[] NOT NULL DEFAULT '{}',
    on_update                INT NOT NULL DEFAULT 0,
    on_delete                INT NOT NULL DEFAULT 0,
    definition               TEXT NOT NULL DEFAULT '',
    synced_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, table_name, name)
);

CREATE TABLE catalog_table_index (
    instance_id        TEXT NOT NULL,
    database_name      TEXT NOT NULL,
    schema_name        TEXT NOT NULL,
    table_name         TEXT NOT NULL,
    name               TEXT NOT NULL,
    method             TEXT NOT NULL DEFAULT '',
    is_unique          BOOLEAN NOT NULL DEFAULT false,
    key_columns        TEXT[] NOT NULL DEFAULT '{}',
    included_columns   TEXT[] NOT NULL DEFAULT '{}',
    predicate          TEXT NOT NULL DEFAULT '',
    size_bytes         BIGINT NOT NULL DEFAULT 0,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, table_name, name)
);

CREATE TABLE catalog_table_policy (
    instance_id        TEXT NOT NULL,
    database_name      TEXT NOT NULL,
    schema_name        TEXT NOT NULL,
    table_name         TEXT NOT NULL,
    name               TEXT NOT NULL,
    mode               INT NOT NULL DEFAULT 0,
    command            INT NOT NULL DEFAULT 0,
    roles              TEXT[] NOT NULL DEFAULT '{}',
    using_expression   TEXT NOT NULL DEFAULT '',
    check_expression   TEXT NOT NULL DEFAULT '',
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, table_name, name)
);

CREATE TABLE catalog_table_trigger (
    instance_id     TEXT NOT NULL,
    database_name   TEXT NOT NULL,
    schema_name     TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    name            TEXT NOT NULL,
    timing          TEXT NOT NULL DEFAULT '',
    events          TEXT[] NOT NULL DEFAULT '{}',
    function_name   TEXT NOT NULL DEFAULT '',
    enabled         BOOLEAN NOT NULL DEFAULT false,
    definition      TEXT NOT NULL DEFAULT '',
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, database_name, schema_name, table_name, name)
);

CREATE TABLE catalog_server_info (
    instance_id      TEXT PRIMARY KEY,
    version          TEXT NOT NULL DEFAULT '',
    version_num      INTEGER NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    is_in_recovery   BOOLEAN NOT NULL DEFAULT false,
    max_connections   INTEGER NOT NULL DEFAULT 0,
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fuzzy search indexes
CREATE INDEX idx_catalog_database_name_trgm ON catalog_database USING gin (name gin_trgm_ops);
CREATE INDEX idx_catalog_schema_name_trgm   ON catalog_schema   USING gin (name gin_trgm_ops);
CREATE INDEX idx_catalog_table_name_trgm    ON catalog_table    USING gin (name gin_trgm_ops);
CREATE INDEX idx_catalog_column_name_trgm   ON catalog_column   USING gin (name gin_trgm_ops);
CREATE INDEX idx_catalog_view_name_trgm     ON catalog_view     USING gin (name gin_trgm_ops);

-- +goose Down
DROP TABLE IF EXISTS catalog_server_info;
DROP TABLE IF EXISTS catalog_table_trigger;
DROP TABLE IF EXISTS catalog_table_policy;
DROP TABLE IF EXISTS catalog_table_index;
DROP TABLE IF EXISTS catalog_table_constraint;
DROP TABLE IF EXISTS catalog_view;
DROP TABLE IF EXISTS catalog_column;
DROP TABLE IF EXISTS catalog_table;
DROP TABLE IF EXISTS catalog_schema;
DROP TABLE IF EXISTS catalog_database;
DROP TABLE IF EXISTS catalog_sync_state;
DROP INDEX IF EXISTS idx_instance_deleted_at;
DROP TABLE IF EXISTS instance;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TYPE IF EXISTS connection_state;
DROP TYPE IF EXISTS database_engine;
DROP EXTENSION IF EXISTS pg_trgm;
