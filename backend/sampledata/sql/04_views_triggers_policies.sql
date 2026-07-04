-- Views, triggers, and RLS policies for integration tests.
-- Idempotent: all statements use IF NOT EXISTS or OR REPLACE.

-- =============================================================================
-- Views
-- =============================================================================

-- Standard view joining orders with customers.
CREATE OR REPLACE VIEW sales.customer_orders AS
SELECT
    o.id        AS order_id,
    o.status,
    o.total_amount,
    o.created_at AS order_date,
    c.id        AS customer_id,
    c.first_name,
    c.last_name,
    c.email
FROM sales.orders o
JOIN public.customers c ON c.id = o.customer_id;

-- Materialized view aggregating orders by day.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.order_summary AS
SELECT
    DATE(o.created_at)     AS order_date,
    COUNT(*)               AS order_count,
    SUM(o.total_amount)    AS total_revenue
FROM sales.orders o
GROUP BY DATE(o.created_at)
WITH DATA;

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION sales.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Drop-and-create because CREATE TRIGGER has no IF NOT EXISTS.
DROP TRIGGER IF EXISTS trg_orders_updated_at ON sales.orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON sales.orders
    FOR EACH ROW
    EXECUTE FUNCTION sales.update_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE sales.orders ENABLE ROW LEVEL SECURITY;

-- Drop-and-create because CREATE POLICY has no IF NOT EXISTS.
DROP POLICY IF EXISTS orders_select_policy ON sales.orders;
CREATE POLICY orders_select_policy ON sales.orders
    AS PERMISSIVE
    FOR SELECT
    USING (true);
