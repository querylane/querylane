# Spec: Server-side filtering for list endpoints (AIP-160-inspired subset)

> Status: **Implemented end to end**. The backend engine, live role/grant lists, cached catalog lists,
> `ListRoles`, both `ListInstances` repositories, and PUBLIC grants accept the documented filters. The Explorer,
> role list, grant drill-ins, and command palette send escaped server filters while their summary/facet
> data remains independent. Bounded list summaries surface partial-result states.
> Owner: platform.
> This implements a **defensible subset** of AIP-160 (see §2.1), not the full grammar. The narrower
> scope is a deliberate complexity trade-off.
> Scope: `backend/aip` filter engine, per-endpoint rollout, and frontend wiring.

## 1. Summary

Add real **server-side filtering** to the `backend/aip` list framework so every list RPC can filter
rows on the server instead of the client fetching everything and filtering in the browser.

Before this work, filtering was a **no-op**: the `filter` string was accepted, threaded into
`aip.Params`, and hashed into the page token for cursor consistency, but never compiled into SQL.
The role-centric services originally rejected non-empty filters, and the cached catalog lists accepted exactly 1 legacy
spelling, `name.contains('...')`, through a pre-parser.

The framework now compiles each validated query *plan* once through `backend/aip/rawsql`. Handwritten
live-instance queries execute those clauses directly; meta-database/catalog-cache queries embed the
same bound predicate into go-jet while retaining typed Jet bindings and `ORDER BY`. Filtering and
keyset pagination therefore share one PostgreSQL predicate compiler instead of parallel Jet and raw
SQL implementations. An endpoint gains filtering by declaring which fields are filterable and binding
their trusted backend expression.

This revision trims the original design: **no `Filter` wrapper struct, no `FilterOps` override, and no
new abstractions**. It adds about 100 lines across the existing files (see §11).

## 2. Goals and non-goals

**Goals**
- A small **AIP-160 subset** grammar with comparisons, `AND`/`OR`/`NOT`, groups, and string substring
  using `:` (see §2.1), parsed by a quote-aware, schema-free lexer/parser.
- 1 parser → a validated `FilterExpr` tree → 1 parameterized PostgreSQL compiler shared by the
  handwritten-SQL and go-jet execution adapters.
- Per-field opt-in with a single `Filterable bool`; allowed operators **derived from the field codec**;
  enum-like fields validated against an optional **bounded value set** (§5.1).
- Endpoints that opt in **nothing** reject non-empty filters with `InvalidArgument`; empty filters keep
  normal list behavior (§5.3).
- Safe by construction: field names from a schema allowlist only; values always bound parameters; the
  **frontend** escapes user text into quoted literals so it can't inject filter grammar (§7, §9).
- `InvalidArgument` errors for bad filters, consistent with `order_by` and `page_token`.
- Cursor consistency preserved (already implemented with the token filter hash).
- An initial backend vertical slice (`ListRoleOwnedObjects` and `ListRoleDefaultPrivileges`) with API and
  integration coverage. UI server-filtering is Phase F2 because today's owned-objects query feeds
  summary state as well as table rows (§7).

**Non-goals for this iteration** are deliberate AIP-160 omissions (see §2.1):
- Arbitrary field traversal beyond exact schema-allowlisted paths, full `:` HAS semantics for repeated,
  map, or message fields, function calls (including legacy `.contains()`), bare fuzzy-match terms, and
  `*` wildcards.
- Strict AIP enum-name semantics for `object_type` and `privilege` (we filter on the stored token; §2.1).
- Matching all non-`page_size` arguments in the page token (parent and database scope are not enforced; §13).
- Changing the keyset pagination model (still cursor-based AIP-132).
- Removing the per-page catalog scan on live endpoints (see §10).
- A dedicated server facets/count RPC. The frontend preserves unfiltered summary data and uses it for facets.

### 2.1 Relationship to AIP-160 (a documented subset)

