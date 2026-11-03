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

Roles are the first dynamically masked list consumer. Its table and summary share
one masked request when unfiltered. The access map keeps a full-resource query
because it needs memberships. Other catalog consumers can opt into the new mask
without changing their default behavior.

Canonical mask paths are sorted and deduplicated. Equivalent selections reuse a
cache entry; distinct projections and full resources stay isolated. Connect Query
does not merge or reuse supersets automatically. More projections can mean more
cache entries, not universally better cache hit rates.

## Cost boundary

These masks reduce response payloads, not PostgreSQL work: catalog synchronization
and SQL projections are unchanged. The separate table-data grid already supports
opt-in visible-column SQL projection; its visibility now also follows URL state,
while its local projection preference is unchanged.
