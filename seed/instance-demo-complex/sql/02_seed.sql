-- Querylane Demo Complex data.
-- Row volume targets a rich catalog while staying comfortably under 500 MB.

INSERT INTO core.tenant (slug, name, plan, region, settings)
SELECT
    'tenant-' || g,
    'Demo Tenant ' || g,
    (ARRAY['free', 'starter', 'growth', 'enterprise'])[1 + (g % 4)],
    (ARRAY['us-east-1', 'eu-west-1', 'ap-southeast-1'])[1 + (g % 3)],
    jsonb_build_object('featureFlags', jsonb_build_array('saved_views', 'audit_log', 'role_insights'))
FROM generate_series(1, 8) AS g;

INSERT INTO core.app_user (tenant_id, email, display_name, role_names, mfa_enabled, profile)
SELECT
    t.id,
    'user' || u || '@' || t.slug || '.example.com',
    'User ' || u || ' at ' || t.name,
    ARRAY[(ARRAY['admin', 'analyst', 'support'])[1 + (u % 3)]],
    u % 2 = 0,
    jsonb_build_object('timezone', 'UTC', 'department', (ARRAY['ops', 'sales', 'finance', 'support'])[1 + (u % 4)])
FROM core.tenant AS t
CROSS JOIN generate_series(1, 12) AS u;

INSERT INTO catalog.brand (tenant_id, name, metadata)
SELECT
    t.id,
    'Brand ' || b,
    jsonb_build_object('country', (ARRAY['US', 'DE', 'GB', 'JP'])[1 + (b % 4)], 'rating', round((3 + random() * 2)::numeric, 2))
FROM core.tenant AS t
CROSS JOIN generate_series(1, 12) AS b;

INSERT INTO catalog.category (tenant_id, parent_id, name, path_segments)
SELECT t.id, NULL, 'Category ' || c, ARRAY['Category ' || c]
FROM core.tenant AS t
CROSS JOIN generate_series(1, 10) AS c;

INSERT INTO catalog.product (tenant_id, brand_id, category_id, sku, name, lifecycle, attributes, search_terms, weight_grams)
SELECT
    t.id,
    b.id,
    c.id,
    'SKU-' || substring(t.id::text, 1, 4) || '-' || p,
    'Demo Product ' || p,
    (ARRAY['draft', 'active', 'discontinued', 'archived']::catalog.product_lifecycle[])[1 + (p % 4)],
    jsonb_build_object(
        'color', (ARRAY['red', 'blue', 'black', 'white', 'green'])[1 + (p % 5)],
        'material', (ARRAY['cotton', 'steel', 'wood', 'polymer'])[1 + (p % 4)],
        'dimensions', jsonb_build_object('w', p % 40 + 1, 'h', p % 30 + 1, 'd', p % 20 + 1),
        'hazmat', p % 19 = 0
    ),
    ARRAY['demo', 'querylane', 'product', 'tag-' || (p % 25)],
    50 + (p % 5000)
FROM core.tenant AS t
JOIN LATERAL (
    SELECT id FROM catalog.brand WHERE tenant_id = t.id ORDER BY id LIMIT 1
) AS b ON true
JOIN LATERAL (
    SELECT id FROM catalog.category WHERE tenant_id = t.id ORDER BY id LIMIT 1
) AS c ON true
CROSS JOIN generate_series(1, 250) AS p;

INSERT INTO catalog.product_variant (product_id, color, size, price, cost, barcode, active)
SELECT
    p.id,
    p.attributes->>'color',
    (ARRAY['XS', 'S', 'M', 'L', 'XL'])[1 + (v % 5)],
    round((10 + random() * 240)::numeric, 2),
    round((5 + random() * 120)::numeric, 2),
    'BC-' || p.id || '-' || v,
    v % 7 <> 0
FROM catalog.product AS p
CROSS JOIN generate_series(1, 3) AS v;

