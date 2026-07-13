# Spec: Server-side filtering for list endpoints (AIP-160-inspired subset)

> Status: **IMPLEMENTED (backend)** — the `backend/aip` filter engine, the live slice
> (`ListRoleOwnedObjects`, `ListRoleDefaultPrivileges`, `ListRoleGrants`, `ListPublicGrants`), and the
> cached catalog lists (`ListDatabases/Schemas/Tables/Views`, using the canonical `name:"..."`
> spelling) all ship. `ListRoles` and `ListInstances` still reject / ignore filters pending their
> data-flow splits. Data Explorer catalog search emits canonical filters; the broader frontend phases
> F1/F2 (§7) are not implemented yet.
> Owner: platform.
> This implements a **defensible subset** of AIP-160 (see §2.1), not the full grammar — a deliberate
> complexity trade-off.
> Scope: `backend/aip` filter engine + per-endpoint rollout + frontend wiring.

## 1. Summary

Add real **server-side filtering** to the `backend/aip` list framework so every list RPC can filter
rows on the server instead of the client fetching everything and filtering in the browser.

Before this work, filtering was a **no-op**: the `filter` string was accepted, threaded into
`aip.Params`, and hashed into the page token for cursor consistency, but never compiled into SQL.
The role-centric services explicitly rejected non-empty filters (today only `ListRoles` keeps that
guard, `backend/service/role/service.go`), and the cached catalog lists accepted exactly one legacy
spelling, `name.contains('...')`, via a pre-parser.

The framework now compiles each validated query *plan* once through `backend/aip/rawsql`. Handwritten
live-instance queries execute those clauses directly; meta-database/catalog-cache queries embed the
same bound predicate into go-jet while retaining typed Jet bindings and `ORDER BY`. Filtering and
keyset pagination therefore share one PostgreSQL predicate compiler instead of parallel Jet and raw
SQL implementations. An endpoint gains filtering by declaring which fields are filterable and binding
their trusted backend expression.

This revision deliberately trims the original design: **no `Filter` wrapper struct, no `FilterOps`
override, no new abstractions** — ~100 lines across the existing files (see §11).

## 2. Goals / non-goals

**Goals**
- A bounded **AIP-160 subset** grammar with boolean composition, equality and typed comparisons, plus
  string substring via `:` (see §2.1), parsed before schema-aware coercion/validation (§5.3).
- One parser → a validated `FilterExpr` tree → one parameterized PostgreSQL compiler shared by the
  handwritten-SQL and go-jet execution adapters.
- Per-field opt-in via a single `Filterable bool`; allowed operators **derived from the field codec**;
  enum-like fields validated against an optional **bounded value set** (§5.1).
- Endpoints that opt in **nothing** reject non-empty filters with `InvalidArgument`; enabling fields is
  additive because it only widens the accepted request set (§5.3).
- Safe by construction: field names from a schema allowlist only; values always bound parameters; the
  **frontend** escapes user text into quoted literals so it can't inject filter grammar (§7, §9).
- `InvalidArgument` errors for bad filters, consistent with `order_by`/`page_token`.
- Cursor consistency preserved (already implemented via the token filter-hash).
- A first backend vertical slice (`ListRoleOwnedObjects` + `ListRoleDefaultPrivileges`) with API and
  integration coverage. UI server-filtering is Phase F2 because today's owned-objects query feeds
  summary state as well as table rows (§7).

**Non-goals (this iteration)** — deliberate AIP-160 omissions, see §2.1:
- Field traversal (`a.b.c`), full `:` HAS semantics for repeated/map/message fields, function calls
  (including legacy `.contains()`), bare fuzzy-match terms, and `*` wildcards.
- Strict AIP enum-name semantics for `object_type`/`privilege` (we filter on the stored token — §2.1).
- Matching all non-`page_size` args in the page token (parent/database scope not enforced — §13).
- Changing the keyset pagination model (still cursor-based AIP-132).
- Removing the per-page catalog scan on live endpoints (see §10).
- Frontend cursor pagination + facets (deferred to Phase F2, §7).

### 2.1 Relationship to AIP-160 (a documented subset)

