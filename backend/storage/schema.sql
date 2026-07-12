--
-- PostgreSQL database dump
--

\restrict 5rZUbcEOWqLDlOb2VEV9R5BULZfldhSlSt1XjM0iegiUwzIdue9wXin9F8JaaU4

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: connection_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connection_state AS ENUM (
    'CONNECTION_STATE_UNSPECIFIED',
    'CONNECTION_STATE_VALIDATING',
    'CONNECTION_STATE_ACTIVE',
    'CONNECTION_STATE_ERROR'
);


--
-- Name: database_engine; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.database_engine AS ENUM (
    'DATABASE_ENGINE_UNSPECIFIED',
    'DATABASE_ENGINE_POSTGRESQL'
);


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: catalog_column; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_column (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    name text NOT NULL,
    ordinal_position integer DEFAULT 0 NOT NULL,
    data_type integer DEFAULT 0 NOT NULL,
    raw_type text DEFAULT ''::text NOT NULL,
    is_nullable boolean DEFAULT false NOT NULL,
    is_primary_key boolean DEFAULT false NOT NULL,
    is_unique boolean DEFAULT false NOT NULL,
    default_value text,
    character_maximum_length integer,
    comment text DEFAULT ''::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    is_generated boolean DEFAULT false NOT NULL,
    generation_expression text DEFAULT ''::text NOT NULL,
    is_identity boolean DEFAULT false NOT NULL,
    identity_generation integer DEFAULT 0 NOT NULL
);


