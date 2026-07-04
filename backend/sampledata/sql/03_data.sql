-- Sample rows for demo and integration tests.
-- Idempotent: uses ON CONFLICT DO NOTHING where applicable.

-- =============================================================================
-- public.customers (~25 rows)
-- =============================================================================

INSERT INTO public.customers (id, first_name, last_name, email, phone, is_active) VALUES
    (1,  'Alice',   'Johnson',  'alice.johnson@example.com',   '+1-555-0101', true),
    (2,  'Bob',     'Smith',    'bob.smith@example.com',       '+1-555-0102', true),
    (3,  'Carol',   'Williams', 'carol.williams@example.com',  '+1-555-0103', true),
    (4,  'David',   'Brown',    'david.brown@example.com',     '+1-555-0104', true),
    (5,  'Eve',     'Davis',    'eve.davis@example.com',       '+1-555-0105', false),
    (6,  'Frank',   'Miller',   'frank.miller@example.com',    '+1-555-0106', true),
    (7,  'Grace',   'Wilson',   'grace.wilson@example.com',    '+1-555-0107', true),
    (8,  'Henry',   'Moore',    'henry.moore@example.com',     '+1-555-0108', true),
    (9,  'Ivy',     'Taylor',   'ivy.taylor@example.com',      '+1-555-0109', false),
    (10, 'Jack',    'Anderson', 'jack.anderson@example.com',   '+1-555-0110', true),
    (11, 'Karen',   'Thomas',   'karen.thomas@example.com',    '+1-555-0111', true),
    (12, 'Leo',     'Jackson',  'leo.jackson@example.com',     '+1-555-0112', true),
    (13, 'Mia',     'White',    'mia.white@example.com',       '+1-555-0113', true),
    (14, 'Nathan',  'Harris',   'nathan.harris@example.com',   '+1-555-0114', true),
    (15, 'Olivia',  'Martin',   'olivia.martin@example.com',   '+1-555-0115', false),
    (16, 'Paul',    'Garcia',   'paul.garcia@example.com',     '+1-555-0116', true),
    (17, 'Quinn',   'Martinez', 'quinn.martinez@example.com',  '+1-555-0117', true),
    (18, 'Rachel',  'Robinson', 'rachel.robinson@example.com', '+1-555-0118', true),
    (19, 'Sam',     'Clark',    'sam.clark@example.com',       '+1-555-0119', true),
    (20, 'Tina',    'Lewis',    'tina.lewis@example.com',      '+1-555-0120', true),
    (21, 'Uma',     'Lee',      'uma.lee@example.com',         '+1-555-0121', true),
    (22, 'Victor',  'Walker',   'victor.walker@example.com',   '+1-555-0122', true),
    (23, 'Wendy',   'Hall',     'wendy.hall@example.com',      '+1-555-0123', true),
    (24, 'Xavier',  'Allen',    'xavier.allen@example.com',    '+1-555-0124', false),
    (25, 'Yara',    'Young',    'yara.young@example.com',      '+1-555-0125', true)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence to avoid conflicts on future inserts.