INSERT INTO crm.customer (tenant_id, account_number, status, email, first_name, last_name, birthday, tags, preferences)
SELECT
    t.id,
    'ACCT-' || substring(t.id::text, 1, 4) || '-' || c,
    (ARRAY['lead', 'active', 'paused', 'churned', 'fraud_review']::crm.customer_status[])[1 + (c % 5)],
    'customer' || c || '@' || t.slug || '.example.com',
    (ARRAY['Avery', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey'])[1 + (c % 6)],
    'Customer ' || c,
    date '1975-01-01' + (c % 12000),
    ARRAY['segment-' || (c % 8), 'cohort-' || (c % 12)],
    jsonb_build_object('newsletter', c % 2 = 0, 'sms', c % 5 = 0, 'preferredChannel', (ARRAY['email', 'sms', 'phone'])[1 + (c % 3)])
FROM core.tenant AS t
CROSS JOIN generate_series(1, 600) AS c;

INSERT INTO crm.address (customer_id, kind, country_code, city, postal_code, line1, line2, geo, is_default)
SELECT
    c.id,
    (ARRAY['billing', 'shipping'])[1 + (a % 2)],
    (ARRAY['US', 'GB', 'DE', 'PL', 'FR'])[1 + (c.id % 5)],
    'City ' || (c.id % 100),
    lpad((10000 + (c.id % 89999))::text, 5, '0'),
    (10 + c.id % 900) || ' Demo Street',
    CASE WHEN a % 3 = 0 THEN 'Suite ' || a ELSE NULL END,
    point((random() * 180) - 90, (random() * 360) - 180),
    a = 1
FROM crm.customer AS c
CROSS JOIN generate_series(1, 2) AS a;

INSERT INTO fulfillment.warehouse (tenant_id, code, name, address)
SELECT
    t.id,
    'WH-' || w,
    'Warehouse ' || w,
    jsonb_build_object('city', 'Hub ' || w, 'country', (ARRAY['US', 'DE', 'GB'])[1 + (w % 3)])
FROM core.tenant AS t
CROSS JOIN generate_series(1, 4) AS w;

INSERT INTO fulfillment.inventory_level (warehouse_id, variant_id, on_hand, reserved)
SELECT
    w.id,
    v.id,
    20 + (random() * 500)::int,
    (random() * 25)::int
FROM fulfillment.warehouse AS w
JOIN catalog.product AS p ON p.tenant_id = w.tenant_id
JOIN catalog.product_variant AS v ON v.product_id = p.id
WHERE v.id % 4 = w.id % 4;

INSERT INTO commerce.orders (tenant_id, customer_id, status, currency, subtotal, tax_amount, shipping_amount, discount_amount, placed_at, metadata)
SELECT
    c.tenant_id,
    c.id,
    (ARRAY['draft', 'placed', 'paid', 'packed', 'shipped', 'delivered', 'returned', 'cancelled']::commerce.order_status[])[1 + (o % 8)],
    (ARRAY['USD', 'EUR', 'GBP']::core.currency_code[])[1 + (o % 3)],
    round((30 + random() * 600)::numeric, 2),
    round((2 + random() * 60)::numeric, 2),
    round((0 + random() * 30)::numeric, 2),
    round((random() * 40)::numeric, 2),
    timestamp '2026-01-01' + ((o % 170) || ' days')::interval + ((o % 24) || ' hours')::interval,
    jsonb_build_object('channel', (ARRAY['web', 'mobile', 'marketplace', 'retail'])[1 + (o % 4)], 'campaign', 'campaign-' || (o % 20))
FROM crm.customer AS c
JOIN generate_series(1, 3) AS o ON true
WHERE c.id <= (SELECT min(id) + 4799 FROM crm.customer);

INSERT INTO commerce.order_item (order_id, variant_id, quantity, unit_price, discount_amount)
SELECT
    o.id,
    v.id,
    1 + (random() * 4)::int,
    v.price,
    round((random() * 10)::numeric, 2)
FROM commerce.orders AS o
JOIN LATERAL (
    SELECT pv.id, pv.price
    FROM catalog.product_variant AS pv
    JOIN catalog.product AS p ON p.id = pv.product_id AND p.tenant_id = o.tenant_id
    ORDER BY random()
    LIMIT 3
) AS v ON true;

INSERT INTO commerce.order_event (order_id, occurred_at, event_type, actor_user_id, payload)
SELECT
    o.id,
    o.placed_at + ((e * 3) || ' hours')::interval,
    (ARRAY['created', 'payment_checked', 'packed', 'shipped', 'customer_notified'])[1 + (e % 5)],
    u.id,
    jsonb_build_object('status', o.status, 'step', e, 'source', 'seed')
FROM commerce.orders AS o
JOIN LATERAL (
    SELECT id FROM core.app_user WHERE tenant_id = o.tenant_id ORDER BY random() LIMIT 1
) AS u ON true
CROSS JOIN generate_series(1, 5) AS e;

INSERT INTO billing.invoice (order_id, invoice_number, due_at, total_amount, amount_paid)
SELECT
    o.id,
    'INV-' || row_number() OVER (ORDER BY o.placed_at, o.id),
    o.placed_at + interval '30 days',
    o.total_amount,
    CASE WHEN o.status IN ('paid', 'packed', 'shipped', 'delivered') THEN o.total_amount ELSE 0 END
FROM commerce.orders AS o;

INSERT INTO billing.payment (invoice_id, status, provider, provider_reference, amount, paid_at, raw_response)
SELECT
    i.id,
    CASE WHEN i.amount_paid > 0 THEN 'captured'::billing.payment_status ELSE 'pending'::billing.payment_status END,
    (ARRAY['stripe', 'adyen', 'paypal'])[1 + (i.id % 3)],
    'pay_' || i.id,
    i.amount_paid,
    CASE WHEN i.amount_paid > 0 THEN i.issued_at + interval '2 hours' ELSE NULL END,
    jsonb_build_object('riskScore', round((random() * 100)::numeric, 2), 'network', 'visa')
FROM billing.invoice AS i;

INSERT INTO fulfillment.shipment (order_id, warehouse_id, carrier, tracking_number, shipped_at, delivered_at, metadata)
SELECT
    o.id,
    w.id,
    (ARRAY['ups', 'fedex', 'dhl', 'local'])[1 + (abs(hashtext(o.id::text)) % 4)],
    'TRK' || replace(o.id::text, '-', ''),
    o.placed_at + interval '1 day',
    o.placed_at + interval '4 days',
    jsonb_build_object('service', 'ground', 'insured', true)
FROM commerce.orders AS o
JOIN LATERAL (
    SELECT id FROM fulfillment.warehouse WHERE tenant_id = o.tenant_id ORDER BY random() LIMIT 1
) AS w ON true
WHERE o.status IN ('shipped', 'delivered');

INSERT INTO support.ticket (tenant_id, customer_id, priority, subject, status, custom_fields, opened_at, closed_at)
SELECT
    c.tenant_id,
    c.id,
    (ARRAY['low', 'normal', 'high', 'urgent']::support.ticket_priority[])[1 + (t % 4)],
    'Question about order history #' || t,
    (ARRAY['open', 'waiting_on_customer', 'resolved'])[1 + (t % 3)],
    jsonb_build_object('browser', 'Chrome', 'area', (ARRAY['billing', 'shipping', 'catalog'])[1 + (t % 3)]),
    now() - ((t % 90) || ' days')::interval,
    CASE WHEN t % 3 = 0 THEN now() - ((t % 30) || ' days')::interval ELSE NULL END
FROM crm.customer AS c
JOIN generate_series(1, 2) AS t ON true
WHERE c.id % 5 = 0;

INSERT INTO support.ticket_message (ticket_id, author_user_id, body, attachments)
SELECT
    tk.id,
    u.id,
    'Seeded support conversation message ' || m || ' for ticket ' || tk.id,
    CASE WHEN m % 3 = 0 THEN jsonb_build_array(jsonb_build_object('name', 'screenshot.png', 'size', 12345)) ELSE '[]'::jsonb END
FROM support.ticket AS tk
JOIN LATERAL (
    SELECT id FROM core.app_user WHERE tenant_id = tk.tenant_id ORDER BY random() LIMIT 1
) AS u ON true
CROSS JOIN generate_series(1, 3) AS m;

INSERT INTO analytics.daily_sales (day, tenant_id, order_count, gross_revenue, refund_amount)
SELECT
    d::date,
    t.id,
    count(o.id),
    coalesce(sum(o.total_amount), 0),
    coalesce(sum(CASE WHEN o.status = 'returned' THEN o.total_amount ELSE 0 END), 0)
FROM core.tenant AS t
CROSS JOIN generate_series(date '2026-01-01', date '2026-06-27', interval '1 day') AS d
LEFT JOIN commerce.orders AS o ON o.tenant_id = t.id AND o.placed_at::date = d::date
GROUP BY d::date, t.id;

INSERT INTO audit.change_log (table_name, record_pk, operation, changed_by, before_row, after_row)
SELECT
    'commerce.orders',
    jsonb_build_object('id', o.id),
    (ARRAY['insert', 'update']::text[])[1 + (row_number() OVER () % 2)],
    u.id,
    NULL,
    to_jsonb(o)
FROM commerce.orders AS o
JOIN LATERAL (
    SELECT id FROM core.app_user WHERE tenant_id = o.tenant_id ORDER BY random() LIMIT 1
) AS u ON true
LIMIT 20000;