We implement a **subset** of [AIP-160](https://google.aip.dev/160), not the full grammar. The narrower
scope is a deliberate complexity trade-off. The surface includes everything the UI needs (kind tabs,
a search box, and the cached lists' `is_system_*` and `owner` filters) and nothing more.

**Supported:** `=`, `!=`, `<`, `<=`, `>`, `>=`, string `:` substring, `AND`, `OR`, `NOT`/`-`,
parenthesized groups, and exact schema-allowlisted dotted field paths. Values are quoted strings/RFC
3339 timestamps, bare booleans, or bare integers.

**Deliberately omitted (documented deviations):**
- Arbitrary field traversal, `*`/wildcard matching, function calls (including `.contains()`), bare
  fuzzy-match terms, and the full AIP-160 `:` semantics for repeated, map, or message presence checks.
  A non-empty unsupported construct → `InvalidArgument`, never silently ignored.
- We keep Querylane's established **`:` spelling** for case-insensitive scalar substring search. Public
  proto declarations mark this AIP-160 deviation `aip.dev/not-precedent` so strict AIP surfaces do not
  copy it.
- **Enum fields** (`object_type`, `privilege`) are filtered on their **stored string token**
  (`"TABLE"`, `"VIEW"`, and similar tokens; the proto enum name minus the `GRANT_OBJECT_TYPE_` prefix; the DB column is
  this token and is mapped to the proto enum only at the API boundary, `service.go:414-451`), **not** the
  canonical proto enum name. Rationale: the catalog columns are denormalized strings
  (`list_role_owned_objects.sql` emits tokens such as `'TABLE'`) and Querylane's own UI is the sole client (it
  already owns the slug↔token mapping). Enum-like fields carry a **bounded value set** (§5.1) so a bad
  token returns `InvalidArgument` rather than silently empty.

This is **AIP-160-inspired**, not wire-compatible with a strict AIP-160 client: we implement only a
small `:` subset and use stored enum tokens (not canonical enum names). This behavior supports Querylane's UI. Revisit it if filtering is exposed to third-party AIP clients.

If full AIP-160 is needed later, `go.einride.tech/aip/filtering` provides a real parser; we would still
write our own lowering to the shared PostgreSQL clauses. That dependency is not warranted for this subset.

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

Uses AIP-160's `:` spelling for the substring operation we need; see §2.1 for how this narrows the
full AIP-160 language.

```
restriction := field op value
field       := IDENT { "." IDENT }
simple      := "(" expression ")" | restriction
term        := [ "NOT" | "-" ] simple
factor      := term { "OR" term }
expression  := factor { "AND" factor }
op          := "=" | "!=" | ":" | "<" | "<=" | ">" | ">="
value       := quoted-string | bare-bool | bare-int
```

As required by AIP-160, `OR` binds tighter than `AND`. Keywords are case-insensitive.

Examples the UI sends:
- Kind tab: `object_type = "TABLE"`
- Search box: `object_name:"orders"`
- Combined: `object_type = "VIEW" AND object_name:"user"`
- Cross-field search: `(object_name:"orders" OR schema_name:"orders")`
- System filter (cached lists): `is_system_database = false`

**Decisions**
- **Expression tree:** `FilterAnd`, `FilterOr`, `FilterNot`, and `FilterCondition` preserve grouping
  and AIP-160 precedence for the shared compiler.
- **Field paths:** the parser accepts dotted identifiers, but schema validation requires the complete
  path to be explicitly allowlisted. It never performs implicit or reflective traversal.
- **`:`** means a case-insensitive substring for string fields (the search-box operator). See §5.4 for
  the SQL form and escaping. This is not the full AIP-160 HAS operator for repeated, map, or message fields.
- **Typed comparisons:** integers use bare literals; timestamps use quoted RFC 3339 values. Both support
  equality, inequality, and ordered comparisons.
- **Enum values use the stored token** (`object_type = "TABLE"`, not `"GRANT_OBJECT_TYPE_TABLE"`), per
  §2.1; validated against the field's bounded set (§5.1).
- **Quoted values are opaque**: a string value may contain spaces, logical keywords, operators, or
  parentheses. The parser is quote-aware and value contents are not structural tokens.
- **String escaping (precise):** inside a double-quoted value `\\`→`\` and `\"`→`"`; inside a
  single-quoted value `\\`→`\` and `\'`→`'`. A backslash before any other character, or a trailing
  dangling backslash, is `InvalidArgument`. Operator-looking content inside quotes is literal;
  `name = ":"` and `name = "a!=b"` are each a single equality condition (parser tests, §8).
- **Whitespace-only filters normalize to empty.** `BuildPlan` trims `params.Filter` once and uses the
  trimmed value for **both** hashing and parsing, so `" "` and `""` are equivalent and never trigger a
  spurious `ErrFilterMismatch` across pages.

## 5. Backend design

### 5.1 `Field` change (`backend/aip/schema.go`)

Add a field with a safe 0 value (existing call sites compile unchanged):

```go
type Field[Model any] struct {
    Codec           CursorCodec
    DisableOrdering bool
    GetValue        func(m *Model) any
    Filterable      bool     // NEW. Zero value = not filterable.
    FilterValues    []string // NEW, optional. Bounded value set for enum-like fields; nil = unbounded.
}
```

`FilterValues` is the small **value-validation layer** the review asked for. When non-empty, a `=` or `!=`
value not in the set → `InvalidArgument` (so `object_type = "TABEL"` fails clearly instead of returning
0 rows). A non-empty `FilterValues` also makes the field **equality-only** (operators `=` and `!=`,
**no** `:`). A bounded enum has no substring semantics; this subsumes the rejected `FilterOps` knob for
the only case that needed it. Set it for `object_type`, but the token set **differs by endpoint** (singular
tokens for owned objects and grants, plural tokens for default privileges; §5.8). Leave it nil for
`privilege` (the vocabulary depends on the PostgreSQL version; `MAINTAIN` arrived in PostgreSQL 17). An
unknown privilege harmlessly matches nothing rather than producing an error on a newer server. That asymmetry is
intentional UX: bounded, Querylane-defined object types reject typos early, while PostgreSQL-version-dependent
privileges stay forward-compatible.

PostgreSQL 17 `MAINTAIN` is supported as a grant display and filter token wherever PostgreSQL returns
it, including direct role grants, `PUBLIC` grants, and default privileges. Clients can filter these rows with
`privilege = "MAINTAIN"` without Querylane treating `MAINTAIN` as an invalid enum value.

`CursorCodec` now has a second use: it defines the field's filter value type and default operator set,
even when the field is `DisableOrdering: true`. That makes fields such as `is_system_*` intentionally
filterable without becoming valid `order_by` fields.

Avoid a third hand-maintained enum vocabulary in the schema files. Add shared token constants/slices in
`backend/engine` (for example `GrantObjectTypeTokens` and `DefaultPrivilegeObjectTypeTokens`) and use
them from both the `engine/postgres` schema `FilterValues` and the role service enum mapping switch. The
SQL `CASE` statements remain the database source, but Go should have 1 token list plus tests that the
mapping covers every token.

> **Rejected (review):** a `FilterOps []FilterOperator` override. No field in the rollout (§5.8) needs
> a non-default operator set; operators are derived from the codec (§5.3). Add an override later, as a
> named option only if a real field needs it. Keep the change strictly additive.

**Validation** (`NewSchema` → `validate()`, currently `schema.go:203-219`): the loop skips
`DisableOrdering` fields entirely today. Add, for any `Filterable` field (including
`DisableOrdering: true` ones like `is_system_*`):

- require a supported `Codec`; backend-specific `Bind` validation separately requires a Jet column or
  raw-SQL expression for every filterable path;
- **Do not** require `GetValue`. It is used only for cursor extraction of *order* fields, never for
  filtering. (Original spec wrongly required it; that would break the `is_system_*` fields, which omit
  `GetValue`.)

The current loop `continue`s on `DisableOrdering` *before* any checks, so this needs a small
**restructure**: a separate `if field.Filterable { … }` block that runs regardless of the
`DisableOrdering` early-continue (not a clause inside the existing orderable-only body).

Helper mirroring `allowedFields()` (`schema.go:237`), using modern stdlib:

```go
func (s *Schema[M]) filterableFields() []string {
    keys := make([]string, 0, len(s.fields))
    for path, f := range s.fields {
        if f.Filterable {
            keys = append(keys, path)
        }
    }
    return slices.Sorted(slices.Values(keys))
}
```

### 5.2 AST (`backend/aip/filter.go`)

```go
type FilterOperator int
const (
    OpEqual FilterOperator = iota
    OpNotEqual
    OpContains
    OpLess
    OpLessEq
    OpGreater
    OpGreaterEq
)

type FilterExpr interface { isFilterExpr() }
type FilterAnd struct { Operands []FilterExpr }
type FilterOr struct { Operands []FilterExpr }
type FilterNot struct { Operand FilterExpr }
type FilterCondition struct {
    Field    string
    Operator FilterOperator
    Value    any // string | bool | int64 | time.Time
}
```

`FilterCondition.Value` is the coerced value produced by schema-aware validation. `Plan` stores the
validated tree and exposes it through `ParsedFilter()` for the Jet, raw-SQL, and config-repository evaluators.

### 5.3 Parser and validation

- `parseFilter` uses a quote-aware lexer and recursive-descent parser. It trims empty input, bounds bytes,
  conditions, and nesting, then produces a schema-free raw expression tree.
- Parentheses and unary `NOT`/`-` are structural only outside quotes. Duplicate restrictions are allowed.
- **Non-opted-in endpoints:** `BuildPlan` accepts an empty filter but rejects a non-empty filter when the
  schema declares no filterable fields. Only schemas that opt in at least one field run parsing,
  validation, and compilation.
- **Schema-aware `validateFilter`** runs in `BuildPlan` after token validation and before cursor decoding.
  Every leaf must name a filterable field, use an operator allowed by its codec, coerce successfully,
  and satisfy `FilterValues` when present.
- **Operator allowlist** (unexported helper in `filter.go`): if the field has a non-empty `FilterValues`
  → **`=`, `!=` only** (bounded enum, no substring); else by codec: `StringCodec` → `=`, `!=`,
  `:`; `BoolCodec` → `=`, `!=`; `Int64Codec` and `TimestampCodec` → equality and ordered comparisons.
  `:` is `StringCodec`-only.
- **Limits (abuse guards):** reject filters over 1 KiB, more than 16 conditions, or more than 8 nesting
  levels before compilation.
- **Errors use `wrapAIPError(err, ErrInvalidFilter)`** (`plan.go:61`) so the sentinel isn't
  double-wrapped and `errors.Is` stays clean across the engine/storage re-exports. A
  `newFilterFieldError(path, filterableFields())` helper mirrors `newFieldError` (`order.go:112`) but
  wraps `ErrInvalidFilter` (never reuse `newFieldError`, which wraps `ErrInvalidOrderBy`).

Because the token already hashes the (normalized) raw filter, **changing the filter mid-pagination is
already rejected** with `ErrFilterMismatch` (`page.go:117`). No token-machinery change is needed.

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

### 5.7 Errors (`backend/aip/errors.go` and mappers)

- Add `var ErrInvalidFilter = errors.New("invalid filter parameter")`.
- Re-export in `backend/engine/errors.go` and `backend/storage/errors.go` (using the existing
  re-export comment format). Note that `ErrFilterMismatch` is **already** re-exported in both. Only
  `ErrInvalidFilter` is new.
- Map in `backend/connectrpc/apierrors/engine.go` (`MapEngineErr`) and `storage.go` (`MapRepoErr`) to
  `NewInvalidArgumentError(NewFieldViolation("filter", err.Error()))`, exactly like `order_by`.
- Remove the filter-rejection guards in `backend/service/role/service.go` as each endpoint is enabled.
  Done for the shared `openRoleDatabaseSession` guard (grants, owned objects, default privileges) and
  `ListPublicGrants` and `ListRoles`.

### 5.8 Per-endpoint enablement and field caveats

Enable an endpoint by marking fields `Filterable` in the schema and removing the service guard.
**Status:** all rows in the following table are enabled. The config-backed instance repository evaluates
the validated filter AST in memory so it matches the PostgreSQL-backed repository.
Enabled fields:

| Schema (file) | Path | Mark `Filterable` |
|---|---|---|
| `ownedObjectSchema` (engine/postgres/owned_objects.go) | live | `object_type`, `object_name`, `schema_name` |
| `defaultPrivilegeSchema` (engine/postgres/default_privileges.go) | live | `object_type`, `privilege`, `schema_name`, `creator_role_name` |
| `grantSchema` / `publicGrantSchema` (engine/postgres/{grants,public_grants}.go) | live | `object_type`, `object_name`, `schema_name`, `privilege`, `grantor` |
| `roleSchema` (engine/postgres/roles.go) | live | `role_name`, `attributes.can_login`, `attributes.is_superuser`, `attributes.can_replicate`, `is_system_role` |
| `tableSchema` (engine/postgres/tables.go) | live | `table_type` |
| `catalog{Database,Schema,Table}Schema` (storage/catalog/*.go) | jet | `name`, `owner`, `table_type` (tables), `is_system_*` |
| `catalogViewSchema` (storage/catalog/view.go) | jet | `name` |
| `instanceSchema` (storage/instance.go) | jet | `display_name` |

Caveats from review:
- **`is_system_role` is a computed SELECT alias** (`list_roles.sql`: `r.rolname LIKE 'pg\_%' … AS
  is_system_role`). PostgreSQL can't reference a SELECT alias in `WHERE`, so its raw-SQL binding must be
  the **full expression** `(r.rolname LIKE 'pg\_%' ESCAPE '\')`, not the alias. (Live grant/owned
  queries are wrapped as `… ) AS g`, so their `g.<col>` exprs are fine.)
- **`grantor` is `COALESCE`d to `''`** in the grant queries (not NULL), so `!=`/`:` behave
  correctly. Keep the COALESCE in any new query branch: it is load-bearing for filter correctness
  (a raw NULL would make `<> $n` silently drop rows).
- **`object_type` `FilterValues` differ by endpoint.** Owned objects, grants, and public grants use the
  **singular** tokens (`DATABASE, SCHEMA, TABLE, VIEW, MATERIALIZED_VIEW, SEQUENCE, FOREIGN_TABLE,
  FUNCTION, LARGE_OBJECT`); **default privileges** uses the **plural** tokens (`TABLES, SEQUENCES,
  FUNCTIONS, TYPES, SCHEMAS, LARGE_OBJECTS`, from `list_role_default_privileges.sql`). Reference the shared `backend/engine`
  token slices from §5.1 rather than spelling these lists again in every schema. `privilege` stays
  unbounded (version-dependent vocabulary).
- **`defaultPrivilegeSchema` also scans `with_grant_option`.** It stays non-filterable in v1 because
  the UI does not need it yet and the default-privilege identity is already covered by
  `(creator_role_name, schema_name, object_type, privilege)`. If needed later, add it as a
  `BoolCodec` field with `DisableOrdering: true` and `Filterable: true`.
- **Metadata database indexes:** the `is_system_*` and `owner` columns on `catalog_*` have **no btree index**
  (only the `name` trigram GIN). When enabling the jet path, add a migration with **partial btree
  indexes** for the common `is_system_* = false` filter, for example
  `CREATE INDEX … ON catalog_table (instance_id, database_name, schema_name, name) WHERE is_system_table = false`.

### 5.9 Comparisons and typed literals

Numeric and temporal comparisons ship in the shared engine. `Int64Codec` accepts bare signed integers;
`TimestampCodec` accepts quoted RFC 3339 timestamps. The shared compiler handles all comparison operators.
Endpoints still opt individual fields in with `Filterable`; support in the engine does not expose a field by default.

## 6. Vertical slice: live role lists (shared session opener)

`openRoleDatabaseSession` (`service.go`) is **shared** by `ListRoleGrants`, `ListRoleOwnedObjects`,
and `ListRoleDefaultPrivileges`, so removing its filter guard affects **all 3** at once. The
shipped slice therefore enables all 3 (plus `ListPublicGrants`, whose schema is the shared
`newGrantSchema`): their schema fields are `Filterable`, the shared guard and the `ListPublicGrants`
guard are removed, and each has integration coverage. A guard removal without a schema opt-in would
have regressed an endpoint from "rejects filters" to "silently ignores filters" against its proto
contract. This is why the slice includes `ListRoleGrants`. Endpoints without filterable fields reject
non-empty filters as described in §5.3.

The frontend completes the end-to-end slice by keeping bounded, unfiltered role/grant summaries for counts,
detail context, and facets while separate filtered requests supply role tables and grant drill-in rows.

## 7. Frontend design

Before F1, every role list used `paginateAll` (`frontend/src/lib/paginate-all.ts`) to fetch **all** pages
(`pageSize 1000`); `DataTable` filters, sorts, and paginates on the client; the count badge and "which kind
tabs to show" derive from the full array.

**Phase F1: complete — backend filter live and bounded frontend fetch.**
The owned-objects query (`role-detail-page.tsx:1216`) is **shared**: its `ownedObjects` array powers the
OWNS KPI and the `OWNER · N` hero badge (`:1455`, `:1539`), the overview reach rows, **and** the
`OwnedObjectsTable` drill-in (through `OwnsGrantsView`, `:1625`); and `KindFilteredTable` derives its visible
tabs from that array (`object-table.tsx:104`). **Filtering that query by table UI state would corrupt the
KPI, badge, and overview counts and collapse the kind tabs** (selecting *Table* would show `OWNER · 12` instead
of 3,549). F1 must not do this.
- F1 leaves the owned-objects data flow **unchanged** (unfiltered fetch; client-side kind tabs and search
  exactly as today), so every count and tab stays correct. The backend `filter` still lands and is proven by
  API and integration tests (§8); the **frontend consumes it in F2** (§7 Phase F2), where splitting the
  summary query from the table query makes UI filtering safe.
- Add a **`paginateUpTo(maxRows)`** variant (the current `paginateAll` has no cap) and apply it
  **unconditionally** to these hooks (cap ~2–5k), surfacing a "Showing first N results. Refine your search."
  banner using the existing `lastResponse`. This bounds the worst case (partitioned tables,
  PUBLIC-grant enumeration) even for the unfiltered `All` tab.

**Phase F2: complete — frontend server-side filtering with independent facets.**
This is where the UI sends a server `filter`, and it requires **splitting the data sources**:
- A **summary and facets query** (unfiltered) drives the KPIs, hero badge, overview, kind tabs, and
  per-kind counts. They stay complete regardless of the table filter. `KindFilteredTable` and
  `OwnedObjectsTable` take present kinds and counts from this query as **props** (not from their own `data`).
- A separate **table-slice query** (server-filtered and bounded to 1,000 rows) drives only the table rows.
  Build the filter with shared, tested `quoteFilterValue` and `buildOwnedFilter` helpers (§9). Never
  concatenate raw values. **Debounce** the search and require a **minimum length** (2 or 3 characters)
  before issuing a `:` substring filter. Short patterns have no extractable trigrams and degrade to a
  scan (§10). Reset the cursor
  on filter change.
- **Facets cost:** no count RPC is needed in this iteration. Existing bounded summary responses drive
  kind availability and counts; filtered table responses never overwrite that state.

Honor `frontend/AGENTS.md`: keep the `useTransport` and `useQuery` pattern in `role.ts`; build requests
with `create(Schema, …)`; keep `filter` and `pageToken` in client state and the query key.

## 8. Testing plan

Mirror `backend/aip` conventions: table-driven parser and validation cases, exact SQL and argument
assertions for `rawsql`, focused adapter assertions for `jet`, and no `-short` guard on I/O-free tests.

- **Parser** (`filter_test.go`): valid grammars → expected raw conditions; malformed → wrapped
  `ErrInvalidFilter`; empty and whitespace-only → `nil`; both quote styles; case-insensitive `AND`;
  `:` substring; `.contains(...)` rejected as an unsupported function call; **operator-looking content inside quotes** (`name = ":"`, `name = "a!=b"`,
  `name = "x AND y"`) parses as 1 condition; `\\`, `\"`, and `\'` unescape; a dangling backslash → error;
  exceeding `maxConditions` or `maxFilterBytes` → error.
- **`escapeLikePattern`** (`filter_test.go`): `%`, `_`, `\`, and combinations.
- **Shared compiler** (`rawsql/compile_test.go`): exact fully parenthesized `WHERE`, typed operators,
  bound values, filter-before-cursor ordering, tuple and mixed-direction cursors, and empty fragments.
- **Jet adapter** (`jet/raw_predicate_test.go`): `$1`/`$10` replacement, a preceding base argument,
  exact argument order, mixed cursors, typed ordering, and quoted identifiers.
- **Validation**: unknown field, non-filterable field, disallowed operator, or type mismatch →
  wrapped `ErrInvalidFilter`; message lists `filterableFields()`.
- **Service** (`service/role/service_test.go`): the "rejects filter" cases flip to "passes filter to
  engine" using `fakeOpener` and `fakeDatabaseSession`.
- **Integration** (`postgres_integration_test.go`, `-short`-guarded suite): `ListRoleOwnedObjects`
  filter by `object_type`, by `object_name:"..."`, and by both fields; the filter and cursor round trip
  (page 1 → next consistent under the same filter; changed filter → `ErrFilterMismatch`).
- **Catalog integration** (`storage/catalog/filter_integration_test.go`): canonical substring/equality
  filters, changed-filter token rejection, unknown fields, and rejection of legacy `.contains()`.
- **API errors**: `ErrInvalidFilter` → `InvalidArgument` with a `filter` field violation.
- **Frontend**: `paginateUpTo` caps role summaries without changing counts or tabs. Shared escaped filter
  builders have unit coverage; integration tests assert role, grant, Explorer, and palette request filters.

## 9. Security

- **Field names never become SQL identifiers directly** — user tokens must match declared schema paths;
  trusted expressions/typed columns come only from backend bindings.
- **Values are always bound parameters.** Both execution paths use the shared `$n` clause arguments;
  the Jet adapter converts placeholders to named `RawArgs` before go-jet assigns final positions.
- **`:`/ILIKE**: `escapeLikePattern` neutralizes `%`/`_`/`\` (default backslash escape, §5.4);
  read-only context. This is the only place user text reaches a pattern position.
- **Filter-grammar injection:** the frontend uses tested
  `quoteFilterValue`/`buildOwnedFilter` helper: `quoteFilterValue` escapes `\` and `"` and wraps the
  value in quotes. User search text is always a single escaped, quoted literal and cannot inject
  conditions or operators. The backend parser independently re-validates (unknown field or operator, bad escape,
  over-limit → `InvalidArgument`) regardless of client.
- **No new engine RPC surface** — the existing `filter` field simply becomes effective.

## 10. Performance

- **Live path: measure pushdown instead of assuming a barrier.** Filterable columns (for example,
  owned objects) are outputs of a `UNION ALL` over `pg_class` and `pg_proc`
  (`queries/list_role_owned_objects.sql`) wrapped
  as `… ) AS g`. PostgreSQL treats `UNION ALL` as an *append relation* and **can push outer
  qualifications into the arms** (subquery pull-up); for a constant `object_type` per arm it may even
  **prune** non-matching arms (`object_type = "TABLE"` ⇒ the `DATABASE`, `SCHEMA`, and `FUNCTION` arms are provably
  empty). So per-page scan cost may shrink more than a naive "filter on the outer query" reading
  suggests: **verify with `EXPLAIN`** rather than asserting a hard barrier. Regardless, the filter
  always collapses today's unbounded fetch-all into far fewer pages. If `EXPLAIN` shows the arms are
  *not* pruned under the kind filter, the follow-on is a single-branch query variant in Go (a TODO at
  `owned_objects.go`); the planner may make it unnecessary. Correctness does not depend on pushdown:
  `LIMIT N+1` (the keyset probe) is applied to the outer query and still bounds each page.
- **Jet path uses the existing trigram indexes** for `name:"..."` **only if** we emit `col ILIKE $n`
  (not `LOWER(col) LIKE …`); see §5.4 and §5.6. `is_system_* = false` equality is a sequential scan **until** the
  partial btree indexes in §5.8 are added; `owner` filters are always schema-scoped by the base
  condition, acceptable without a new index.
- **Parser, compiler, and filter-hash** cost is negligible (per request, on a short string; `hashFilter("")`
  early-returns).
- **Frontend:** bounded unfiltered summaries derive counts and tabs; filtered table queries are separately
  keyed, so search and kind changes cannot corrupt summary state.

## 11. Implementation map

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
- `service/role/service.go`: remove the shared opener guard (enables grants, owned objects, and default
  privileges) and the `ListPublicGrants` guard; drop the now-dead `filter` param from
  `openRoleDatabaseSession` and its call sites.
- `storage/catalog/`: mark the §5.8 fields `Filterable` and pass canonical AIP filters directly to the
  shared engine; no catalog-specific pre-parser or compatibility rewrite remains.
- `frontend/src/features/data-explorer/data-explorer-catalog-filter.ts`: emit `name:"..."` and escape
  backslashes plus double quotes for the selected string delimiter.
- `proto/…/role.proto`: replace the "Reserved for future … rejects non-empty filters" comments on the
  enabled requests with the supported filters; update existing `database/schema/table/view` comments
  from `.contains()` examples to `field:"..."`; run `task proto:generate` (never hand-edit `protogen/`).

**Frontend (F1/F2):**
- `lib/paginate-all.ts`: add `paginateUpTo(maxRows)`.
- `hooks/api/role.ts`: cap role summaries, expose single-page filtered role/grant queries, and keep filters
  in their query keys.
- `lib/aip-filter.ts`: quote user values and compose catalog, role-kind, owned-object, and grant filters.
- Role/grant views: preserve summary/facet inputs while filtered requests supply table rows and partial states.
- Explorer and command palette: send `name:"..."` filters; the palette limits result sets.

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
7. **Frontend:** bounded unfiltered summaries feed KPIs/overview/tabs; split table queries send escaped
   server filters and expose partial-result states (§7).
8. **`is_system_role`:** when enabled, its raw-SQL binding must be the full LIKE expression, not the
   SELECT alias.
9. **Jet adapter:** typed columns are validated at bind time, converted to trusted quoted expressions,
   and passed through the shared compiler. Bound raw predicates are embedded with `RawBool`; Jet owns
   final placeholder numbering after base conditions.

## 13. Open questions (for implementation)

- Verify with `EXPLAIN` whether PostgreSQL prunes / pushes into the owned-objects `UNION ALL` arms under
  a kind filter (§10) — decides whether the single-branch query variant is worth building.
- ~~`paginateUpTo` cap value.~~ **Resolved:** role summaries cap at 5,000; grant table slices cap at one
  1,000-row server page and ask the user to refine filters when more rows exist.
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