We implement a **subset** of [AIP-160](https://google.aip.dev/160), not the full grammar — a deliberate
complexity trade-off. The surface is everything the UI needs (kind tabs + a search box + the cached
lists' `is_system_*`/`owner` filters) and nothing more.

**Supported:** `=`, `!=`, `<`, `<=`, `>`, `>=`, and string substring via `:`; `AND`, `OR`, `NOT`, unary
`-`, and parenthesized groups. AIP-160 precedence is preserved: `OR` binds tighter than `AND`. Values
are quoted strings/RFC 3339 timestamps or bare bools/integers, as required by the field codec.

**Deliberately omitted (documented deviations):**
- Field traversal, `*`/wildcard matching, bare fuzzy terms, function calls (including `.contains()`),
  and the full AIP-160 `:` semantics for repeated/map/message presence checks. A non-empty unsupported
  construct returns `InvalidArgument`, never a silent no-op.
- We use AIP-160's **`:` spelling** for string substring. Data Explorer catalog search emits
  `name:"..."`; the older `.contains()` spelling is unsupported and returns `InvalidArgument`.
- **Enum fields** (`object_type`, `privilege`) are filtered on their **stored string token**
  (`"TABLE"`, `"VIEW"`, … — the proto enum name minus the `GRANT_OBJECT_TYPE_` prefix; the DB column is
  this token and is mapped to the proto enum only at the API boundary, `service.go:414-451`), **not** the
  canonical proto enum name. Rationale: the catalog columns are denormalized strings
  (`list_role_owned_objects.sql` emits `'TABLE'` etc.) and querylane's own UI is the sole client (it
  already owns the slug↔token mapping). Enum-like fields carry a **bounded value set** (§5.1) so a bad
  token returns `InvalidArgument` rather than silently empty.

This is **AIP-160-inspired**, not wire-compatible with a strict AIP-160 client: we implement only a
small `:` subset and use stored enum tokens (not canonical enum names). Fine for querylane's own UI;
revisit if filtering is ever exposed to third-party AIP clients.

If full AIP-160 is needed later, `go.einride.tech/aip/filtering` provides a real parser; we would still
write our own lowering to the shared PostgreSQL clauses. Not warranted for this subset.

## 3. Background: where does each list come from?

Two read paths honor the filter through one shared predicate compiler.

| Path | Source | aip entry | Compiler | Endpoints |
|---|---|---|---|---|
| **Meta DB (catalog cache)** | querylane's own Postgres, synced from instances | `aip/jet.Execute` / `ExecuteWithCondition` | `aip/rawsql.BuildClauses`, embedded by `aip/jet` | `ListDatabases`, `ListSchemas`, `ListTables`, `ListViews`, `ListInstances` |
| **Live target instance** | target's `pg_catalog`, queried directly | `aip/rawsql.Execute` | `aip/rawsql.BuildClauses` | `ListRoles`, `ListRoleGrants`, `ListRoleOwnedObjects`, `ListRoleDefaultPrivileges`, `ListPublicGrants` |

The core `aip.Schema` stays backend-neutral. `rawsql.Bind` attaches trusted SQL expressions for
handwritten queries. `jet.Bind` validates typed go-jet columns, derives quoted SQL expressions from
them, and creates the corresponding raw-SQL binding so both paths compile identical predicates.

> **Behavior-change callout (resolved).** Before this rollout, `ListDatabases/Schemas/Tables/Views`
> accepted exactly `name.contains('...')` through a legacy pre-parser. Catalog filters now use the
> same canonical grammar as the rest of the AIP engine. Data Explorer emits `name:"..."`, and
> `.contains()` is rejected with `InvalidArgument`; there is no compatibility rewrite.
> `TestIntegrationCatalogListAIPFilterGrammar` covers the cached catalog contract, including rejection
> of the removed `.contains()` spelling.

## 4. Filter grammar (the supported subset)

Uses AIP-160's `:` spelling for the one substring operation we need; see §2.1 for how this narrows the
full AIP-160 language.

```
restriction := field operator value
simple      := "(" expression ")" | restriction
term        := [ "NOT" | "-" ] simple
factor      := term { "OR" term }
expression  := factor { "AND" factor }
operator    := "=" | "!=" | ":" | "<" | "<=" | ">" | ">="
field       := IDENT
value       := quoted-string | bare-bool | bare-integer
```

Keywords are case-insensitive. Matching AIP-160, `OR` binds tighter than `AND`: `a AND b OR c` means
`a AND (b OR c)`.

Examples the UI sends:
- Kind tab: `object_type = "TABLE"`
- Search box: `object_name:"orders"`
- Combined: `object_type = "VIEW" AND object_name:"user"`
- Grouped/negated: `object_type = "TABLE" AND NOT (object_name:"tmp" OR schema_name:"audit")`
- System filter (cached lists): `is_system_database = false`

**Decisions**
- **Expression tree:** `AND`, `OR`, `NOT`/`-`, and parentheses produce a validated `FilterExpr` tree;
  compilation fully parenthesizes every branch so SQL precedence cannot change its meaning.
- **`:`** = case-insensitive substring for string fields (the search-box operator). SQL form + escaping
  in §5.4. This is not the full AIP-160 HAS operator for repeated/map/message fields.
- **Typed operators:** strings support `=`, `!=`, `:`; bools support `=`, `!=`; integers and RFC 3339
  timestamps support `=`, `!=`, `<`, `<=`, `>`, `>=`. Bounded string enums remain equality-only.
- **Enum values use the stored token** (`object_type = "TABLE"`, not `"GRANT_OBJECT_TYPE_TABLE"`), per
  §2.1; validated against the field's bounded set (§5.1).
- **Quoted values are opaque**: a string value may contain spaces, keywords, operators, or parentheses.
  The lexer treats those bytes as value content, not structure.
- **String escaping (precise):** inside a double-quoted value `\\`→`\` and `\"`→`"`; inside a
  single-quoted value `\\`→`\` and `\'`→`'`. A backslash before any other character, or a trailing
  dangling backslash, is `InvalidArgument`. Operator-looking content inside quotes is literal —
  `name = ":"` and `name = "a!=b"` are each a single equality condition (parser tests, §8).
- **Whitespace-only filters normalize to empty.** `BuildPlan` trims `params.Filter` once and uses the
  trimmed value for **both** hashing and parsing, so `" "` and `""` are equivalent and never trigger a
  spurious `ErrFilterMismatch` across pages.
- **Abuse guards:** filters are limited to 1 KiB, 16 conditions, and nesting depth 8 before compilation.

## 5. Backend design

### 5.1 Backend-neutral fields and bindings (`backend/aip/schema.go`)

`aip.Field` contains only API behavior; database bindings live in the execution adapters:

```go
type Field[Model any] struct {
    Codec           CursorCodec
    DisableOrdering bool
    GetValue        func(m *Model) any
    Filterable      bool
    FilterValues    []string
}
```

`Filterable` opts a field into the grammar. `FilterValues` optionally bounds enum-like string fields;
when non-empty, values outside the set return `InvalidArgument` and the field supports only `=`/`!=`.
The object-type token set differs by endpoint (singular for owned objects/grants, plural for default
privileges — §5.8). `privilege` remains unbounded because PostgreSQL can add values across versions.

`NewSchema` validates that every filterable field has a supported codec and that `FilterValues` is used
only with strings. Backend binding is separate and construction-time:

- `rawsql.Bind` requires a trusted SQL expression for every orderable/filterable path.
- `jet.Bind` requires a typed go-jet column for every path, verifies that its type matches the codec,
  derives a quoted SQL expression, and creates the corresponding `rawsql` binding.
- `GetValue` is required only for orderable cursor fields, not filter-only fields.

Bound filter expressions must be non-NULL or normalize NULL with `COALESCE`; PostgreSQL's three-valued
logic would otherwise silently drop NULL rows for `!=` and `:` predicates.

### 5.2 Validated expression tree (`backend/aip/filter.go`)

The parser and validator produce a backend-neutral tree:

```go
type FilterExpr interface { isFilterExpr() }

type FilterAnd struct   { Operands []FilterExpr }
type FilterOr struct    { Operands []FilterExpr }
type FilterNot struct   { Operand FilterExpr }
type FilterCondition struct {
    Field    string
    Operator FilterOperator
    Value    any
}
```

A condition value is already coerced to the codec's Go type (`string`, `bool`, `int64`, or
`time.Time`). `Plan` retains the normalized raw filter for token hashing and stores the validated tree
privately for clause compilation.

### 5.3 Parser and schema validation

`parseFilter` is a quote-aware lexer plus recursive-descent parser. It builds a schema-free raw tree,
preserves AIP-160's `OR`-before-`AND` precedence, and treats quoted contents as opaque. Function calls,
dotted traversal, fuzzy bare terms, and wildcards are rejected.

`BuildPlan` then validates every leaf against the schema:

- a schema with no filterable fields rejects any non-empty filter;
- the field must exist and be `Filterable`;
- bounded strings allow `=`/`!=`;
- unbounded strings allow `=`/`!=`/`:`;
- booleans allow `=`/`!=` and require bare `true`/`false`;
- integers and timestamps allow `=`/`!=`/`<`/`<=`/`>`/`>=`; integers are bare and timestamps are
  quoted RFC 3339 values;
- bounded values must belong to the field's `FilterValues` set.

Filters over 1 KiB, over 16 conditions, or deeper than eight nested groups return
`InvalidArgument`. Errors preserve `ErrInvalidFilter` through the engine/storage mappers.

Because the page token hashes the normalized raw filter, changing a filter mid-pagination is rejected
with `ErrFilterMismatch`; no separate token machinery is required.

### 5.4 `:` string substring — SQL form, escaping, and the ILIKE decision

**Decision: the shared compiler emits `ILIKE`**, as `<expr> ILIKE $n` with the bound value
`"%" + escapeLikePattern(term) + "%"`, where unexported `escapeLikePattern` escapes `\`, `%`, `_`.
**No explicit `ESCAPE` clause** — PostgreSQL's default `LIKE`/`ILIKE` escape character is already the
backslash, and because the pattern is a **bound parameter** (not a string literal) it is not subject to
`standard_conforming_strings`. Both execution adapters consume the same compiled fragment, so there is
no separate go-jet spelling to keep in sync.

Rationale (resolves the simplicity-vs-performance conflict):
- The meta tables **already have `pg_trgm` GIN indexes on every `name` column**
  (`backend/storage/migrations/0001_initial.sql`). `col ILIKE '%term%'` uses those indexes; the
  alternatives **silently disable them**: `LOWER(col) LIKE LOWER($n)` can't use an index on the raw
  column, and `strpos(lower(col), …) > 0` can't either. So **do not** use `LOWER(col) LIKE …`. (Per the
  pg_trgm docs, very short or wildcard-only patterns degrade to a scan — acceptable here.)
- `ILIKE` is case-insensitive natively (no `LOWER` needed) and marginally cheaper per row on the live path.
- `escapeLikePattern` neutralizes user `%`/`_`/`\` so a search for `"50%"` matches the literal, not a
  wildcard. It gets a focused unit test, and the shared compiler asserts the emitted `ILIKE $n` and
  bound pattern.

> **Rejected:** `strpos`/`POSITION` (simpler escaping, but forfeits the existing trigram indexes — a
> performance regression on the cached path). The escaping cost is one small, tested helper.

### 5.5 Shared compiler (`backend/aip/rawsql/compile.go`)

`rawsql.BuildClauses` lowers the validated `FilterExpr`, keyset cursor, ordering, and sentinel limit
into one parameterized PostgreSQL clause set. `buildFilterPredicate` handles the expression tree and
emits bound leaf comparisons; `buildKeysetPredicate` handles uniform tuple comparisons and mixed
lexicographic orderings.

**Parameter ordering is an invariant, not a style note.** The filter predicate is built first and the
cursor predicate second with one `argBuilder`, so filter arguments precede cursor arguments. Empty
fragments are skipped before they are joined. `placeholderStart` lets handwritten queries continue
after their existing base arguments.

`rawsql.Execute` appends the combined `Where`, `OrderBy`, and `Limit` clauses to handwritten SQL. It
does not need to distinguish filter predicates from cursor predicates.

### 5.6 Jet execution adapter (`backend/aip/jet`)

`jet.Bind` validates every schema binding against the go-jet column type, quotes the trusted table and
column identifiers, and builds a matching `rawsql.Schema`. `ExecuteWithCondition` then calls the same
`rawsql.BuildClauses` used by handwritten queries.

The adapter replaces positional placeholders in reverse order (`$10` before `$1`) with go-jet named
arguments and embeds the result through `postgres.RawBool`. Jet assigns the final placeholder numbers
after any base condition, while the raw predicate values remain bound. `ORDER BY` stays on typed Jet
columns. Focused tests cover `$1`/`$10`, a preceding base argument, exact argument order, mixed cursor
directions, and quoted identifiers.

### 5.7 Errors (`backend/aip/errors.go` + mappers)

- Add `var ErrInvalidFilter = errors.New("invalid filter parameter")`.
- Re-export in `backend/engine/errors.go` and `backend/storage/errors.go` (using the existing
  re-export comment format). Note `ErrFilterMismatch` is **already** re-exported in both — only
  `ErrInvalidFilter` is new.
- Map in `backend/connectrpc/apierrors/engine.go` (`MapEngineErr`) and `storage.go` (`MapRepoErr`) to
  `NewInvalidArgumentError(NewFieldViolation("filter", err.Error()))` — exactly like `order_by`.
- Remove the filter-rejection guards in `backend/service/role/service.go` as each endpoint is enabled.
  Done for the shared `openRoleDatabaseSession` guard (grants, owned objects, default privileges) and
  `ListPublicGrants`; only the `ListRoles` guard remains.

### 5.8 Per-endpoint enablement + field caveats

Enabling = marking fields `Filterable` in the schema (+ removing the service guard). **Status:** all
rows below are enabled except `roleSchema` (`ListRoles` keeps its service guard until its fetch-all
data flow is split, §6) and `instanceSchema` (both instance repositories still reject filters).
Enabled fields:

| Schema (file) | Path | Mark `Filterable` |
|---|---|---|
| `ownedObjectSchema` (engine/postgres/owned_objects.go) | live | `object_type`, `object_name`, `schema_name` |
| `defaultPrivilegeSchema` (engine/postgres/default_privileges.go) | live | `object_type`, `privilege`, `schema_name`, `creator_role_name` |
| `grantSchema` / `publicGrantSchema` (engine/postgres/{grants,public_grants}.go) | live | `object_type`, `object_name`, `schema_name`, `privilege`, `grantor` |
| `roleSchema` (engine/postgres/roles.go) | live | `name` (+ `is_system_role`, see caveat) |
| `tableSchema` (engine/postgres/tables.go) | live | `table_type` |
| `catalog{Database,Schema,Table}Schema` (storage/catalog/*.go) | jet | `name`, `owner`, `table_type` (tables), `is_system_*` |
| `catalogViewSchema` (storage/catalog/view.go) | jet | `name` |
| `instanceSchema` (storage/instance.go) | jet | `display_name`, `engine` (note: `instance` has no `name` trigram index) |

Caveats from review:
- **`is_system_role` is a computed SELECT alias** (`list_roles.sql`: `r.rolname LIKE 'pg\_%' … AS
  is_system_role`). Postgres can't reference a SELECT alias in `WHERE`, so its `rawsql` binding must be
  the **full expression** `(r.rolname LIKE 'pg\_%' ESCAPE '\')`, not the alias. (Live grant/owned
  queries are wrapped as `… ) AS g`, so their `g.<col>` exprs are fine.)
- **`grantor` is `COALESCE`d to `''`** in the grant queries (not NULL), so `!=`/`:` behave
  correctly. Keep the COALESCE in any new query branch — it is load-bearing for filter correctness
  (a raw NULL would make `<> $n` silently drop rows).
- **`object_type` `FilterValues` differ by endpoint.** Owned objects + grants/public grants use the
  **singular** tokens (`DATABASE, SCHEMA, TABLE, VIEW, MATERIALIZED_VIEW, SEQUENCE, FOREIGN_TABLE,
  FUNCTION, LARGE_OBJECT`); **default privileges** uses the **plural** tokens (`TABLES, SEQUENCES,
  FUNCTIONS, TYPES, SCHEMAS, LARGE_OBJECTS`, from `list_role_default_privileges.sql`). Reference the shared `backend/engine`
  token slices from §5.1 rather than spelling these lists again in every schema. `privilege` stays
  unbounded (version-dependent vocabulary).
- **`defaultPrivilegeSchema` also scans `with_grant_option`.** It stays non-filterable because
  there is no UI need yet and the default-privilege identity is already covered by
  `(creator_role_name, schema_name, object_type, privilege)`. If needed later, add it as a
  `BoolCodec` field with `DisableOrdering: true` + `Filterable: true`.
- **Meta-DB indexes:** the `is_system_*` and `owner` columns on `catalog_*` have **no btree index**
  (only the `name` trigram GIN). When enabling the jet path, add a migration with **partial btree
  indexes** for the common `is_system_* = false` filter, e.g.
  `CREATE INDEX … ON catalog_table (instance_id, database_name, schema_name, name) WHERE is_system_table = false`.

### 5.9 Typed comparisons

Numeric and temporal comparisons are implemented in the shared tree and compiler. `Int64Codec` fields
accept bare integer literals; `TimestampCodec` fields accept quoted RFC 3339/RFC 3339-nano values. Both
support `=`, `!=`, `<`, `<=`, `>`, and `>=`. Endpoint schemas still opt fields in explicitly, so adding
the grammar does not expose a field until its query binding and product semantics are reviewed.

## 6. Vertical slice: live role lists (shared session opener)

`openRoleDatabaseSession` (`service.go`) is **shared** by `ListRoleGrants`, `ListRoleOwnedObjects`,
and `ListRoleDefaultPrivileges`, so removing its filter guard affects **all three** at once. The
shipped slice therefore enables all three (plus `ListPublicGrants`, whose schema is the shared
`newGrantSchema`): their schema fields are `Filterable`, the shared guard and the `ListPublicGrants`
guard are removed, and each has integration coverage. A guard removal without a schema opt-in would
still reject filters through `BuildPlan`; only fields explicitly opted into the schema become accepted.
`ListRoles` also retains its service-level reject guard until its fetch-all data flow is split.

**Decision after external review:** keep this as a backend/API slice, but do not call it end-to-end UI
validation. `ListRoles` would also require a split before safe server-side UI filtering because the same
fetch-all result feeds counts, role detail lookup, breadcrumb/header state, and membership indexes. The
owned/default-privilege slice exercises the live SQL compiler, shared opener, enum token validation, and
cursor interaction on the highest-impact role-detail path. The UI proves server filtering only in F2,
after summary/facet and table-slice data are separated.

## 7. Frontend design

Today every role list uses `paginateAll` (`frontend/src/lib/paginate-all.ts`) to fetch **all** pages
(`pageSize 1000`); `DataTable` filters/sorts/paginates client-side; the count badge and "which kind
tabs to show" derive from the full array.

**Phase F1 — backend filter live + bounded frontend fetch (no UI server-filtering yet).**
The owned-objects query (`role-detail-page.tsx:1216`) is **shared**: its `ownedObjects` array powers the
OWNS KPI and the `OWNER · N` hero badge (`:1455`, `:1539`), the overview reach rows, **and** the
`OwnedObjectsTable` drill-in (via `OwnsGrantsView`, `:1625`); and `KindFilteredTable` derives its visible
tabs from that array (`object-table.tsx:104`). **Filtering that query by table UI state would corrupt the
KPI/badge/overview counts and collapse the kind tabs** (selecting *Table* would show `OWNER · 12` instead
of 3,549) — so F1 must not do it.
- F1 leaves the owned-objects data flow **unchanged** (unfiltered fetch; client-side kind tabs + search
  exactly as today), so every count/tab stays correct. The backend `filter` still lands and is proven by
  API/integration tests (§8); the **frontend consumes it in F2** (§7 Phase F2), where splitting the
  summary query from the table query makes UI filtering safe.
- Add a **`paginateUpTo(maxRows)`** variant (the current `paginateAll` has no cap) and apply it
  **unconditionally** to these hooks (cap ~2–5k), surfacing a "showing first N — refine your search"
  banner via the already-returned `lastResponse`. This bounds the worst case (partitioned tables,
  PUBLIC-grant enumeration) even for the unfiltered `All` tab.

**Phase F2 — frontend server-side filtering + facets (the proper UI integration).**
This is where the UI sends a server `filter`, and it requires **splitting the data sources**:
- A **summary/facets query** (unfiltered) drives the KPIs, hero badge, overview, and the kind tabs +
  per-kind counts — so they stay whole regardless of the table filter. `KindFilteredTable`/
  `OwnedObjectsTable` take present-kinds + counts from this query as **props** (not from their own `data`).
- A separate **table-slice query** (server-`filter`ed + cursor-paginated) drives only the table rows.
  Build the filter via a shared, tested helper (`quoteFilterValue` + `buildOwnedFilter`, §9) — never raw
  concatenation. **Debounce** the search and require a **min length** (≥2–3 chars) before issuing a
  `:` substring filter: short patterns have no extractable trigrams and degrade to a scan (§10). Reset the cursor
  on filter change.
- **Facets cost (review):** a `COUNT(*) … GROUP BY object_type` over the owned-objects UNION is **not**
  cheap — a second catalog scan. Run it **once per filter** (own query key, no `pageToken`, a `staleTime`)
  or via a dedicated `Count…`/facets RPC — never per page-turn. Per the project's mock-first preference, an
  interim DEMO-badged approximate count is acceptable until then.

Honor `frontend/AGENTS.md`: keep the `useTransport` + `useQuery` pattern in `role.ts`; build requests
with `create(Schema, …)`; filter/pageToken live in client state + query key.

## 8. Testing plan

Mirror `backend/aip` conventions: table-driven parser/validation cases, exact SQL and argument
assertions for `rawsql`, focused adapter assertions for `jet`, and no `-short` guard on I/O-free tests.

- **Parser/validation** (`filter_test.go`): expression-tree shape and AIP precedence; groups; both
  negation spellings; every typed operator/literal; both quote styles; operator-looking quoted content;
  `.contains(...)` rejection; invalid fields/operators/escapes; size, condition, and depth limits.
- **`escapeLikePattern`** (`filter_test.go`): `%`, `_`, `\`, and combinations.
- **Shared compiler** (`rawsql/compile_test.go`): exact fully parenthesized `WHERE`, typed operators,
  bound values, filter-before-cursor ordering, tuple and mixed-direction cursors, and empty fragments.
- **Jet adapter** (`jet/raw_predicate_test.go`): `$1`/`$10` replacement, a preceding base argument,
  exact argument order, mixed cursors, typed ordering, and quoted identifiers.
- **Validation**: unknown field / non-filterable field / disallowed operator / type mismatch →
  wrapped `ErrInvalidFilter`; message lists `filterableFields()`.
- **Service** (`service/role/service_test.go`): the "rejects filter" cases flip to "passes filter to
  engine" using `fakeOpener`/`fakeDatabaseSession`.
- **Integration** (`postgres_integration_test.go`, `-short`-guarded suite): `ListRoleOwnedObjects`
  filter by `object_type`, by `object_name:"..."`, combined; the filter+cursor round-trip
  (page 1 → next consistent under the same filter; changed filter → `ErrFilterMismatch`).
- **Catalog integration** (`storage/catalog/filter_integration_test.go`): canonical substring/equality
  filters, changed-filter token rejection, unknown fields, and rejection of legacy `.contains()`.
- **Apierrors**: `ErrInvalidFilter` → `InvalidArgument` + `filter` field violation.
- **Frontend**: F1 — the `paginateUpTo` cap + banner render; counts/tabs unchanged. F2 — the
  `quoteFilterValue`/`buildOwnedFilter` builder unit test, and the table rendering server-filtered results
  + cursor reset (browser test per the project's manual-verification rule).

## 9. Security

- **Field names never become SQL identifiers directly** — user tokens must match declared schema paths;
  trusted expressions/typed columns come only from backend bindings.
- **Values are always bound parameters.** Both execution paths use the shared `$n` clause arguments;
  the Jet adapter converts placeholders to named `RawArgs` before go-jet assigns final positions.
- **`:`/ILIKE**: `escapeLikePattern` neutralizes `%`/`_`/`\` (default backslash escape, §5.4);
  read-only context. This is the only place user text reaches a pattern position.
- **Filter-grammar injection (F2):** once the frontend builds filters (F2), it must use a tested
  `quoteFilterValue`/`buildOwnedFilter` helper — `quoteFilterValue` escapes `\` and `"` and wraps the
  value in quotes — so user search text is always a single escaped, quoted literal and cannot inject
  conditions or operators. The backend parser independently re-validates (unknown field/op, bad escape,
  over-limit → `InvalidArgument`) regardless of client.
- **No new engine RPC surface** — the existing `filter` field simply becomes effective.

## 10. Performance

- **Live path: measure the pushdown; don't assume a barrier.** Filterable columns (e.g. owned objects)
  are outputs of a `UNION ALL` over `pg_class`/`pg_proc` (`queries/list_role_owned_objects.sql`) wrapped
  as `… ) AS g`. PostgreSQL treats `UNION ALL` as an *append relation* and **can push outer
  qualifications into the arms** (subquery pull-up); for a constant `object_type` per arm it may even
  **prune** non-matching arms (`object_type = "TABLE"` ⇒ the DATABASE/SCHEMA/FUNCTION arms are provably
  empty). So per-page scan cost may shrink more than a naive "filter on the outer query" reading
  suggests — **verify with `EXPLAIN`** rather than asserting a hard barrier. Regardless, the filter
  always collapses today's unbounded fetch-all into far fewer pages. If `EXPLAIN` shows the arms are
  *not* pruned under the kind filter, the follow-on is a single-branch query variant in Go (a TODO at
  `owned_objects.go`); the planner may make it unnecessary. Correctness does not depend on pushdown:
  `LIMIT N+1` (the keyset probe) is applied to the outer query and still bounds each page.
- **Jet path uses the existing trigram indexes** for `name:"..."` **iff** we emit `col ILIKE $n`
  (not `LOWER(col) LIKE …`) — see §5.4/§5.6. `is_system_* = false` equality is a seq scan **until** the
  partial btree indexes in §5.8 are added; `owner` filters are always schema-scoped by the base
  condition, acceptable without a new index.
- **Parser/compile + filter-hash** cost is negligible (per request, on a short string; `hashFilter("")`
  early-returns).
- **Frontend:** F1's bounded fetch derives counts/tabs from the in-memory unfiltered set (correct, no
  extra query). F2's facets must be cached per-filter (§7), not per page-turn.

