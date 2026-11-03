# ADR: List response read masks

## Status

Proposed

## Decision

Catalog ListDatabases, ListSchemas, ListTables, and ListRoles accept an optional,
resource-relative protobuf `read_mask`. Omitted, empty, and `*` masks retain the
existing full-resource response. Invalid paths fail before catalog or connection
work. Filtering, ordering, continuation tokens, and synchronization metadata are
unaffected. Projection operates on newly converted response resources, never on
cached catalog values.

This is an intentional external-API exception to AIP-157's preferred side-channel
mask parameter. Querylane has no infrastructure-level mask service. Keeping the
mask in the protobuf input lets Connect Query include it in typed query keys;
header-only masks would otherwise collide with full responses unless transport
identity or cache-key construction also changed. Do not treat this choice as a
precedent for unrelated Google-style APIs.

## Client behavior

The URL owns visible column IDs, keyed by stable list identity, not mount order.
Column IDs are presentation identifiers, not protobuf paths. Each query must map
its composite cells to resource fields and retain dependencies needed for hidden
sort columns, filtering, navigation, summaries, or other consumers.

Database, schema, and table list inputs now carry canonical masks in the shared
builders used by loaders and observers. Catalog aggregation/search uses the same
projections. These masks retain the union of navigation, facet, map and summary
dependencies, so hiding a cell does not invent missing values for another consumer.
Unused creation timestamps are excluded. View lists explicitly use their existing
BASIC projection, while selected view definitions keep their FULL request.

Roles additionally derive their projection from selected columns. The table and
summary share one masked request when unfiltered. The access map keeps complete
role resources because it needs memberships.

Endpoints without a partial-response contract still return complete responses.
This includes aggregate health/activity/insight responses, admin operations, role
object grants, and table-detail metadata used by copy/DDL/detail actions. The UI
supports column selection there, but this change does not claim server-side
projection or cheaper SQL for those endpoints.

Canonical mask paths are sorted and deduplicated. Equivalent selections reuse a
cache entry; distinct projections and full resources stay isolated. Connect Query
does not merge or reuse supersets automatically. More projections can mean more
cache entries, not universally better cache hit rates.

## Cost boundary

These masks reduce response payloads, not PostgreSQL work: catalog synchronization
and SQL projections are unchanged. The separate table-data grid already supports
opt-in visible-column SQL projection; its visibility now also follows URL state,
while its local projection preference is unchanged.

## Tabular view coverage

`frontend/e2e/tests/list-column-selection.spec.ts` drives the real routes through
selection, URL persistence, reload and reset. It covers:

- Instance databases, application connections, live sessions, and roles.
- Schema objects; table columns, keys, indexes, constraints and partitions.
- Table data and materialized-view data.
- Role object grants and owned objects.
- Extensions (including explicit Description visibility on narrow screens).
- Query insights (reopen the inspector after reload; dialog state is not shared).
- Admin replicas, job queue, catalog synchronization and storage.
- SQL and SQL workbench results. Reload restores a draft and column preferences,
  never execution; the test explicitly runs the query again.

SQL result visibility is presentation-only. It preserves the original statement,
complete backing result, copy/export data and server work. Duplicate column names
are independently selectable using the grid's existing disambiguated identifiers.
The URL does not contain SQL text or result values.

Navigation trees, charts and card-based inventories (including trigger and policy
cards) have no table columns and are outside this column-selection contract.