--
-- Name: catalog_database; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_database (
    instance_id text NOT NULL,
    name text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    character_set text DEFAULT ''::text NOT NULL,
    "collation" text DEFAULT ''::text NOT NULL,
    owner text DEFAULT ''::text NOT NULL,
    is_system_database boolean DEFAULT false NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_schema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_schema (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    name text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    owner text DEFAULT ''::text NOT NULL,
    is_system_schema boolean DEFAULT false NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_server_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_server_info (
    instance_id text NOT NULL,
    version text DEFAULT ''::text NOT NULL,
    version_num integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    is_in_recovery boolean DEFAULT false NOT NULL,
    max_connections integer DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_sync_state (
    scope text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_table (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    name text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    table_type text DEFAULT 'BASE_TABLE'::text NOT NULL,
    is_system_table boolean DEFAULT false NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    owner text DEFAULT ''::text NOT NULL,
    row_count bigint DEFAULT 0 NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_table_constraint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_table_constraint (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    name text NOT NULL,
    type integer DEFAULT 0 NOT NULL,
    column_names text[] DEFAULT '{}'::text[] NOT NULL,
    referenced_schema_name text DEFAULT ''::text NOT NULL,
    referenced_table_name text DEFAULT ''::text NOT NULL,
    referenced_column_names text[] DEFAULT '{}'::text[] NOT NULL,
    on_update integer DEFAULT 0 NOT NULL,
    on_delete integer DEFAULT 0 NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_table_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_table_index (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    name text NOT NULL,
    method text DEFAULT ''::text NOT NULL,
    is_unique boolean DEFAULT false NOT NULL,
    key_columns text[] DEFAULT '{}'::text[] NOT NULL,
    included_columns text[] DEFAULT '{}'::text[] NOT NULL,
    predicate text DEFAULT ''::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    key_parts text[] DEFAULT '{}'::text[] NOT NULL,
    is_valid boolean DEFAULT true NOT NULL,
    has_expression boolean DEFAULT false NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    scan_count bigint DEFAULT 0 NOT NULL,
    tuples_read bigint DEFAULT 0 NOT NULL,
    tuples_fetched bigint DEFAULT 0 NOT NULL,
    blocks_hit bigint DEFAULT 0 NOT NULL,
    blocks_read bigint DEFAULT 0 NOT NULL,
    has_usage_stats boolean DEFAULT false NOT NULL
);


--
-- Name: catalog_table_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_table_policy (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    name text NOT NULL,
    mode integer DEFAULT 0 NOT NULL,
    command integer DEFAULT 0 NOT NULL,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    using_expression text DEFAULT ''::text NOT NULL,
    check_expression text DEFAULT ''::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_table_trigger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_table_trigger (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    name text NOT NULL,
    timing text DEFAULT ''::text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    function_name text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_view; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_view (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    schema_name text NOT NULL,
    name text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    view_type integer DEFAULT 0 NOT NULL,
    owner text DEFAULT ''::text NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    is_system_view boolean DEFAULT false NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    row_count bigint DEFAULT 0 NOT NULL,
    is_populated boolean DEFAULT false NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: database_size_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_size_sample (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    size_bytes bigint NOT NULL
);


--
-- Name: database_vacuum_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_vacuum_sample (
    instance_id text NOT NULL,
    database_name text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    live_tuples bigint NOT NULL,
    dead_tuples bigint NOT NULL,
    vacuum_count bigint NOT NULL,
    autovacuum_count bigint NOT NULL,
    stats_reset timestamp with time zone
);


--
-- Name: goose_db_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goose_db_version (
    id integer NOT NULL,
    version_id bigint NOT NULL,
    is_applied boolean NOT NULL,
    tstamp timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goose_db_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.goose_db_version ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.goose_db_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance (
    id text NOT NULL,
    display_name text NOT NULL,
    labels jsonb DEFAULT '{}'::jsonb NOT NULL,
    engine public.database_engine NOT NULL,
    engine_version text,
    config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: instance_cache_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_cache_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    blocks_hit bigint NOT NULL,
    blocks_read bigint NOT NULL,
    stats_reset timestamp with time zone,
    xact_commit bigint DEFAULT 0 NOT NULL,
    xact_rollback bigint DEFAULT 0 NOT NULL,
    tup_returned bigint DEFAULT 0 NOT NULL,
    tup_fetched bigint DEFAULT 0 NOT NULL,
    tup_inserted bigint DEFAULT 0 NOT NULL,
    tup_updated bigint DEFAULT 0 NOT NULL,
    tup_deleted bigint DEFAULT 0 NOT NULL,
    conflicts bigint DEFAULT 0 NOT NULL,
    deadlocks bigint DEFAULT 0 NOT NULL,
    temp_files bigint DEFAULT 0 NOT NULL,
    temp_bytes bigint DEFAULT 0 NOT NULL,
    sessions bigint DEFAULT 0 NOT NULL,
    sessions_abandoned bigint DEFAULT 0 NOT NULL,
    sessions_fatal bigint DEFAULT 0 NOT NULL,
    sessions_killed bigint DEFAULT 0 NOT NULL
);


--
-- Name: instance_connection_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_connection_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    active bigint NOT NULL,
    idle bigint NOT NULL,
    total bigint NOT NULL,
    max_conn bigint NOT NULL
);


--
-- Name: instance_io_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_io_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    reads bigint NOT NULL,
    read_bytes bigint NOT NULL,
    writes bigint NOT NULL,
    write_bytes bigint NOT NULL,
    extends bigint NOT NULL,
    extend_bytes bigint NOT NULL,
    fsyncs bigint NOT NULL,
    stats_reset timestamp with time zone
);


--
-- Name: instance_runtime_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_runtime_state (
    instance_id text NOT NULL,
    connection_state public.connection_state DEFAULT 'CONNECTION_STATE_UNSPECIFIED'::public.connection_state NOT NULL,
    connection_error text,
    connection_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instance_storage_sample; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instance_storage_sample (
    instance_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    total_size_bytes bigint NOT NULL
);


--
-- Name: replica; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replica (
    id text NOT NULL,
    hostname text NOT NULL,
    pid bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: runner_execution_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.runner_execution_state (
    runner_name text NOT NULL,
    target_name text NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_started_at timestamp with time zone,
    last_finished_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: catalog_column catalog_column_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_column
    ADD CONSTRAINT catalog_column_pkey PRIMARY KEY (instance_id, database_name, schema_name, table_name, name);


--
-- Name: catalog_database catalog_database_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_database
    ADD CONSTRAINT catalog_database_pkey PRIMARY KEY (instance_id, name);


--
-- Name: catalog_schema catalog_schema_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_schema
    ADD CONSTRAINT catalog_schema_pkey PRIMARY KEY (instance_id, database_name, name);


--
-- Name: catalog_server_info catalog_server_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_server_info
    ADD CONSTRAINT catalog_server_info_pkey PRIMARY KEY (instance_id);


--
-- Name: catalog_sync_state catalog_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_sync_state
    ADD CONSTRAINT catalog_sync_state_pkey PRIMARY KEY (scope);


--
-- Name: catalog_table_constraint catalog_table_constraint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_table_constraint
    ADD CONSTRAINT catalog_table_constraint_pkey PRIMARY KEY (instance_id, database_name, schema_name, table_name, name);


--
-- Name: catalog_table_index catalog_table_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_table_index
    ADD CONSTRAINT catalog_table_index_pkey PRIMARY KEY (instance_id, database_name, schema_name, table_name, name);


--
-- Name: catalog_table catalog_table_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_table
    ADD CONSTRAINT catalog_table_pkey PRIMARY KEY (instance_id, database_name, schema_name, name);


--
-- Name: catalog_table_policy catalog_table_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_table_policy
    ADD CONSTRAINT catalog_table_policy_pkey PRIMARY KEY (instance_id, database_name, schema_name, table_name, name);


--
-- Name: catalog_table_trigger catalog_table_trigger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_table_trigger
    ADD CONSTRAINT catalog_table_trigger_pkey PRIMARY KEY (instance_id, database_name, schema_name, table_name, name);


--
-- Name: catalog_view catalog_view_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_view
    ADD CONSTRAINT catalog_view_pkey PRIMARY KEY (instance_id, database_name, schema_name, name);


--
-- Name: database_size_sample database_size_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_size_sample
    ADD CONSTRAINT database_size_sample_pkey PRIMARY KEY (instance_id, database_name, observed_at);


--
-- Name: database_vacuum_sample database_vacuum_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_vacuum_sample
    ADD CONSTRAINT database_vacuum_sample_pkey PRIMARY KEY (instance_id, database_name, observed_at);


--
-- Name: goose_db_version goose_db_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goose_db_version
    ADD CONSTRAINT goose_db_version_pkey PRIMARY KEY (id);


--
-- Name: instance_cache_sample instance_cache_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_cache_sample
    ADD CONSTRAINT instance_cache_sample_pkey PRIMARY KEY (instance_id, observed_at);


--
-- Name: instance_connection_sample instance_connection_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_connection_sample
    ADD CONSTRAINT instance_connection_sample_pkey PRIMARY KEY (instance_id, observed_at);


--
-- Name: instance_io_sample instance_io_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_io_sample
    ADD CONSTRAINT instance_io_sample_pkey PRIMARY KEY (instance_id, observed_at);


--
-- Name: instance instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance
    ADD CONSTRAINT instance_pkey PRIMARY KEY (id);


--
-- Name: instance_runtime_state instance_runtime_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_runtime_state
    ADD CONSTRAINT instance_runtime_state_pkey PRIMARY KEY (instance_id);


--
-- Name: instance_storage_sample instance_storage_sample_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instance_storage_sample
    ADD CONSTRAINT instance_storage_sample_pkey PRIMARY KEY (instance_id, observed_at);


--
-- Name: replica replica_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replica
    ADD CONSTRAINT replica_pkey PRIMARY KEY (id);


--
-- Name: runner_execution_state runner_execution_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.runner_execution_state
    ADD CONSTRAINT runner_execution_state_pkey PRIMARY KEY (runner_name, target_name);


--
-- Name: idx_catalog_column_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_column_name_trgm ON public.catalog_column USING gin (name public.gin_trgm_ops);


--
-- Name: idx_catalog_database_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_database_name_trgm ON public.catalog_database USING gin (name public.gin_trgm_ops);


--
-- Name: idx_catalog_schema_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_schema_name_trgm ON public.catalog_schema USING gin (name public.gin_trgm_ops);


--
-- Name: idx_catalog_table_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_table_name_trgm ON public.catalog_table USING gin (name public.gin_trgm_ops);


--
-- Name: idx_catalog_view_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_view_name_trgm ON public.catalog_view USING gin (name public.gin_trgm_ops);


--
-- Name: idx_database_size_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_size_sample_observed_at ON public.database_size_sample USING btree (observed_at);


--
-- Name: idx_database_vacuum_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_database_vacuum_sample_observed_at ON public.database_vacuum_sample USING btree (observed_at);


--
-- Name: idx_instance_cache_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_cache_sample_observed_at ON public.instance_cache_sample USING btree (observed_at);


--
-- Name: idx_instance_connection_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_connection_sample_observed_at ON public.instance_connection_sample USING btree (observed_at);


--
-- Name: idx_instance_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_deleted_at ON public.instance USING btree (deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_instance_io_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_io_sample_observed_at ON public.instance_io_sample USING btree (observed_at);


--
-- Name: idx_instance_runtime_state_connection_checked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_runtime_state_connection_checked_at ON public.instance_runtime_state USING btree (connection_checked_at);


--
-- Name: idx_instance_storage_sample_observed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instance_storage_sample_observed_at ON public.instance_storage_sample USING btree (observed_at);


--
-- Name: idx_runner_execution_state_lease_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_runner_execution_state_lease_expires_at ON public.runner_execution_state USING btree (lease_expires_at);


--
-- Name: catalog_sync_state update_catalog_sync_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_catalog_sync_state_updated_at BEFORE UPDATE ON public.catalog_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instance_runtime_state update_instance_runtime_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instance_runtime_state_updated_at BEFORE UPDATE ON public.instance_runtime_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instance update_instance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instance_updated_at BEFORE UPDATE ON public.instance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: runner_execution_state update_runner_execution_state_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_runner_execution_state_updated_at BEFORE UPDATE ON public.runner_execution_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- PostgreSQL database dump complete
--

\unrestrict 5rZUbcEOWqLDlOb2VEV9R5BULZfldhSlSt1XjM0iegiUwzIdue9wXin9F8JaaU4

