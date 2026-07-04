-- Demo Complex catalog features not covered by base data volume.
-- Adds views with documented purpose/source shape plus triggers and RLS policies.

CREATE OR REPLACE VIEW commerce.order_summary AS
SELECT
    o.id,
    o.tenant_id,
    c.full_name AS customer_name,
    o.status,
    o.total_amount,
    o.placed_at,
    count(oi.id) AS item_lines
FROM commerce.orders AS o
JOIN crm.customer AS c ON c.id = o.customer_id
LEFT JOIN commerce.order_item AS oi ON oi.order_id = o.id
GROUP BY o.id, c.full_name;

COMMENT ON VIEW commerce.order_summary IS
'Purpose: order overview. Sources: commerce.orders, crm.customer, commerce.order_item. Query shape: joins plus grouped item-line count.';

CREATE OR REPLACE VIEW catalog.product_inventory AS
SELECT
    p.id AS product_id,
    p.name,
    p.sku,
    coalesce(sum(il.available), 0) AS available_units
FROM catalog.product AS p
LEFT JOIN catalog.product_variant AS v ON v.product_id = p.id
LEFT JOIN fulfillment.inventory_level AS il ON il.variant_id = v.id
GROUP BY p.id;

COMMENT ON VIEW catalog.product_inventory IS
'Purpose: product inventory rollup. Sources: catalog.product, catalog.product_variant, fulfillment.inventory_level. Query shape: left joins plus sum of available units.';

CREATE OR REPLACE FUNCTION audit.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_touch_updated_at
BEFORE UPDATE ON fulfillment.inventory_level
FOR EACH ROW
EXECUTE FUNCTION audit.touch_updated_at();

COMMENT ON TRIGGER trg_inventory_touch_updated_at ON fulfillment.inventory_level IS
'Keeps fulfillment.inventory_level.updated_at current on updates.';

CREATE OR REPLACE FUNCTION audit.log_customer_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, pg_catalog
AS $$
BEGIN
    IF tg_op = 'DELETE' THEN
        INSERT INTO change_log(table_name, record_pk, operation, before_row, after_row)
        VALUES (tg_table_schema || '.' || tg_table_name, jsonb_build_object('id', OLD.id), lower(tg_op), to_jsonb(OLD), NULL);
        RETURN OLD;
    END IF;

    INSERT INTO change_log(table_name, record_pk, operation, before_row, after_row)
    VALUES (
        tg_table_schema || '.' || tg_table_name,
        jsonb_build_object('id', NEW.id),
        lower(tg_op),
        CASE WHEN tg_op = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW)
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_audit_log
AFTER INSERT OR UPDATE OR DELETE ON crm.customer
FOR EACH ROW
EXECUTE FUNCTION audit.log_customer_changes();

COMMENT ON TRIGGER trg_customer_audit_log ON crm.customer IS
'Writes row-level customer inserts, updates, and deletes into audit.change_log.';

ALTER TABLE commerce.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_orders
ON commerce.orders
FOR SELECT
USING (
    coalesce(nullif(current_setting('app.current_tenant_id', true), ''), tenant_id::text) = tenant_id::text
);

COMMENT ON POLICY tenant_select_orders ON commerce.orders IS
'Demo tenant filter. If app.current_tenant_id is unset, all rows remain visible for Querylane browsing.';

ALTER TABLE support.ticket ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_tickets
ON support.ticket
FOR SELECT
USING (
    coalesce(nullif(current_setting('app.current_tenant_id', true), ''), tenant_id::text) = tenant_id::text
);

COMMENT ON POLICY tenant_select_tickets ON support.ticket IS
'Demo tenant filter. If app.current_tenant_id is unset, all rows remain visible for Querylane browsing.';

GRANT CONNECT ON DATABASE demo_complex TO demo_readonly;
GRANT USAGE ON SCHEMA core, crm, catalog, commerce, fulfillment, billing, support, analytics, audit TO demo_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA core, crm, catalog, commerce, fulfillment, billing, support, analytics, audit TO demo_readonly;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, crm, catalog, commerce, fulfillment, billing, support, analytics, audit TO demo_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, crm, catalog, commerce, fulfillment, billing, support, analytics, audit
GRANT SELECT ON TABLES TO demo_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, crm, catalog, commerce, fulfillment, billing, support, analytics, audit
GRANT USAGE, SELECT ON SEQUENCES TO demo_readonly;

ANALYZE;
