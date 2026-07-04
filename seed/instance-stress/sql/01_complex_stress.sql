-- Querylane stress-lab seed.
-- Covers wide data types, keys, indexes, constraints, policies, triggers,
-- roles, groups, superusers, replication roles, built-in role grants, special
-- identifiers, partitions, views, materialized views, and high-row-count data.
--
-- Optional row count override for tests/manual runs:
--   SET querylane_stress.row_count = '50000';

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS file_fdw;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS pg_temp._querylane_stress_settings;
CREATE TEMP TABLE _querylane_stress_settings ON COMMIT PRESERVE ROWS AS
SELECT GREATEST(
    1,
    COALESCE(NULLIF(current_setting('querylane_stress.row_count', true), '')::integer, 50000)
) AS row_count;

-- =============================================================================
-- Roles, users, groups, superusers, replicators, built-in roles
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_admin') THEN
        CREATE ROLE ql_stress_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_readonly') THEN
        CREATE ROLE ql_stress_readonly NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_writer') THEN
        CREATE ROLE ql_stress_writer NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_auditor') THEN
        CREATE ROLE ql_stress_auditor NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_group') THEN
        CREATE ROLE ql_stress_group NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_app_user') THEN
        CREATE ROLE ql_stress_app_user LOGIN PASSWORD 'querylane_stress_app';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_owner') THEN
        CREATE ROLE ql_stress_owner LOGIN CREATEDB CREATEROLE PASSWORD 'querylane_stress_owner';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_superuser') THEN
        CREATE ROLE ql_stress_superuser LOGIN SUPERUSER PASSWORD 'querylane_stress_superuser';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_replicator') THEN
        CREATE ROLE ql_stress_replicator LOGIN REPLICATION PASSWORD 'querylane_stress_replicator';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_bypass_rls') THEN
        CREATE ROLE ql_stress_bypass_rls LOGIN BYPASSRLS PASSWORD 'querylane_stress_bypass_rls';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_noinherit') THEN
        CREATE ROLE ql_stress_noinherit NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ql_stress_connlimited') THEN
        CREATE ROLE ql_stress_connlimited LOGIN CONNECTION LIMIT 3 VALID UNTIL '2035-01-01 00:00:00+00' PASSWORD 'querylane_stress_connlimited';
    END IF;
END $$;

ALTER ROLE ql_stress_app_user WITH LOGIN PASSWORD 'querylane_stress_app';
ALTER ROLE ql_stress_owner WITH LOGIN CREATEDB CREATEROLE PASSWORD 'querylane_stress_owner';
ALTER ROLE ql_stress_superuser WITH LOGIN SUPERUSER PASSWORD 'querylane_stress_superuser';
ALTER ROLE ql_stress_replicator WITH LOGIN REPLICATION PASSWORD 'querylane_stress_replicator';
ALTER ROLE ql_stress_bypass_rls WITH LOGIN BYPASSRLS PASSWORD 'querylane_stress_bypass_rls';
ALTER ROLE ql_stress_noinherit WITH NOLOGIN NOINHERIT;
ALTER ROLE ql_stress_connlimited WITH LOGIN CONNECTION LIMIT 3 VALID UNTIL '2035-01-01 00:00:00+00' PASSWORD 'querylane_stress_connlimited';

GRANT ql_stress_group TO ql_stress_app_user;
GRANT ql_stress_readonly TO ql_stress_group;
GRANT ql_stress_writer TO ql_stress_owner;
GRANT ql_stress_auditor TO ql_stress_owner;
GRANT ql_stress_admin TO ql_stress_bypass_rls;
GRANT ql_stress_noinherit TO ql_stress_app_user WITH ADMIN OPTION;
GRANT ql_stress_readonly TO ql_stress_connlimited;
GRANT pg_monitor TO ql_stress_auditor;
GRANT pg_read_all_settings TO ql_stress_auditor;
GRANT pg_read_all_data TO ql_stress_readonly;
GRANT pg_write_all_data TO ql_stress_writer;
GRANT pg_signal_backend TO ql_stress_owner;

COMMENT ON ROLE ql_stress_replicator IS 'Logical replication role for role-detail and access-map smoke tests.';
COMMENT ON ROLE ql_stress_bypass_rls IS 'BYPASSRLS login role for full role-attribute coverage.';
COMMENT ON ROLE ql_stress_noinherit IS 'NOINHERIT group role with admin-option membership.';
COMMENT ON ROLE ql_stress_connlimited IS 'Connection-limited login role with finite valid-until timestamp.';

-- =============================================================================
-- Schemas, domains, enum/composite types, sequence
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS stress_core AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS stress_security AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS stress_partitions AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS stress_audit AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS stress_legacy AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS stress_external AUTHORIZATION CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS "unicode schema 🚦" AUTHORIZATION CURRENT_USER;

CREATE SEQUENCE IF NOT EXISTS stress_core.external_sequence START WITH 100000 CACHE 100;
CREATE COLLATION IF NOT EXISTS stress_core.c_locale_copy FROM "C";

DO $$
BEGIN
    CREATE TEXT SEARCH CONFIGURATION stress_core.stress_english (COPY = pg_catalog.english);
EXCEPTION
    WHEN duplicate_object OR unique_violation THEN NULL;
END $$;