## 11. Implementation map and deferred frontend work

**Backend (`backend/aip/`):**
- `filter.go`: lexer/parser, raw and validated expression trees, typed coercion, `FilterValues` bounds,
  codec-derived operators, abuse guards, and substring-pattern escaping.
- `schema.go`: backend-neutral field behavior plus construction-time codec validation.
- `plan.go`: normalized filter hashing and private validated `FilterExpr` storage.
- `rawsql/compile.go`: the sole filter/keyset predicate compiler.
- `rawsql/execute.go`: handwritten-query assembly and execution.
- `jet/`: typed bindings, trusted identifier derivation, raw predicate embedding, and typed ordering.
- `errors.go`: `ErrInvalidFilter`.
- `engine/errors.go`, `storage/errors.go`: re-export `ErrInvalidFilter`.
- `connectrpc/apierrors/{engine,storage}.go`: add `ErrInvalidFilter` → `filter` field violation.

**Per-endpoint (the slice):**
- `engine/postgres/owned_objects.go` + `default_privileges.go` + `grants.go` (shared by role + PUBLIC
  grants): add `Filterable: true` to the listed fields, plus `FilterValues:` on `object_type` from the
  shared `backend/engine` token slices — **different per endpoint**: singular tokens for owned
  objects/grants, plural tokens for default privileges (§5.8).
