# Data Explorer table kind defaults

Date: 2026-06-26

## Decision

Data Explorer table lists include ordinary, partitioned, and foreign tables by default.
Temporary tables are represented by the backend when PostgreSQL exposes them in the selected temporary schema, but they are not promoted into the default user-schema list. A future advanced table-kind filter may expose temporary tables more directly without adding default sidebar noise.

## Rationale

Ordinary, partitioned, and foreign tables are durable database objects users expect to browse from a schema. PostgreSQL stores these as separate relation kinds in `pg_class.relkind`, while temporary status is modeled by `pg_class.relpersistence`. That makes table kind a catalog property rather than a separate Data Explorer resource category.

Temporary tables are session-scoped and live in PostgreSQL temporary schemas. Showing them alongside durable schema objects by default would make the object browser noisy and unstable across sessions.

## Visibility behavior

Table discovery reads `pg_class` directly so Querylane can classify partitioned and foreign tables consistently. A table is visible when PostgreSQL reports direct table privileges or when the connected role has `USAGE` through the table owner role. This is intentionally broader than the previous `information_schema.tables` projection and matches the admin-console expectation that owner-role members can see owned objects in the sidebar.

## UI behavior

- Ordinary tables get a `base` badge.
- Partitioned table roots get a `part` badge.
- Foreign tables get a `foreign` badge.
- Temporary tables get a `temp` badge when returned by the backend.

The table detail header also shows the table kind.