DO $$
BEGIN
    CREATE DOMAIN stress_core.email_text AS text
        CHECK (VALUE ~* '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE DOMAIN stress_core.nonnegative_money AS numeric(19, 4)
        CHECK (VALUE >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE stress_core.money_range AS RANGE (
        subtype = numeric
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE stress_core.account_state AS ENUM (
        'trial', 'active', 'suspended', 'deleted', 'archived'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE stress_core.geo_point AS (
        latitude double precision,
        longitude double precision
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE stress_core.metric_row AS (
        metric_key text,
        metric_value numeric,
        measured_at timestamptz
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Core tables with keys, constraints, indexes, generated columns, defaults
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_core.tenants (
    tenant_id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
    display_name text NOT NULL,
    quota_range int4range NOT NULL CHECK (NOT isempty(quota_range)),
    flags jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(flags) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO stress_core.tenants (tenant_id, slug, display_name, quota_range, flags) VALUES
    ('00000000-0000-0000-0000-000000000001', 'acme-north', 'Acme North', '[1,10000)'::int4range, '{"tier":"enterprise","rlsTenant":true}'::jsonb),
    ('00000000-0000-0000-0000-000000000002', 'globex-emea', 'Globex EMEA', '[10000,20000)'::int4range, '{"tier":"business","rlsTenant":true}'::jsonb),
    ('00000000-0000-0000-0000-000000000003', 'initech-labs', 'Initech Labs', '[20000,30000)'::int4range, '{"tier":"startup","rlsTenant":true}'::jsonb),
    ('00000000-0000-0000-0000-000000000004', 'umbrella-rd', 'Umbrella R&D', '[30000,40000)'::int4range, '{"tier":"regulated","rlsTenant":true}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS stress_audit.table_activity (
    audit_id bigserial PRIMARY KEY,
    table_name regclass NOT NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    row_pk text NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by name NOT NULL DEFAULT current_user,
    before_row jsonb,
    after_row jsonb
);

CREATE TABLE IF NOT EXISTS stress_core.feature_matrix (
    row_id bigint PRIMARY KEY,
    synthetic_id bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
    tenant_id uuid NOT NULL REFERENCES stress_core.tenants(tenant_id) DEFERRABLE INITIALLY IMMEDIATE,
    business_key text NOT NULL,
    smallint_val smallint NOT NULL,
    integer_val integer NOT NULL,
    bigint_val bigint NOT NULL,
    numeric_val numeric(30, 10) NOT NULL,
    decimal_val decimal(19, 4) NOT NULL,
    real_val real NOT NULL,
    double_val double precision NOT NULL,
    money_val money NOT NULL,
    boolean_val boolean NOT NULL,
    fixed_char char(8) NOT NULL,
    varchar_val varchar(255) NOT NULL,
    short_text text NOT NULL,
    long_text text NOT NULL,
    email stress_core.email_text NOT NULL,
    state stress_core.account_state NOT NULL DEFAULT 'trial',
    uuid_val uuid NOT NULL,
    bytea_val bytea NOT NULL,
    json_val json NOT NULL,
    jsonb_val jsonb NOT NULL CHECK (jsonb_typeof(jsonb_val) = 'object'),
    xml_val xml NOT NULL,
    text_array text[] NOT NULL DEFAULT '{}',
    int_array integer[] NOT NULL DEFAULT '{}',
    uuid_array uuid[] NOT NULL DEFAULT '{}',
    jsonb_array jsonb[] NOT NULL DEFAULT '{}',
    date_val date NOT NULL,
    time_val time NOT NULL,
    timetz_val timetz NOT NULL,
    timestamp_val timestamp NOT NULL,
    timestamptz_val timestamptz NOT NULL,
    interval_val interval NOT NULL,
    inet_val inet NOT NULL,
    cidr_val cidr NOT NULL,
    macaddr_val macaddr NOT NULL,
    macaddr8_val macaddr8 NOT NULL,
    point_val point NOT NULL,
    line_val line NOT NULL,
    lseg_val lseg NOT NULL,
    box_val box NOT NULL,
    path_val path NOT NULL,
    polygon_val polygon NOT NULL,
    circle_val circle NOT NULL,
    geo_val stress_core.geo_point NOT NULL,
    tsvector_val tsvector NOT NULL,
    tsquery_val tsquery NOT NULL,
    bit_val bit(8) NOT NULL,
    varbit_val varbit(32) NOT NULL,
    int4range_val int4range NOT NULL,
    int8range_val int8range NOT NULL,
    numrange_val numrange NOT NULL,
    tsrange_val tsrange NOT NULL,
    tstzrange_val tstzrange NOT NULL,
    daterange_val daterange NOT NULL,
    int4multirange_val int4multirange NOT NULL,
    oid_val oid NOT NULL,
    name_val name NOT NULL,
    regtype_val regtype NOT NULL,
    pg_lsn_val pg_lsn NOT NULL,
    xid8_val xid8 NOT NULL,
    active_window tstzrange NOT NULL,
    nullable_text text,
    generated_total numeric(40, 10) GENERATED ALWAYS AS (numeric_val * integer_val) STORED,
    search_document tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(short_text, '') || ' ' || coalesce(long_text, ''))
    ) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT feature_matrix_business_key_unique UNIQUE (tenant_id, business_key),
    CONSTRAINT feature_matrix_nonnegative_numbers CHECK (smallint_val >= 0 AND integer_val >= 0 AND bigint_val >= 0),
    CONSTRAINT feature_matrix_text_not_blank CHECK (length(btrim(short_text)) > 0),
    CONSTRAINT feature_matrix_arrays_not_empty CHECK (cardinality(text_array) > 0 AND cardinality(int_array) > 0),
    CONSTRAINT feature_matrix_json_has_row CHECK (jsonb_val ? 'rowId'),
    CONSTRAINT feature_matrix_active_window_not_empty CHECK (NOT isempty(active_window)),
    -- Intentional stress feature: this GiST EXCLUDE constraint is often the
    -- dominant insert cost when querylane_stress.row_count is large.
    CONSTRAINT feature_matrix_no_tenant_time_overlap EXCLUDE USING gist (tenant_id WITH =, active_window WITH &&)
);

CREATE INDEX IF NOT EXISTS feature_matrix_state_created_idx ON stress_core.feature_matrix (state, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_matrix_business_key_hash_idx ON stress_core.feature_matrix USING hash (business_key);
CREATE INDEX IF NOT EXISTS feature_matrix_jsonb_gin_idx ON stress_core.feature_matrix USING gin (jsonb_val jsonb_path_ops);
CREATE INDEX IF NOT EXISTS feature_matrix_text_array_gin_idx ON stress_core.feature_matrix USING gin (text_array);
CREATE INDEX IF NOT EXISTS feature_matrix_search_gin_idx ON stress_core.feature_matrix USING gin (search_document);
CREATE INDEX IF NOT EXISTS feature_matrix_active_window_gist_idx ON stress_core.feature_matrix USING gist (active_window);
CREATE INDEX IF NOT EXISTS feature_matrix_timestamptz_brin_idx ON stress_core.feature_matrix USING brin (timestamptz_val);
CREATE INDEX IF NOT EXISTS feature_matrix_point_spgist_idx ON stress_core.feature_matrix USING spgist (point_val);
CREATE INDEX IF NOT EXISTS feature_matrix_lower_email_idx ON stress_core.feature_matrix (lower(email));
CREATE INDEX IF NOT EXISTS feature_matrix_short_text_c_locale_idx ON stress_core.feature_matrix (short_text COLLATE stress_core.c_locale_copy);
CREATE INDEX IF NOT EXISTS feature_matrix_active_partial_idx ON stress_core.feature_matrix (tenant_id, row_id) WHERE state IN ('trial', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS feature_matrix_nullable_text_singleton_idx
    ON stress_core.feature_matrix (tenant_id, nullable_text) NULLS NOT DISTINCT
    WHERE row_id < 10;
CREATE UNIQUE INDEX IF NOT EXISTS feature_matrix_active_business_key_unique_idx
    ON stress_core.feature_matrix (tenant_id, business_key)
    WHERE state <> 'deleted';
CREATE INDEX IF NOT EXISTS feature_matrix_state_covering_idx
    ON stress_core.feature_matrix (tenant_id, state)
    INCLUDE (created_at, updated_at, email);
ALTER TABLE stress_core.feature_matrix REPLICA IDENTITY USING INDEX feature_matrix_business_key_unique;
ALTER TABLE stress_core.feature_matrix SET (
    fillfactor = 85,
    autovacuum_vacuum_scale_factor = 0.05
);
ALTER TABLE stress_core.feature_matrix ALTER COLUMN long_text SET STORAGE EXTENDED;
ALTER INDEX stress_core.feature_matrix_state_covering_idx SET (fillfactor = 90);

CREATE STATISTICS IF NOT EXISTS feature_matrix_tenant_state_stats
    (dependencies, ndistinct, mcv)
    ON tenant_id, state, created_at
    FROM stress_core.feature_matrix;

CREATE UNLOGGED TABLE IF NOT EXISTS stress_core.unlogged_import_buffer (
    import_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_name text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unlogged_import_buffer_source_unique UNIQUE (source_name),
    CONSTRAINT unlogged_import_buffer_payload_object CHECK (jsonb_typeof(payload) = 'object')
);
ALTER TABLE stress_core.unlogged_import_buffer
    DROP CONSTRAINT IF EXISTS unlogged_import_buffer_received_recent;
ALTER TABLE stress_core.unlogged_import_buffer
    ADD CONSTRAINT unlogged_import_buffer_received_recent
    CHECK (received_at >= timestamptz '2020-01-01 00:00:00+00') NOT VALID;

CREATE TABLE IF NOT EXISTS stress_core.typed_metrics OF stress_core.metric_row (
    metric_key WITH OPTIONS NOT NULL,
    metric_value WITH OPTIONS NOT NULL,
    measured_at WITH OPTIONS NOT NULL,
    PRIMARY KEY (metric_key, measured_at)
);

CREATE TABLE IF NOT EXISTS stress_core.catalog_edge_objects (
    edge_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ci_label citext NOT NULL UNIQUE,
    attributes hstore NOT NULL,
    price_window stress_core.money_range NOT NULL,
    search_text text COLLATE stress_core.c_locale_copy NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT catalog_edge_objects_attributes_source CHECK (attributes ? 'source')
);

CREATE INDEX IF NOT EXISTS catalog_edge_objects_attributes_gin_idx
    ON stress_core.catalog_edge_objects USING gin (attributes);
CREATE INDEX IF NOT EXISTS catalog_edge_objects_price_window_gist_idx
    ON stress_core.catalog_edge_objects USING gist (price_window);
CREATE INDEX IF NOT EXISTS catalog_edge_objects_search_trgm_idx
    ON stress_core.catalog_edge_objects USING gin (search_text gin_trgm_ops);
ALTER TABLE stress_core.catalog_edge_objects SET (fillfactor = 70);

CREATE TABLE IF NOT EXISTS stress_core.feature_children (
    row_id bigint NOT NULL,
    child_no integer NOT NULL,
    child_payload jsonb NOT NULL CHECK (jsonb_typeof(child_payload) = 'object'),
    child_label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (row_id, child_no),
    CONSTRAINT feature_children_feature_matrix_fk
        FOREIGN KEY (row_id)
        REFERENCES stress_core.feature_matrix(row_id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT feature_children_label_unique UNIQUE (row_id, child_label)
);

CREATE INDEX IF NOT EXISTS feature_children_payload_gin_idx ON stress_core.feature_children USING gin (child_payload);

-- =============================================================================
-- Security-sensitive table with RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_security.sensitive_accounts (
    account_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES stress_core.tenants(tenant_id),
    owner_email stress_core.email_text NOT NULL,
    secret_ref text NOT NULL CHECK (secret_ref ~ '^secret://[a-z0-9/_-]+$'),
    allowed_roles name[] NOT NULL DEFAULT ARRAY['ql_stress_admin'::name],
    risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, owner_email)
);

CREATE INDEX IF NOT EXISTS sensitive_accounts_tenant_idx ON stress_security.sensitive_accounts (tenant_id, risk_score DESC);
CREATE INDEX IF NOT EXISTS sensitive_accounts_roles_gin_idx ON stress_security.sensitive_accounts USING gin (allowed_roles);

-- =============================================================================
-- Partitioned append-heavy event table
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_partitions.event_log (
    tenant_id uuid NOT NULL REFERENCES stress_core.tenants(tenant_id),
    event_id bigint NOT NULL,
    occurred_at timestamptz NOT NULL,
    actor_id uuid NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('view', 'search', 'export', 'mutation', 'error', 'bulk_import')),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    latency_ms integer NOT NULL CHECK (latency_ms >= 0),
    tags text[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (occurred_at, event_id)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS stress_partitions.event_log_2026_01
    PARTITION OF stress_partitions.event_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE IF NOT EXISTS stress_partitions.event_log_2026_02
    PARTITION OF stress_partitions.event_log
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS stress_partitions.event_log_2026_03
    PARTITION OF stress_partitions.event_log
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX IF NOT EXISTS event_log_tenant_occurred_idx ON stress_partitions.event_log (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS event_log_payload_gin_idx ON stress_partitions.event_log USING gin (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS event_log_tags_gin_idx ON stress_partitions.event_log USING gin (tags);
CREATE INDEX IF NOT EXISTS event_log_latency_brin_idx ON stress_partitions.event_log USING brin (latency_ms);

CREATE TABLE IF NOT EXISTS stress_partitions.tenant_event_list (
    tenant_slug text NOT NULL,
    event_id bigint NOT NULL,
    event_payload jsonb NOT NULL,
    PRIMARY KEY (tenant_slug, event_id)
) PARTITION BY LIST (tenant_slug);

CREATE TABLE IF NOT EXISTS stress_partitions.tenant_event_acme
    PARTITION OF stress_partitions.tenant_event_list
    FOR VALUES IN ('acme-north');

CREATE TABLE IF NOT EXISTS stress_partitions.tenant_event_globex
    PARTITION OF stress_partitions.tenant_event_list
    FOR VALUES IN ('globex-emea');

CREATE TABLE IF NOT EXISTS stress_partitions.tenant_event_default
    PARTITION OF stress_partitions.tenant_event_list
    DEFAULT;

CREATE TABLE IF NOT EXISTS stress_partitions.hash_bucket_items (
    bucket_id integer NOT NULL,
    item_id bigint NOT NULL,
    item_payload jsonb NOT NULL,
    PRIMARY KEY (bucket_id, item_id)
) PARTITION BY HASH (bucket_id);

CREATE TABLE IF NOT EXISTS stress_partitions.hash_bucket_items_p0
    PARTITION OF stress_partitions.hash_bucket_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);

CREATE TABLE IF NOT EXISTS stress_partitions.hash_bucket_items_p1
    PARTITION OF stress_partitions.hash_bucket_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);

CREATE TABLE IF NOT EXISTS stress_partitions.hash_bucket_items_p2
    PARTITION OF stress_partitions.hash_bucket_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);

CREATE TABLE IF NOT EXISTS stress_partitions.hash_bucket_items_p3
    PARTITION OF stress_partitions.hash_bucket_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- =============================================================================
-- Legacy inheritance and foreign data wrappers
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_legacy.measurement_parent (
    measurement_id bigint NOT NULL,
    measured_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS stress_legacy.measurement_2026_q1 (
    PRIMARY KEY (measurement_id),
    CHECK (measured_at >= timestamptz '2026-01-01' AND measured_at < timestamptz '2026-04-01')
) INHERITS (stress_legacy.measurement_parent);

CREATE TABLE IF NOT EXISTS stress_legacy.measurement_2026_q2 (
    PRIMARY KEY (measurement_id),
    CHECK (measured_at >= timestamptz '2026-04-01' AND measured_at < timestamptz '2026-07-01')
) INHERITS (stress_legacy.measurement_parent);

CREATE INDEX IF NOT EXISTS measurement_2026_q1_measured_idx ON stress_legacy.measurement_2026_q1 (measured_at);
CREATE INDEX IF NOT EXISTS measurement_2026_q2_measured_idx ON stress_legacy.measurement_2026_q2 (measured_at);

CREATE SERVER IF NOT EXISTS stress_file_server
    FOREIGN DATA WRAPPER file_fdw;

CREATE FOREIGN TABLE IF NOT EXISTS stress_external.empty_csv_feed (
    feed_id integer,
    feed_name text,
    feed_payload text
)
SERVER stress_file_server
OPTIONS (filename '/dev/null', format 'csv');

-- =============================================================================
-- Special identifiers for route/quoting/UI smoke
-- =============================================================================

CREATE TABLE IF NOT EXISTS "unicode schema 🚦"."table with spaces and emoji 🚀" (
    "select" integer PRIMARY KEY,
    "mixed Case Column" text NOT NULL,
    "json.path" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "emoji table json object check" CHECK (jsonb_typeof("json.path") = 'object')
);

INSERT INTO "unicode schema 🚦"."table with spaces and emoji 🚀" ("select", "mixed Case Column", "json.path") VALUES
    (1, 'unicode route smoke 日本語', '{"emoji":"🚀","space":true}'::jsonb),
    (2, 'reserved keyword smoke', '{"keyword":"select","quoted":true}'::jsonb)
ON CONFLICT ("select") DO NOTHING;

-- =============================================================================
-- Legacy encoding mock data for client/rendering smoke
-- =============================================================================

CREATE TABLE IF NOT EXISTS stress_core.legacy_encoding_samples (
    encoding_name text PRIMARY KEY,
    encoding_scope text NOT NULL CHECK (encoding_scope IN ('client', 'server')),
    sample_text text NOT NULL,
    legacy_bytes bytea NOT NULL,
    CONSTRAINT legacy_encoding_samples_text_not_blank CHECK (length(btrim(sample_text)) > 0),
    CONSTRAINT legacy_encoding_samples_bytes_not_empty CHECK (octet_length(legacy_bytes) > 0)
);

INSERT INTO stress_core.legacy_encoding_samples (
    encoding_name,
    encoding_scope,
    sample_text,
    legacy_bytes
) VALUES
    (
        'BIG5',
        'client',
        '繁體中文資料',
        decode('c163c5e9a4a4a4e5b8eaaec6', 'hex')
    ),
    (
        'Shift_JIS',
        'client',
        '日本語の資料',
        decode('93fa967b8cea82cc8e9197bf', 'hex')
    ),
    (
        'EUC-JP',
        'server',
        '日本語の資料',
        decode('c6fccbdcb8eca4cebbf1cec1', 'hex')
    ),
    (
        'EUC-KR',
        'server',
        '한국어 자료',
        decode('c7d1b1b9beee20c0dab7e1', 'hex')
    ),
    (
        'windows-1251',
        'server',
        'Привет мир',
        decode('cff0e8e2e5f220ece8f0', 'hex')
    )
ON CONFLICT (encoding_name) DO UPDATE SET
    encoding_scope = EXCLUDED.encoding_scope,
    sample_text = EXCLUDED.sample_text,
    legacy_bytes = EXCLUDED.legacy_bytes;

-- =============================================================================
-- High-volume deterministic data
-- =============================================================================

WITH settings AS (
    SELECT row_count FROM _querylane_stress_settings
), tenants AS (
    SELECT tenant_id, row_number() OVER (ORDER BY tenant_id) AS tenant_ordinal
    FROM stress_core.tenants
), series AS (
    SELECT gs, t.tenant_id, t.tenant_ordinal
    FROM generate_series(1, (SELECT row_count FROM settings)) AS gs
    JOIN tenants t ON ((gs - 1) % 4) + 1 = t.tenant_ordinal
)
INSERT INTO stress_core.feature_matrix (
    row_id,
    tenant_id,
    business_key,
    smallint_val,
    integer_val,
    bigint_val,
    numeric_val,
    decimal_val,
    real_val,
    double_val,
    money_val,
    boolean_val,
    fixed_char,
    varchar_val,
    short_text,
    long_text,
    email,
    state,
    uuid_val,
    bytea_val,
    json_val,
    jsonb_val,
    xml_val,
    text_array,
    int_array,
    uuid_array,
    jsonb_array,
    date_val,
    time_val,
    timetz_val,
    timestamp_val,
    timestamptz_val,
    interval_val,
    inet_val,
    cidr_val,
    macaddr_val,
    macaddr8_val,
    point_val,
    line_val,
    lseg_val,
    box_val,
    path_val,
    polygon_val,
    circle_val,
    geo_val,
    tsvector_val,
    tsquery_val,
    bit_val,
    varbit_val,
    int4range_val,
    int8range_val,
    numrange_val,
    tsrange_val,
    tstzrange_val,
    daterange_val,
    int4multirange_val,
    oid_val,
    name_val,
    regtype_val,
    pg_lsn_val,
    xid8_val,
    active_window,
    nullable_text,
    created_at,
    updated_at
)
SELECT
    gs AS row_id,
    tenant_id,
    format('tenant-%s-row-%s', tenant_ordinal, gs) AS business_key,
    (gs % 32767)::smallint,
    (gs * 10)::integer,
    (gs::bigint * 1000000)::bigint,
    (gs::numeric / 7.0)::numeric(30, 10),
    (gs::numeric / 3.0)::numeric(19, 4),
    (gs::real / 11.0)::real,
    (gs::double precision / 13.0)::double precision,
    (gs % 10000)::numeric::money,
    (gs % 2 = 0),
    lpad((gs % 100000000)::text, 8, '0')::char(8),
    format('varchar value %s with unicode Ω≈ç√∫˜µ≤≥÷', gs),
    format('short text row %s', gs),
    repeat(format('long text payload row %s — Querylane renders scrollable cells with unicode 日本語 🚀 ', gs), 3),
    format('stress-%s@example.test', gs)::stress_core.email_text,
    (ARRAY['trial', 'active', 'suspended', 'deleted', 'archived'])[(gs % 5) + 1]::stress_core.account_state,
    format('10000000-0000-0000-0000-%s', lpad(gs::text, 12, '0'))::uuid,
    decode(md5(gs::text), 'hex'),
    json_build_object('rowId', gs, 'tenantOrdinal', tenant_ordinal, 'kind', 'json')::json,
    jsonb_build_object(
        'rowId', gs,
        'tenantOrdinal', tenant_ordinal,
        'flags', jsonb_build_array('wide', 'stress', CASE WHEN gs % 2 = 0 THEN 'even' ELSE 'odd' END),
        'nested', jsonb_build_object('depth', 3, 'checksum', md5(gs::text))
    ),
    xmlelement(name payload, xmlattributes(gs AS id), format('xml value %s', gs)),
    ARRAY[format('tag-%s', gs % 11), 'querylane', CASE WHEN gs % 2 = 0 THEN 'even' ELSE 'odd' END],
    ARRAY[gs::integer, (gs * 2)::integer, (gs * 3)::integer],
    ARRAY[
        format('20000000-0000-0000-0000-%s', lpad(gs::text, 12, '0'))::uuid,
        format('30000000-0000-0000-0000-%s', lpad(gs::text, 12, '0'))::uuid
    ],
    ARRAY[
        jsonb_build_object('ordinal', 1, 'rowId', gs),
        jsonb_build_object('ordinal', 2, 'rowId', gs)
    ],
    date '2026-01-01' + ((gs % 365)::integer),
    time '00:00:00' + ((gs % 86400) * interval '1 second'),
    timetz '00:00:00+00' + ((gs % 86400) * interval '1 second'),
    timestamp '2026-01-01 00:00:00' + (gs * interval '1 minute'),
    timestamptz '2026-01-01 00:00:00+00' + (gs * interval '1 minute'),
    (gs % 1000) * interval '1 minute',
    format('10.42.%s.%s', gs % 250, ((gs / 250) % 250) + 1)::inet,
    format('10.%s.0.0/16', gs % 200)::cidr,
    format(
        '08:00:2b:%s:%s:%s',
        lpad(to_hex((gs % 250)::integer), 2, '0'),
        lpad(to_hex(((gs / 250) % 250)::integer), 2, '0'),
        lpad(to_hex(((gs / 62500) % 250)::integer), 2, '0')
    )::macaddr,
    '08:00:2b:01:02:03:04:05'::macaddr8,
    point((gs % 360)::double precision, (gs % 180)::double precision),
    '{1,-1,0}'::line,
    lseg(point(0, 0), point((gs % 100)::double precision, (gs % 50)::double precision)),
    box(point(0, 0), point((gs % 100)::double precision + 1, (gs % 50)::double precision + 1)),
    path(format('[(0,0),(%s,%s),(%s,%s)]', gs % 10, gs % 20, gs % 30, gs % 40)),
    polygon(format('((0,0),(%s,0),(%s,%s),(0,%s))', (gs % 10) + 1, (gs % 10) + 1, (gs % 10) + 1, (gs % 10) + 1)),
    circle(point((gs % 100)::double precision, (gs % 100)::double precision), ((gs % 20) + 1)::double precision),
    ROW(((gs % 180) - 90)::double precision, ((gs % 360) - 180)::double precision)::stress_core.geo_point,
    to_tsvector('english', format('stress searchable document row %s tenant %s', gs, tenant_ordinal)),
    plainto_tsquery('english', 'stress searchable'),
    B'10101010'::bit(8),
    substring(repeat('10110011', 4) FROM 1 FOR 32)::varbit(32),
    int4range(gs::integer, (gs + 10)::integer, '[)'),
    int8range(gs::bigint, (gs + 1000)::bigint, '[)'),
    numrange(gs::numeric, (gs + 0.5)::numeric, '[)'),
    tsrange(timestamp '2026-01-01' + (gs * interval '1 minute'), timestamp '2026-01-01' + ((gs + 1) * interval '1 minute'), '[)'),
    tstzrange(timestamptz '2026-01-01 00:00:00+00' + (gs * interval '1 hour'), timestamptz '2026-01-01 00:00:00+00' + ((gs + 1) * interval '1 hour'), '[)'),
    daterange(date '2026-01-01' + (gs::integer % 365), date '2026-01-02' + (gs::integer % 365), '[)'),
    int4multirange(int4range(gs::integer, (gs + 2)::integer, '[)'), int4range((gs + 10)::integer, (gs + 12)::integer, '[)')),
    gs::oid,
    format('stress_%s', gs)::name,
    'text'::regtype,
    '0/16B6C50'::pg_lsn,
    (pg_current_xact_id()::text::bigint + gs)::text::xid8,
    tstzrange(timestamptz '2027-01-01 00:00:00+00' + (gs * interval '1 hour'), timestamptz '2027-01-01 00:00:00+00' + ((gs + 1) * interval '1 hour'), '[)'),
    CASE WHEN gs % 7 = 0 THEN NULL ELSE format('nullable text %s', gs) END,
    timestamptz '2026-01-01 00:00:00+00' + (gs * interval '1 minute'),
    timestamptz '2026-01-01 00:00:00+00' + (gs * interval '1 minute')
FROM series
ON CONFLICT (row_id) DO NOTHING;

WITH settings AS (
    SELECT row_count FROM _querylane_stress_settings
), child_series AS (
    SELECT fm.row_id, child_no
    FROM stress_core.feature_matrix fm
    CROSS JOIN generate_series(1, 2) AS child_no
    WHERE fm.row_id <= (SELECT row_count FROM settings)
)
INSERT INTO stress_core.feature_children (row_id, child_no, child_payload, child_label)
SELECT
    row_id,
    child_no,
    jsonb_build_object('rowId', row_id, 'childNo', child_no, 'notes', repeat('child payload ', child_no)),
    format('child-%s', child_no)
FROM child_series
ON CONFLICT (row_id, child_no) DO NOTHING;

WITH settings AS (
    SELECT row_count * 4 AS event_count FROM _querylane_stress_settings
), tenants AS (
    SELECT tenant_id, row_number() OVER (ORDER BY tenant_id) AS tenant_ordinal
    FROM stress_core.tenants
), series AS (
    SELECT gs, t.tenant_id, t.tenant_ordinal
    FROM generate_series(1, (SELECT event_count FROM settings)) AS gs
    JOIN tenants t ON ((gs - 1) % 4) + 1 = t.tenant_ordinal
)
INSERT INTO stress_partitions.event_log (
    tenant_id,
    event_id,
    occurred_at,
    actor_id,
    event_type,
    payload,
    latency_ms,
    tags
)
SELECT
    tenant_id,
    gs AS event_id,
    timestamptz '2026-01-01 00:00:00+00'
        + (((gs - 1) % 89) * interval '1 day')
        + ((gs % 86400) * interval '1 second'),
    format('40000000-0000-0000-0000-%s', lpad(gs::text, 12, '0'))::uuid,
    (ARRAY['view', 'search', 'export', 'mutation', 'error', 'bulk_import'])[(gs % 6) + 1],
    jsonb_build_object(
        'eventId', gs,
        'tenantOrdinal', tenant_ordinal,
        'path', format('/stress/%s/%s', tenant_ordinal, gs),
        'expensivePayload', repeat(md5(gs::text), 4)
    ),
    (gs % 5000)::integer,
    ARRAY[format('tenant-%s', tenant_ordinal), format('bucket-%s', gs % 17)]
FROM series
ON CONFLICT (occurred_at, event_id) DO NOTHING;

INSERT INTO stress_partitions.tenant_event_list (tenant_slug, event_id, event_payload) VALUES
    ('acme-north', 1, '{"partition":"list","tenant":"acme-north"}'::jsonb),
    ('globex-emea', 2, '{"partition":"list","tenant":"globex-emea"}'::jsonb),
    ('other-tenant', 3, '{"partition":"default","tenant":"other-tenant"}'::jsonb)
ON CONFLICT (tenant_slug, event_id) DO NOTHING;

INSERT INTO stress_partitions.hash_bucket_items (bucket_id, item_id, item_payload)
SELECT
    bucket_id,
    bucket_id + 1000,
    jsonb_build_object('partition', 'hash', 'bucket', bucket_id)
FROM generate_series(0, 15) AS bucket_id
ON CONFLICT (bucket_id, item_id) DO NOTHING;

INSERT INTO stress_legacy.measurement_2026_q1 (measurement_id, measured_at, payload) VALUES
    (1, '2026-01-15 00:00:00+00', '{"inherited":"q1"}'::jsonb),
    (2, '2026-03-15 00:00:00+00', '{"inherited":"q1"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO stress_legacy.measurement_2026_q2 (measurement_id, measured_at, payload) VALUES
    (3, '2026-04-15 00:00:00+00', '{"inherited":"q2"}'::jsonb),
    (4, '2026-06-15 00:00:00+00', '{"inherited":"q2"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO stress_core.unlogged_import_buffer (source_name, payload) VALUES
    ('bulk-loader-a', '{"rows":1000,"mode":"append"}'::jsonb),
    ('bulk-loader-b', '{"rows":500,"mode":"upsert"}'::jsonb)
ON CONFLICT (source_name) DO NOTHING;

INSERT INTO stress_core.typed_metrics (metric_key, metric_value, measured_at) VALUES
    ('latency_p95', 123.45, '2026-01-01 00:00:00+00'),
    ('error_rate', 0.0123, '2026-01-01 00:00:00+00')
ON CONFLICT (metric_key, measured_at) DO NOTHING;

INSERT INTO stress_core.catalog_edge_objects (ci_label, attributes, price_window, search_text) VALUES
    ('CaseFolded', '"source"=>"seed", "kind"=>"hstore", "tenant"=>"acme"'::hstore, '[10.00,99.99]'::stress_core.money_range, 'Trigram searchable text with C collation'),
    ('casefolded-secondary', '"source"=>"seed", "kind"=>"range", "tenant"=>"globex"'::hstore, '[100.00,199.99]'::stress_core.money_range, 'Another searchable extension payload')
ON CONFLICT (ci_label) DO NOTHING;

INSERT INTO stress_security.sensitive_accounts (account_id, tenant_id, owner_email, secret_ref, allowed_roles, risk_score)
SELECT
    format('50000000-0000-0000-0000-%s', lpad(tenant_ordinal::text, 12, '0'))::uuid,
    tenant_id,
    format('owner-%s@example.test', tenant_ordinal)::stress_core.email_text,
    format('secret://tenant/%s/root-token', tenant_ordinal),
    ARRAY['ql_stress_admin'::name, 'ql_stress_auditor'::name],
    25 * tenant_ordinal
FROM (
    SELECT tenant_id, row_number() OVER (ORDER BY tenant_id) AS tenant_ordinal
    FROM stress_core.tenants
) t
ON CONFLICT (account_id) DO NOTHING;

-- =============================================================================
-- Functions, triggers, views, materialized views, RLS policies, publication
-- =============================================================================

CREATE OR REPLACE FUNCTION stress_core.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feature_matrix_touch_updated_at ON stress_core.feature_matrix;
CREATE TRIGGER feature_matrix_touch_updated_at
    BEFORE UPDATE ON stress_core.feature_matrix
    FOR EACH ROW
    EXECUTE FUNCTION stress_core.touch_updated_at();

CREATE OR REPLACE FUNCTION stress_audit.capture_feature_matrix_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stress_audit.table_activity (table_name, action, row_pk, before_row, after_row)
    VALUES (
        TG_RELID::regclass,
        TG_OP,
        COALESCE(NEW.row_id::text, OLD.row_id::text),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION stress_audit.capture_statement_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO stress_audit.table_activity (table_name, action, row_pk, before_row, after_row)
    VALUES (TG_RELID::regclass, TG_OP, 'statement', NULL, jsonb_build_object('level', TG_LEVEL));
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION stress_audit.capture_ddl_command()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE DEBUG 'querylane stress DDL command captured';
END;
$$;

DROP TRIGGER IF EXISTS feature_matrix_audit_insert ON stress_core.feature_matrix;
CREATE TRIGGER feature_matrix_audit_insert
    AFTER INSERT ON stress_core.feature_matrix
    FOR EACH ROW
    EXECUTE FUNCTION stress_audit.capture_feature_matrix_audit();

DROP TRIGGER IF EXISTS feature_matrix_audit_update_delete ON stress_core.feature_matrix;
CREATE TRIGGER feature_matrix_audit_update_delete
    AFTER UPDATE OR DELETE ON stress_core.feature_matrix
    FOR EACH ROW
    EXECUTE FUNCTION stress_audit.capture_feature_matrix_audit();

DROP TRIGGER IF EXISTS feature_children_disabled_statement ON stress_core.feature_children;
CREATE TRIGGER feature_children_disabled_statement
    AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON stress_core.feature_children
    FOR EACH STATEMENT
    EXECUTE FUNCTION stress_audit.capture_statement_audit();

ALTER TABLE stress_core.feature_children DISABLE TRIGGER feature_children_disabled_statement;

CREATE OR REPLACE PROCEDURE stress_core.rotate_feature_states(max_rows integer DEFAULT 100)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE stress_core.feature_matrix
    SET state = CASE state
        WHEN 'trial' THEN 'active'::stress_core.account_state
        WHEN 'active' THEN 'suspended'::stress_core.account_state
        WHEN 'suspended' THEN 'archived'::stress_core.account_state
        ELSE state
    END
    WHERE row_id IN (
        SELECT row_id
        FROM stress_core.feature_matrix
        ORDER BY row_id
        LIMIT GREATEST(max_rows, 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION stress_core.weighted_feature_score(
    base_score numeric,
    multiplier numeric DEFAULT 1.0
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT round(coalesce(base_score, 0) * multiplier, 4)
$$;

DO $$
BEGIN
    CREATE AGGREGATE stress_core.feature_state_rollup(bigint) (
        SFUNC = int8pl,
        STYPE = bigint,
        INITCOND = '0'
    );
EXCEPTION
    WHEN duplicate_function OR duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION stress_security.mask_secret(secret_ref text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = stress_security, pg_temp
AS $$
    SELECT regexp_replace(secret_ref, '^secret://.*$', 'secret://***')
$$;

CREATE OR REPLACE VIEW stress_core.feature_matrix_flat AS
SELECT
    fm.row_id,
    t.slug AS tenant_slug,
    fm.business_key,
    fm.state,
    fm.email,
    fm.numeric_val,
    fm.generated_total,
    fm.created_at,
    fm.updated_at,
    fm.jsonb_val ->> 'rowId' AS json_row_id
FROM stress_core.feature_matrix fm
JOIN stress_core.tenants t ON t.tenant_id = fm.tenant_id;

DROP RULE IF EXISTS feature_matrix_flat_noop_update ON stress_core.feature_matrix_flat;
CREATE RULE feature_matrix_flat_noop_update AS
    ON UPDATE TO stress_core.feature_matrix_flat
    DO INSTEAD NOTHING;

CREATE OR REPLACE VIEW stress_core.active_feature_matrix AS
SELECT
    row_id,
    tenant_id,
    business_key,
    state,
    updated_at
FROM stress_core.feature_matrix
WHERE state IN ('trial', 'active')
WITH LOCAL CHECK OPTION;

CREATE OR REPLACE VIEW stress_security.sensitive_accounts_masked
WITH (security_barrier = true, security_invoker = true) AS
SELECT
    account_id,
    tenant_id,
    owner_email,
    stress_security.mask_secret(secret_ref) AS masked_secret_ref,
    risk_score,
    created_at
FROM stress_security.sensitive_accounts;

CREATE MATERIALIZED VIEW IF NOT EXISTS stress_core.feature_matrix_summary AS
SELECT
    tenant_id,
    state,
    count(*) AS row_count,
    avg(numeric_val) AS avg_numeric_val,
    max(timestamptz_val) AS latest_seen_at
FROM stress_core.feature_matrix
GROUP BY tenant_id, state
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS feature_matrix_summary_key_idx
    ON stress_core.feature_matrix_summary (tenant_id, state);

REFRESH MATERIALIZED VIEW stress_core.feature_matrix_summary;

DROP EVENT TRIGGER IF EXISTS ql_stress_ddl_audit;
CREATE EVENT TRIGGER ql_stress_ddl_audit
    ON ddl_command_end
    EXECUTE FUNCTION stress_audit.capture_ddl_command();
ALTER EVENT TRIGGER ql_stress_ddl_audit DISABLE;

ALTER TABLE stress_core.feature_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE stress_core.feature_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE stress_security.sensitive_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stress_partitions.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stress_security.sensitive_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_matrix_read_tenant ON stress_core.feature_matrix;
CREATE POLICY feature_matrix_read_tenant ON stress_core.feature_matrix
    AS PERMISSIVE
    FOR SELECT
    TO ql_stress_readonly, ql_stress_app_user
    USING (
        pg_has_role(current_user, 'ql_stress_admin', 'member')
        OR tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
    );

DROP POLICY IF EXISTS feature_matrix_writer_update ON stress_core.feature_matrix;
CREATE POLICY feature_matrix_writer_update ON stress_core.feature_matrix
    AS RESTRICTIVE
    FOR UPDATE
    TO ql_stress_writer, ql_stress_app_user
    USING (state <> 'deleted')
    WITH CHECK (state <> 'deleted');

DROP POLICY IF EXISTS feature_matrix_writer_insert ON stress_core.feature_matrix;
CREATE POLICY feature_matrix_writer_insert ON stress_core.feature_matrix
    FOR INSERT
    TO ql_stress_writer
    WITH CHECK (state IN ('trial', 'active'));

DROP POLICY IF EXISTS feature_matrix_admin_delete ON stress_core.feature_matrix;
CREATE POLICY feature_matrix_admin_delete ON stress_core.feature_matrix
    AS RESTRICTIVE
    FOR DELETE
    TO ql_stress_admin
    USING (state = 'deleted');

DROP POLICY IF EXISTS feature_children_read_parent ON stress_core.feature_children;
CREATE POLICY feature_children_read_parent ON stress_core.feature_children
    FOR SELECT
    TO ql_stress_readonly, ql_stress_app_user
    USING (EXISTS (
        SELECT 1
        FROM stress_core.feature_matrix fm
        WHERE fm.row_id = feature_children.row_id
    ));

DROP POLICY IF EXISTS sensitive_accounts_admin_only ON stress_security.sensitive_accounts;
CREATE POLICY sensitive_accounts_admin_only ON stress_security.sensitive_accounts
    FOR ALL
    TO ql_stress_admin, ql_stress_auditor
    USING (
        pg_has_role(current_user, 'ql_stress_admin', 'member')
        OR current_user = ANY(allowed_roles)
    )
    WITH CHECK (pg_has_role(current_user, 'ql_stress_admin', 'member'));

DROP POLICY IF EXISTS event_log_tenant_read ON stress_partitions.event_log;
CREATE POLICY event_log_tenant_read ON stress_partitions.event_log
    FOR SELECT
    TO ql_stress_readonly, ql_stress_app_user
    USING (
        pg_has_role(current_user, 'ql_stress_admin', 'member')
        OR tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
    );

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'ql_stress_publication') THEN
        EXECUTE 'CREATE PUBLICATION ql_stress_publication
            FOR TABLE stress_core.feature_matrix, stress_partitions.event_log
            WITH (publish = ''insert, update, delete'', publish_via_partition_root = true)';
    END IF;
END $$;
ALTER PUBLICATION ql_stress_publication
    SET TABLE stress_core.feature_matrix, stress_partitions.event_log;
ALTER PUBLICATION ql_stress_publication
    SET (publish = 'insert, update, delete', publish_via_partition_root = true);

-- =============================================================================
-- Grants
-- =============================================================================

GRANT USAGE ON SCHEMA stress_core, stress_security, stress_partitions, stress_audit, stress_legacy, stress_external, "unicode schema 🚦" TO ql_stress_readonly, ql_stress_writer, ql_stress_auditor, ql_stress_app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA stress_core, stress_partitions, stress_legacy, stress_external, "unicode schema 🚦" TO ql_stress_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA stress_core, stress_partitions, stress_legacy TO ql_stress_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA stress_audit, stress_security, stress_external TO ql_stress_auditor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA stress_core, stress_audit, stress_legacy TO ql_stress_readonly, ql_stress_writer;
GRANT EXECUTE ON PROCEDURE stress_core.rotate_feature_states(integer) TO ql_stress_writer;
GRANT EXECUTE ON FUNCTION stress_core.weighted_feature_score(numeric, numeric) TO ql_stress_readonly, ql_stress_writer;
GRANT EXECUTE ON FUNCTION stress_security.mask_secret(text) TO ql_stress_auditor;
GRANT SELECT ON stress_security.sensitive_accounts_masked TO ql_stress_readonly, ql_stress_auditor;
GRANT USAGE ON TYPE stress_core.account_state, stress_core.geo_point, stress_core.metric_row, stress_core.money_range TO ql_stress_readonly, ql_stress_writer;
GRANT USAGE ON FOREIGN SERVER stress_file_server TO ql_stress_auditor;

ALTER DEFAULT PRIVILEGES IN SCHEMA stress_core
    GRANT SELECT ON TABLES TO ql_stress_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA stress_partitions
    GRANT SELECT ON TABLES TO ql_stress_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA stress_external
    GRANT SELECT ON TABLES TO ql_stress_auditor;
ALTER DEFAULT PRIVILEGES IN SCHEMA stress_core
    GRANT EXECUTE ON FUNCTIONS TO ql_stress_readonly;

COMMENT ON SCHEMA stress_core IS 'Querylane stress schema with wide tables, generated columns, domains, custom types, and heavy indexes.';
COMMENT ON SCHEMA stress_partitions IS 'Querylane stress schema with range, list, hash, and default partitions.';
COMMENT ON SCHEMA stress_legacy IS 'Querylane stress schema with classic inheritance trees.';
COMMENT ON SCHEMA stress_external IS 'Querylane stress schema with foreign table metadata.';
COMMENT ON TABLE stress_core.feature_matrix IS 'Wide stress table covering most PostgreSQL scalar, array, range, text search, network, geometry, generated, and identity metadata.';
COMMENT ON TABLE stress_partitions.event_log IS 'Range-partitioned append-heavy event stream.';
COMMENT ON TABLE stress_partitions.tenant_event_list IS 'List-partitioned tenant event stream with default partition.';
COMMENT ON TABLE stress_partitions.hash_bucket_items IS 'Hash-partitioned item stream.';
COMMENT ON TABLE stress_legacy.measurement_parent IS 'Legacy inheritance parent used to stress pg_inherits rendering.';
COMMENT ON FOREIGN TABLE stress_external.empty_csv_feed IS 'File FDW foreign table for foreign table metadata smoke tests.';
COMMENT ON TABLE stress_core.catalog_edge_objects IS 'Extension-backed seed table with citext, hstore, custom range, trigram, collation, and storage options.';
COMMENT ON MATERIALIZED VIEW stress_core.feature_matrix_summary IS 'Materialized view with refresh, unique index, and aggregate data.';
COMMENT ON VIEW stress_core.feature_matrix_flat IS 'Join view with rewrite rule for SQL definition and dependency display.';
COMMENT ON VIEW stress_core.active_feature_matrix IS 'Updatable view with local check option.';
COMMENT ON VIEW stress_security.sensitive_accounts_masked IS 'Security-barrier and security-invoker view for masked secret display.';
COMMENT ON COLUMN stress_core.feature_matrix.jsonb_val IS 'Nested JSONB payload used by GIN and UI JSON rendering.';
COMMENT ON FUNCTION stress_core.weighted_feature_score(numeric, numeric) IS 'Immutable SQL function for routine metadata smoke tests.';
COMMENT ON PROCEDURE stress_core.rotate_feature_states(integer) IS 'Procedure for routine metadata and grant smoke tests.';
COMMENT ON FUNCTION stress_security.mask_secret(text) IS 'Security-definer masking function for function metadata and privilege smoke tests.';

DO $$
DECLARE
    loid oid := 910000;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_largeobject_metadata WHERE oid = loid) THEN
        PERFORM lo_create(loid);
    END IF;
    COMMENT ON LARGE OBJECT 910000 IS 'Querylane stress large object metadata smoke test';
END $$;
GRANT SELECT ON LARGE OBJECT 910000 TO ql_stress_readonly;

ANALYZE stress_core.tenants;
ANALYZE stress_core.feature_matrix;
ANALYZE stress_core.feature_children;
ANALYZE stress_core.catalog_edge_objects;
ANALYZE stress_security.sensitive_accounts;
ANALYZE stress_partitions.event_log;
ANALYZE stress_partitions.tenant_event_list;
ANALYZE stress_partitions.hash_bucket_items;
