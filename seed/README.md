# Querylane seed instances

`task dev:seed` starts local PostgreSQL instances for exercising Querylane with different catalog shapes.

| Instance config ID | Port | Database | Login used by Querylane | Purpose |
| --- | ---: | --- | --- | --- |
| `seed-normal` | 5500 | `ecommerce` | `seeduser` | Normal ecommerce fixture from seeder-buddy. |
| `seed-edgecases` | 5501 | `postgres` | `seeduser` | Database-name and identifier edge cases. |
| `seed-stress` | 5502 | `stress_lab` | `seedstress` | Large stress fixture with PostgreSQL feature coverage. |
| `seed-demo-complex` | 5503 | `demo_complex` | `demo_readonly` | Product-shaped complex demo under 500 MB. |

Run locally:

```bash
task dev:seed
task dev:backend DEV_CONFIG=configs/dev-seed.yaml
task dev:frontend
```

Reset all seed data:

```bash
task dev:seed:clean
task dev:seed
```

## Demo Complex

The Demo Complex fixture lives in `seed/instance-demo-complex/` and is loaded by the `pg-demo-complex` container on first boot.

It is designed to reproduce the public `demo_complex` Neon database shape:

- 9 business schemas: `core`, `crm`, `catalog`, `commerce`, `fulfillment`, `billing`, `support`, `analytics`, `audit`
- 23 tables, including range partitions under `commerce.order_event`
- 2 views with comments documenting purpose, source relations, and query shape
- 2 triggers: `crm.customer` audit log and `fulfillment.inventory_level` timestamp touch
- 2 RLS policies: `commerce.orders` and `support.ticket`
- generated columns, domains, enums, composite primary keys, checks, foreign keys, GIN and BRIN indexes
- smoke assertions in `99_verify.sql` keep the fixture below 500 MB and fail container init if key catalog features drift

Direct standalone load into any PostgreSQL 17 database named `demo_complex`:

```bash
psql -v ON_ERROR_STOP=1 -d demo_complex \
  -f seed/instance-demo-complex/sql/01_schema.sql \
  -f seed/instance-demo-complex/sql/02_seed.sql \
  -f seed/instance-demo-complex/sql/03_catalog_features.sql \
  -f seed/instance-demo-complex/sql/99_verify.sql
```

The schema script drops and recreates the demo schemas. Use it only against throwaway development databases.