- `service/role/service.go`: remove the shared opener guard (enables grants + owned objects + default
  privileges) and the `ListPublicGrants` guard; drop the now-dead `filter` param from
  `openRoleDatabaseSession` and its call sites.
- `storage/catalog/`: mark the §5.8 fields `Filterable` and pass canonical AIP filters directly to the
  shared engine; no catalog-specific pre-parser or compatibility rewrite remains.
- `frontend/src/features/data-explorer/data-explorer-catalog-filter.ts`: emit `name:"..."` and escape
  backslashes plus double quotes for the selected string delimiter.
- `proto/…/role.proto`: replace the "Reserved for future … rejects non-empty filters" comments on the
  enabled requests with the supported filters; update existing `database/schema/table/view` comments
  from `.contains()` examples to `field:"..."`; run `task proto:generate` (never hand-edit `protogen/`).

**Frontend (F1 — bounded fetch only; no UI server-filtering, see §7):**
- `lib/paginate-all.ts`: add `paginateUpTo(maxRows)`.
- `hooks/api/role.ts`: switch the owned-objects (and default-privileges) hooks to `paginateUpTo` with a
  cap + the "first N — refine" banner. The query stays **unfiltered**, so KPIs/overview/tabs/counts are
  unaffected and no component internals change. (The `quoteFilterValue`/`buildOwnedFilter` builder, the
  summary/table query split, and the table→server-`filter` wiring are **F2** — §7.)

