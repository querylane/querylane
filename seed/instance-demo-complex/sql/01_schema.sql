-- Querylane Demo Complex schema.
-- Product-shaped PostgreSQL catalog fixture for exercising Data Explorer.
-- Re-running this script resets the demo schemas and role grants in demo_complex.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demo_readonly') THEN
        CREATE ROLE demo_readonly LOGIN PASSWORD 'democomplex_readonlypass';
    END IF;
END $$;

ALTER ROLE demo_readonly WITH LOGIN PASSWORD 'democomplex_readonlypass';

DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS analytics CASCADE;
DROP SCHEMA IF EXISTS support CASCADE;
DROP SCHEMA IF EXISTS billing CASCADE;
DROP SCHEMA IF EXISTS fulfillment CASCADE;
DROP SCHEMA IF EXISTS commerce CASCADE;
DROP SCHEMA IF EXISTS catalog CASCADE;
DROP SCHEMA IF EXISTS crm CASCADE;
DROP SCHEMA IF EXISTS core CASCADE;

CREATE SCHEMA core;
CREATE SCHEMA crm;
CREATE SCHEMA catalog;
CREATE SCHEMA commerce;
CREATE SCHEMA fulfillment;
CREATE SCHEMA billing;
CREATE SCHEMA support;
CREATE SCHEMA analytics;
CREATE SCHEMA audit;

COMMENT ON SCHEMA core IS 'Tenant and application-user foundation for the Demo Complex dataset.';
COMMENT ON SCHEMA crm IS 'Customer records, addresses, domains, arrays, JSONB, and customer audit trigger source.';
COMMENT ON SCHEMA catalog IS 'Product catalog with brands, categories, JSONB attributes, arrays, and inventory views.';
COMMENT ON SCHEMA commerce IS 'Order domain with generated amounts, range partitions, and RLS policy coverage.';
COMMENT ON SCHEMA fulfillment IS 'Warehouses, inventory levels, generated availability, and timestamp trigger coverage.';
COMMENT ON SCHEMA billing IS 'Invoices and payments with uniqueness and generated balance columns.';
COMMENT ON SCHEMA support IS 'Support tickets with RLS policy coverage.';
COMMENT ON SCHEMA analytics IS 'Daily rollups keyed by date and tenant.';
COMMENT ON SCHEMA audit IS 'Audit trail and trigger helper functions.';