SELECT setval('public.customers_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.customers));

-- =============================================================================
-- public.products (~20 rows)
-- =============================================================================

INSERT INTO public.products (id, name, description, price, tags, metadata, in_stock) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Laptop Pro 15',       'High-performance laptop',            1299.99, ARRAY['electronics','computers'],   '{"brand":"TechCo","weight_kg":1.8}',   true),
    ('a0000000-0000-0000-0000-000000000002', 'Wireless Mouse',      'Ergonomic wireless mouse',           29.99,   ARRAY['electronics','accessories'],  '{"brand":"ClickWell","dpi":1600}',     true),
    ('a0000000-0000-0000-0000-000000000003', 'Mechanical Keyboard', 'Cherry MX switches',                 89.99,   ARRAY['electronics','accessories'],  '{"brand":"KeyMaster","switches":"red"}', true),
    ('a0000000-0000-0000-0000-000000000004', 'USB-C Hub',           '7-in-1 USB-C dock',                  49.99,   ARRAY['electronics','accessories'],  '{"brand":"ConnectAll","ports":7}',     true),
    ('a0000000-0000-0000-0000-000000000005', '4K Monitor',          '27-inch 4K IPS display',             449.99,  ARRAY['electronics','displays'],     '{"brand":"ViewPro","size_inch":27}',   true),
    ('a0000000-0000-0000-0000-000000000006', 'Standing Desk',       'Electric height-adjustable desk',    599.99,  ARRAY['furniture','office'],          '{"brand":"ErgoDesk","max_height_cm":120}', true),
    ('a0000000-0000-0000-0000-000000000007', 'Office Chair',        'Ergonomic mesh office chair',        349.99,  ARRAY['furniture','office'],          '{"brand":"SitRight","max_weight_kg":130}', true),
    ('a0000000-0000-0000-0000-000000000008', 'Webcam HD',           '1080p webcam with mic',              69.99,   ARRAY['electronics','video'],         '{"brand":"ClearView","resolution":"1080p"}', true),
    ('a0000000-0000-0000-0000-000000000009', 'Desk Lamp',           'LED desk lamp with dimmer',          39.99,   ARRAY['office','lighting'],           '{"brand":"LightUp","lumens":800}',     true),
    ('a0000000-0000-0000-0000-000000000010', 'Notebook Pack',       'Pack of 3 ruled notebooks',          12.99,   ARRAY['office','stationery'],         '{"brand":"WriteWell","pages":200}',    true),
    ('a0000000-0000-0000-0000-000000000011', 'Wireless Earbuds',    'Noise-cancelling earbuds',           159.99,  ARRAY['electronics','audio'],         '{"brand":"SoundWave","battery_hrs":8}', true),
    ('a0000000-0000-0000-0000-000000000012', 'Portable SSD',        '1TB portable SSD drive',             89.99,   ARRAY['electronics','storage'],       '{"brand":"SpeedDisk","capacity_gb":1000}', true),
    ('a0000000-0000-0000-0000-000000000013', 'Mouse Pad XL',        'Extended gaming mouse pad',          19.99,   ARRAY['accessories','gaming'],        '{"brand":"PadPro","size":"900x400mm"}', true),
    ('a0000000-0000-0000-0000-000000000014', 'Cable Management Kit', 'Desk cable organizer set',          14.99,   ARRAY['office','accessories'],        '{"brand":"TidyDesk","pieces":12}',     true),
    ('a0000000-0000-0000-0000-000000000015', 'Monitor Arm',         'Single monitor desk mount',          79.99,   ARRAY['furniture','displays'],        '{"brand":"MountIt","max_weight_kg":9}', true),
    ('a0000000-0000-0000-0000-000000000016', 'Laptop Stand',        'Adjustable aluminum stand',          44.99,   ARRAY['accessories','office'],        '{"brand":"LiftUp","material":"aluminum"}', true),
    ('a0000000-0000-0000-0000-000000000017', 'Surge Protector',     '8-outlet surge protector',           24.99,   ARRAY['electronics','power'],         '{"brand":"SafePower","outlets":8}',    true),
    ('a0000000-0000-0000-0000-000000000018', 'Whiteboard',          '36x24 inch magnetic whiteboard',     34.99,   ARRAY['office','collaboration'],      '{"brand":"BoardWorks","size":"36x24in"}', false),
    ('a0000000-0000-0000-0000-000000000019', 'Ergonomic Wrist Rest', 'Gel wrist rest for keyboard',       16.99,   ARRAY['accessories','ergonomic'],     '{"brand":"ComfortZone","material":"gel"}', true),
    ('a0000000-0000-0000-0000-000000000020', 'Privacy Screen',      '15.6-inch laptop privacy filter',   29.99,   ARRAY['accessories','security'],      '{"brand":"SecureView","size_inch":15.6}', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- sales.orders (~30 rows)
-- =============================================================================

INSERT INTO sales.orders (id, customer_id, status, total_amount, notes) VALUES
    (1,  1,  'delivered',  1329.98, NULL),
    (2,  2,  'delivered',  139.98,  'Gift wrap requested'),
    (3,  3,  'shipped',    599.99,  NULL),
    (4,  4,  'confirmed',  89.99,   'Express shipping'),
    (5,  5,  'cancelled',  449.99,  'Customer changed mind'),
    (6,  1,  'delivered',  69.99,   NULL),
    (7,  6,  'shipped',    349.99,  NULL),
    (8,  7,  'pending',    44.99,   NULL),
    (9,  8,  'delivered',  159.99,  NULL),
    (10, 9,  'cancelled',  29.99,   'Wrong item ordered'),
    (11, 10, 'delivered',  89.99,   NULL),
    (12, 11, 'shipped',    1299.99, 'Handle with care'),
    (13, 12, 'confirmed',  79.99,   NULL),
    (14, 13, 'delivered',  54.98,   NULL),
    (15, 14, 'pending',    249.98,  NULL),
    (16, 15, 'delivered',  599.99,  NULL),
    (17, 16, 'shipped',    39.99,   NULL),
    (18, 17, 'delivered',  24.99,   NULL),
    (19, 18, 'confirmed',  449.99,  NULL),
    (20, 19, 'delivered',  12.99,   NULL),
    (21, 20, 'shipped',    189.98,  'Combine with order 22'),
    (22, 20, 'shipped',    34.99,   NULL),
    (23, 21, 'delivered',  119.98,  NULL),
    (24, 22, 'pending',    16.99,   NULL),
    (25, 23, 'delivered',  29.99,   NULL),
    (26, 24, 'cancelled',  1299.99, 'Payment issue'),
    (27, 25, 'confirmed',  69.99,   NULL),
    (28, 1,  'pending',    479.98,  'Third order from Alice'),
    (29, 2,  'delivered',  44.99,   NULL),
    (30, 3,  'shipped',    89.99,   NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval('sales.orders_id_seq', (SELECT COALESCE(MAX(id), 0) FROM sales.orders));

-- =============================================================================
-- sales.order_items (~40 rows)
-- =============================================================================

INSERT INTO sales.order_items (id, order_id, product_id, quantity, unit_price) VALUES
    (1,  1,  'a0000000-0000-0000-0000-000000000001', 1, 1299.99),
    (2,  1,  'a0000000-0000-0000-0000-000000000002', 1, 29.99),
    (3,  2,  'a0000000-0000-0000-0000-000000000003', 1, 89.99),
    (4,  2,  'a0000000-0000-0000-0000-000000000004', 1, 49.99),
    (5,  3,  'a0000000-0000-0000-0000-000000000006', 1, 599.99),
    (6,  4,  'a0000000-0000-0000-0000-000000000003', 1, 89.99),
    (7,  5,  'a0000000-0000-0000-0000-000000000005', 1, 449.99),
    (8,  6,  'a0000000-0000-0000-0000-000000000008', 1, 69.99),
    (9,  7,  'a0000000-0000-0000-0000-000000000007', 1, 349.99),
    (10, 8,  'a0000000-0000-0000-0000-000000000016', 1, 44.99),
    (11, 9,  'a0000000-0000-0000-0000-000000000011', 1, 159.99),
    (12, 10, 'a0000000-0000-0000-0000-000000000002', 1, 29.99),
    (13, 11, 'a0000000-0000-0000-0000-000000000012', 1, 89.99),
    (14, 12, 'a0000000-0000-0000-0000-000000000001', 1, 1299.99),
    (15, 13, 'a0000000-0000-0000-0000-000000000015', 1, 79.99),
    (16, 14, 'a0000000-0000-0000-0000-000000000009', 1, 39.99),
    (17, 14, 'a0000000-0000-0000-0000-000000000014', 1, 14.99),
    (18, 15, 'a0000000-0000-0000-0000-000000000011', 1, 159.99),
    (19, 15, 'a0000000-0000-0000-0000-000000000003', 1, 89.99),
    (20, 16, 'a0000000-0000-0000-0000-000000000006', 1, 599.99),
    (21, 17, 'a0000000-0000-0000-0000-000000000009', 1, 39.99),
    (22, 18, 'a0000000-0000-0000-0000-000000000017', 1, 24.99),
    (23, 19, 'a0000000-0000-0000-0000-000000000005', 1, 449.99),
    (24, 20, 'a0000000-0000-0000-0000-000000000010', 1, 12.99),
    (25, 21, 'a0000000-0000-0000-0000-000000000011', 1, 159.99),
    (26, 21, 'a0000000-0000-0000-0000-000000000002', 1, 29.99),
    (27, 22, 'a0000000-0000-0000-0000-000000000018', 1, 34.99),
    (28, 23, 'a0000000-0000-0000-0000-000000000003', 1, 89.99),
    (29, 23, 'a0000000-0000-0000-0000-000000000002', 1, 29.99),
    (30, 24, 'a0000000-0000-0000-0000-000000000019', 1, 16.99),
    (31, 25, 'a0000000-0000-0000-0000-000000000020', 1, 29.99),
    (32, 26, 'a0000000-0000-0000-0000-000000000001', 1, 1299.99),
    (33, 27, 'a0000000-0000-0000-0000-000000000008', 1, 69.99),
    (34, 28, 'a0000000-0000-0000-0000-000000000005', 1, 449.99),
    (35, 28, 'a0000000-0000-0000-0000-000000000002', 1, 29.99),
    (36, 29, 'a0000000-0000-0000-0000-000000000016', 1, 44.99),
    (37, 30, 'a0000000-0000-0000-0000-000000000003', 1, 89.99)
ON CONFLICT (id) DO NOTHING;

SELECT setval('sales.order_items_id_seq', (SELECT COALESCE(MAX(id), 0) FROM sales.order_items));

-- =============================================================================
-- analytics.page_views (~30 rows)
-- =============================================================================

INSERT INTO analytics.page_views (id, page_url, visitor_ip, user_agent, referrer, viewed_at) VALUES
    (1,  '/',              '192.168.1.10',  'Mozilla/5.0 Chrome/120', 'https://google.com',    '2025-01-15 10:30:00+00'),
    (2,  '/products',      '192.168.1.11',  'Mozilla/5.0 Firefox/121', 'https://google.com',   '2025-01-15 10:31:00+00'),
    (3,  '/products/1',    '192.168.1.10',  'Mozilla/5.0 Chrome/120', '/',                     '2025-01-15 10:32:00+00'),
    (4,  '/cart',          '192.168.1.10',  'Mozilla/5.0 Chrome/120', '/products/1',            '2025-01-15 10:35:00+00'),
    (5,  '/',              '10.0.0.5',      'Mozilla/5.0 Safari/17',  NULL,                    '2025-01-15 11:00:00+00'),
    (6,  '/products',      '10.0.0.5',      'Mozilla/5.0 Safari/17',  '/',                     '2025-01-15 11:01:00+00'),
    (7,  '/about',         '172.16.0.20',   'Mozilla/5.0 Edge/120',   'https://bing.com',      '2025-01-15 12:00:00+00'),
    (8,  '/',              '192.168.2.30',  'Mozilla/5.0 Chrome/120', NULL,                    '2025-01-16 08:00:00+00'),
    (9,  '/products',      '192.168.2.30',  'Mozilla/5.0 Chrome/120', '/',                     '2025-01-16 08:01:00+00'),
    (10, '/products/5',    '192.168.2.30',  'Mozilla/5.0 Chrome/120', '/products',              '2025-01-16 08:05:00+00'),
    (11, '/checkout',      '192.168.2.30',  'Mozilla/5.0 Chrome/120', '/cart',                  '2025-01-16 08:10:00+00'),
    (12, '/',              '10.0.1.15',     'Mozilla/5.0 Firefox/121', 'https://google.com',   '2025-01-16 09:00:00+00'),
    (13, '/products',      '10.0.1.15',     'Mozilla/5.0 Firefox/121', '/',                    '2025-01-16 09:02:00+00'),
    (14, '/contact',       '172.16.1.5',    'Mozilla/5.0 Safari/17',  'https://duckduckgo.com','2025-01-16 10:00:00+00'),
    (15, '/',              '192.168.3.40',  'Mozilla/5.0 Chrome/120', NULL,                    '2025-01-17 07:30:00+00'),
    (16, '/products',      '192.168.3.40',  'Mozilla/5.0 Chrome/120', '/',                     '2025-01-17 07:31:00+00'),
    (17, '/products/3',    '192.168.3.40',  'Mozilla/5.0 Chrome/120', '/products',              '2025-01-17 07:35:00+00'),
    (18, '/',              '10.0.2.25',     'Mozilla/5.0 Edge/120',   'https://google.com',    '2025-01-17 09:00:00+00'),
    (19, '/about',         '10.0.2.25',     'Mozilla/5.0 Edge/120',   '/',                     '2025-01-17 09:05:00+00'),
    (20, '/products',      '192.168.4.50',  'Mozilla/5.0 Firefox/121', NULL,                   '2025-01-17 10:00:00+00'),
    (21, '/products/10',   '192.168.4.50',  'Mozilla/5.0 Firefox/121', '/products',            '2025-01-17 10:02:00+00'),
    (22, '/cart',          '192.168.4.50',  'Mozilla/5.0 Firefox/121', '/products/10',          '2025-01-17 10:05:00+00'),
    (23, '/',              '172.16.2.10',   'Mozilla/5.0 Chrome/120', 'https://bing.com',      '2025-01-18 08:00:00+00'),
    (24, '/products',      '172.16.2.10',   'Mozilla/5.0 Chrome/120', '/',                     '2025-01-18 08:02:00+00'),
    (25, '/products/7',    '172.16.2.10',   'Mozilla/5.0 Chrome/120', '/products',              '2025-01-18 08:10:00+00'),
    (26, '/',              '10.0.3.35',     'Mozilla/5.0 Safari/17',  NULL,                    '2025-01-18 11:00:00+00'),
    (27, '/checkout',      '10.0.3.35',     'Mozilla/5.0 Safari/17',  '/cart',                  '2025-01-18 11:15:00+00'),
    (28, '/products',      '192.168.5.60',  'Mozilla/5.0 Edge/120',   'https://google.com',    '2025-01-19 09:00:00+00'),
    (29, '/products/15',   '192.168.5.60',  'Mozilla/5.0 Edge/120',   '/products',              '2025-01-19 09:03:00+00'),
    (30, '/',              '10.0.4.45',     'Mozilla/5.0 Chrome/120', NULL,                    '2025-01-19 14:00:00+00')
ON CONFLICT (id) DO NOTHING;

SELECT setval('analytics.page_views_id_seq', (SELECT COALESCE(MAX(id), 0) FROM analytics.page_views));

-- =============================================================================
-- analytics.daily_stats (~5 rows)
-- =============================================================================

INSERT INTO analytics.daily_stats (stat_date, total_orders, total_revenue, new_customers, page_views) VALUES
    ('2025-01-15', 8,  2739.90, 5,  7),
    ('2025-01-16', 7,  2036.93, 4,  7),
    ('2025-01-17', 6,  1617.93, 3,  8),
    ('2025-01-18', 5,  1199.96, 2,  5),
    ('2025-01-19', 4,  939.97,  1,  3)
ON CONFLICT (stat_date) DO NOTHING;