No third-party parser or SQL compiler dependency is required.

## 12. Resolved decisions

1. **Subset, not full AIP-160** (AIP-160-*inspired*, not wire-compatible — §2.1): typed comparisons,
   string substring via `:`, boolean composition, negation, and groups. Enum fields use stored tokens
   bounded by `FilterValues`; unsupported syntax fails explicitly.
2. **`:` substring:** the shared compiler emits `ILIKE` (uses the existing trigram GIN indexes);
   `escapeLikePattern` + the **default** backslash escape (no explicit `ESCAPE`, §5.4).
3. **Allowed operators:** `FilterValues`-bounded → `=`/`!=`; otherwise derived from `Codec` (string,
   bool, int64, timestamp). No `FilterOps` override. Size, condition-count, and depth guards apply.
4. **Parser vs validation:** `parseFilter` is lexical + schema-free; coercion/bounds/op-checks live in
   schema-aware `validateFilter`.
5. **Unsupported endpoints reject filters:** zero `Filterable` fields means a non-empty filter is
   `InvalidArgument`; opting fields in only widens accepted requests.
6. **AST:** `FilterAnd`/`FilterOr`/`FilterNot` with validated `FilterCondition` leaves.
7. **Frontend:** F1 = backend/API filter + **bounded fetch only** — the owned-objects query is shared with
   KPIs/overview/tabs, so it stays unfiltered (§7). F2 = UI server-filtering via a split facets/table
   query + the escaped `quoteFilterValue`/`buildOwnedFilter` builder + cursor pagination.
