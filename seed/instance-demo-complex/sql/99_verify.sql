-- Smoke assertions for Demo Complex. Docker init fails if the reusable fixture drifts.

DO $$
DECLARE
    schema_count integer;
    table_count integer;
    view_count integer;
    policy_count integer;
    trigger_count integer;
    partition_count integer;
    database_size bigint;
    readonly_ready boolean;
BEGIN
    SELECT count(*) INTO schema_count
    FROM information_schema.schemata
    WHERE schema_name IN ('core', 'crm', 'catalog', 'commerce', 'fulfillment', 'billing', 'support', 'analytics', 'audit');

    IF schema_count <> 9 THEN
        RAISE EXCEPTION 'expected 9 demo schemas, got %', schema_count;
    END IF;

    SELECT count(*) INTO table_count
    FROM pg_tables
    WHERE schemaname IN ('core', 'crm', 'catalog', 'commerce', 'fulfillment', 'billing', 'support', 'analytics', 'audit');

    IF table_count <> 23 THEN
        RAISE EXCEPTION 'expected 23 demo tables, got %', table_count;
    END IF;

    SELECT count(*) INTO view_count
    FROM information_schema.views
    WHERE table_schema IN ('commerce', 'catalog')
      AND table_name IN ('order_summary', 'product_inventory');

    IF view_count <> 2 THEN
        RAISE EXCEPTION 'expected 2 documented demo views, got %', view_count;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname IN ('commerce', 'support')
      AND policyname IN ('tenant_select_orders', 'tenant_select_tickets');

    IF policy_count <> 2 THEN
        RAISE EXCEPTION 'expected 2 RLS policies, got %', policy_count;
    END IF;

    SELECT count(DISTINCT trigger_name) INTO trigger_count
    FROM information_schema.triggers
    WHERE event_object_schema IN ('crm', 'fulfillment')
      AND trigger_name IN ('trg_customer_audit_log', 'trg_inventory_touch_updated_at');

    IF trigger_count <> 2 THEN
        RAISE EXCEPTION 'expected 2 triggers, got %', trigger_count;
    END IF;

    SELECT count(*) INTO partition_count
    FROM pg_inherits
    WHERE inhparent = 'commerce.order_event'::regclass;

    IF partition_count <> 3 THEN
        RAISE EXCEPTION 'expected 3 commerce.order_event partitions, got %', partition_count;
    END IF;

    SELECT pg_database_size(current_database()) INTO database_size;

    IF database_size >= 500 * 1024 * 1024 THEN
        RAISE EXCEPTION 'demo_complex must stay below 500 MB; got % bytes', database_size;
    END IF;

    SELECT
        has_database_privilege('demo_readonly', current_database(), 'CONNECT')
        AND has_schema_privilege('demo_readonly', 'commerce', 'USAGE')
        AND has_table_privilege('demo_readonly', 'commerce.orders', 'SELECT')
        AND has_table_privilege('demo_readonly', 'catalog.product_inventory', 'SELECT')
    INTO readonly_ready;

    IF NOT readonly_ready THEN
        RAISE EXCEPTION 'demo_readonly must be able to browse Demo Complex tables and views';
    END IF;
END $$;