CREATE DOMAIN core.email AS text CHECK (VALUE ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
CREATE DOMAIN core.currency_code AS char(3) CHECK (VALUE ~ '^[A-Z]{3}$');

CREATE TYPE crm.customer_status AS ENUM ('lead', 'active', 'paused', 'churned', 'fraud_review');
CREATE TYPE catalog.product_lifecycle AS ENUM ('draft', 'active', 'discontinued', 'archived');
CREATE TYPE commerce.order_status AS ENUM ('draft', 'placed', 'paid', 'packed', 'shipped', 'delivered', 'returned', 'cancelled');
CREATE TYPE billing.payment_status AS ENUM ('pending', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE support.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE core.tenant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    plan text NOT NULL CHECK (plan IN ('free', 'starter', 'growth', 'enterprise')),
    region text NOT NULL DEFAULT 'us-east-1',
    settings jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.app_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    email core.email NOT NULL,
    display_name text NOT NULL,
    role_names text[] NOT NULL DEFAULT '{}',
    mfa_enabled boolean NOT NULL DEFAULT false,
    profile jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE crm.customer (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    account_number text NOT NULL,
    status crm.customer_status NOT NULL DEFAULT 'active',
    email core.email NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    full_name text GENERATED ALWAYS AS (trim(first_name || ' ' || last_name)) STORED,
    birthday date,
    tags text[] NOT NULL DEFAULT '{}',
    preferences jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, account_number)
);

CREATE TABLE crm.address (
    id bigserial PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES crm.customer(id),
    kind text NOT NULL CHECK (kind IN ('billing', 'shipping')),
    country_code char(2) NOT NULL,
    city text NOT NULL,
    postal_code text NOT NULL,
    line1 text NOT NULL,
    line2 text,
    geo point,
    is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE catalog.brand (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    name text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, name)
);

CREATE TABLE catalog.category (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    parent_id bigint REFERENCES catalog.category(id),
    name text NOT NULL,
    path_segments text[] NOT NULL DEFAULT '{}',
    depth int GENERATED ALWAYS AS (coalesce(array_length(path_segments, 1), 0)) STORED
);

CREATE TABLE catalog.product (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    brand_id bigint REFERENCES catalog.brand(id),
    category_id bigint REFERENCES catalog.category(id),
    sku text NOT NULL,
    normalized_sku text GENERATED ALWAYS AS (upper(sku)) STORED,
    name text NOT NULL,
    lifecycle catalog.product_lifecycle NOT NULL DEFAULT 'active',
    attributes jsonb NOT NULL DEFAULT '{}',
    search_terms text[] NOT NULL DEFAULT '{}',
    weight_grams int CHECK (weight_grams > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku)
);

CREATE TABLE catalog.product_variant (
    id bigserial PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES catalog.product(id),
    color text,
    size text,
    price numeric(12, 2) NOT NULL CHECK (price >= 0),
    cost numeric(12, 2) NOT NULL CHECK (cost >= 0),
    barcode text UNIQUE,
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE commerce.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    customer_id bigint NOT NULL REFERENCES crm.customer(id),
    status commerce.order_status NOT NULL DEFAULT 'placed',
    currency core.currency_code NOT NULL DEFAULT 'USD',
    subtotal numeric(12, 2) NOT NULL DEFAULT 0,
    tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
    shipping_amount numeric(12, 2) NOT NULL DEFAULT 0,
    discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
    total_amount numeric(12, 2) GENERATED ALWAYS AS (subtotal + tax_amount + shipping_amount - discount_amount) STORED,
    placed_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE commerce.order_item (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES commerce.orders(id),
    variant_id bigint NOT NULL REFERENCES catalog.product_variant(id),
    quantity int NOT NULL CHECK (quantity > 0),
    unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
    line_total numeric(12, 2) GENERATED ALWAYS AS ((quantity * unit_price) - discount_amount) STORED,
    returned_at timestamptz
);

CREATE TABLE commerce.order_event (
    event_id bigserial,
    order_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    event_type text NOT NULL,
    actor_user_id uuid REFERENCES core.app_user(id),
    payload jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE commerce.order_event_2026_h1 PARTITION OF commerce.order_event
FOR VALUES FROM ('2026-01-01') TO ('2026-07-01');

CREATE TABLE commerce.order_event_2026_h2 PARTITION OF commerce.order_event
FOR VALUES FROM ('2026-07-01') TO ('2027-01-01');

CREATE TABLE commerce.order_event_default PARTITION OF commerce.order_event DEFAULT;

CREATE TABLE fulfillment.warehouse (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    code text NOT NULL,
    name text NOT NULL,
    address jsonb NOT NULL,
    UNIQUE (tenant_id, code)
);

CREATE TABLE fulfillment.inventory_level (
    warehouse_id bigint NOT NULL REFERENCES fulfillment.warehouse(id),
    variant_id bigint NOT NULL REFERENCES catalog.product_variant(id),
    on_hand int NOT NULL DEFAULT 0,
    reserved int NOT NULL DEFAULT 0,
    available int GENERATED ALWAYS AS (on_hand - reserved) STORED,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (warehouse_id, variant_id)
);

CREATE TABLE fulfillment.shipment (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES commerce.orders(id),
    warehouse_id bigint NOT NULL REFERENCES fulfillment.warehouse(id),
    carrier text NOT NULL,
    tracking_number text,
    shipped_at timestamptz,
    delivered_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE billing.invoice (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES commerce.orders(id),
    invoice_number text NOT NULL UNIQUE,
    issued_at timestamptz NOT NULL DEFAULT now(),
    due_at timestamptz NOT NULL,
    total_amount numeric(12, 2) NOT NULL,
    amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
    balance_due numeric(12, 2) GENERATED ALWAYS AS (greatest(total_amount - amount_paid, 0)) STORED
);

CREATE TABLE billing.payment (
    id bigserial PRIMARY KEY,
    invoice_id bigint NOT NULL REFERENCES billing.invoice(id),
    status billing.payment_status NOT NULL DEFAULT 'pending',
    provider text NOT NULL,
    provider_reference text,
    amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
    paid_at timestamptz,
    raw_response jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE support.ticket (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    customer_id bigint REFERENCES crm.customer(id),
    priority support.ticket_priority NOT NULL DEFAULT 'normal',
    subject text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    custom_fields jsonb NOT NULL DEFAULT '{}',
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz
);

CREATE TABLE support.ticket_message (
    id bigserial PRIMARY KEY,
    ticket_id bigint NOT NULL REFERENCES support.ticket(id),
    author_user_id uuid REFERENCES core.app_user(id),
    body text NOT NULL,
    attachments jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics.daily_sales (
    day date NOT NULL,
    tenant_id uuid NOT NULL REFERENCES core.tenant(id),
    order_count int NOT NULL,
    gross_revenue numeric(14, 2) NOT NULL,
    refund_amount numeric(14, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (day, tenant_id)
);

CREATE TABLE audit.change_log (
    id bigserial PRIMARY KEY,
    table_name text NOT NULL,
    record_pk jsonb NOT NULL,
    operation text NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    changed_by uuid,
    changed_at timestamptz NOT NULL DEFAULT now(),
    before_row jsonb,
    after_row jsonb
);

CREATE INDEX idx_customer_tags ON crm.customer USING gin (tags);
CREATE INDEX idx_customer_preferences ON crm.customer USING gin (preferences);
CREATE INDEX idx_product_attributes ON catalog.product USING gin (attributes);
CREATE INDEX idx_product_search_terms ON catalog.product USING gin (search_terms);
CREATE INDEX idx_orders_customer_placed ON commerce.orders (customer_id, placed_at DESC);
CREATE INDEX idx_orders_metadata ON commerce.orders USING gin (metadata);
CREATE INDEX idx_order_event_time_brin ON commerce.order_event USING brin (occurred_at);
CREATE INDEX idx_audit_record_pk ON audit.change_log USING gin (record_pk);
CREATE INDEX idx_open_tickets ON support.ticket (tenant_id, priority, opened_at) WHERE closed_at IS NULL;