8. **`is_system_role`:** when enabled, its raw-SQL binding must be the full LIKE expression, not the
   SELECT alias.
9. **Jet adapter:** typed columns are validated at bind time, converted to trusted quoted expressions,
   and passed through the shared compiler. Bound raw predicates are embedded with `RawBool`; Jet owns
   final placeholder numbering after base conditions.

## 13. Open questions (for implementation)

- Verify with `EXPLAIN` whether PostgreSQL prunes / pushes into the owned-objects `UNION ALL` arms under
  a kind filter (§10) — decides whether the single-branch query variant is worth building.
- `paginateUpTo` cap value (2k vs 5k) and whether the banner should surface the (unknown) true total or
  just "first N".
- ~~Whether to enable the cached-list (`ListDatabases/Schemas/Tables/Views`) filters in the same release
  as the live slice or stage them after.~~ **Resolved: enabled with the live slice.** Data Explorer now
  emits canonical `name:"..."` filters and the catalog lists reject `.contains()`; no compatibility
  shim remains. Add the §5.8 partial btree indexes for `is_system_*` if those filters show up in
  slow-query logs.
- **AIP-158 follow-up (not blocking):** page tokens enforce filter/order/resource type but not
  parent/database scope (`proto/querylane/common/v1/pagination.proto`). AIP-158 wants all non-`page_size`
  args stable across page turns; add scope to the token hash later if "AIP-compatible" becomes the bar.
- If full AIP-160 (wildcards, traversal, full `:` HAS semantics) is ever required, adopt
  `go.einride.tech/aip/filtering` for parsing and write our own lowering — out of scope now.
