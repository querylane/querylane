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
spelling, `name.contains('...')`, through a pre-parser (now a translation shim; see the §3 callout).

The framework already compiles a validated query *plan* to **2 backends**: go-jet
(`backend/aip/jet.go`, metadata database and catalog-cache reads through `aip.Execute` and
`ExecuteWithCondition`) and raw SQL (`backend/aip/sql.go` and `sql_execute.go`, live target-instance
reads through `aip.ExecuteSQL`).
Cursor predicates and `ORDER BY` already have a compiler in each. **Filtering becomes another concern
that follows the exact same dual-compiler pattern**, reusing the existing helpers (`joinPredicates`,
the shared `sqlBuilder`, `combineJetConditions`, `equalityExpr`). Implemented once in `aip`, every
cached or live list endpoint gains filtering by declaring which fields are filterable.

This revision trims the original design: **no `Filter` wrapper struct, no `FilterOps` override, and no
new abstractions**. It adds about 100 lines across the existing files (see §11).

## 2. Goals and non-goals

**Goals**
- A small **AIP-160 subset** grammar with comparisons, `AND`/`OR`/`NOT`, groups, and string substring
  using `:` (see §2.1), parsed by a quote-aware, schema-free lexer/parser.
- 1 parser → a validated `FilterExpr` tree → 2 compilers (Jet and raw SQL), reusing existing helpers.
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
- Field traversal (`a.b.c`), full `:` HAS semantics for repeated, map, or message fields, function calls
  (including legacy `.contains()`), bare fuzzy-match terms, and `*` wildcards.
- Strict AIP enum-name semantics for `object_type` and `privilege` (we filter on the stored token; §2.1).
- Matching all non-`page_size` arguments in the page token (parent and database scope are not enforced; §13).
- Changing the keyset pagination model (still cursor-based AIP-132).
- Removing the per-page catalog scan on live endpoints (see §10).
- A dedicated server facets/count RPC. The frontend preserves unfiltered summary data and uses it for facets.

### 2.1 Relationship to AIP-160 (a documented subset)

We implement a **subset** of [AIP-160](https://google.aip.dev/160), not the full grammar. The narrower
scope is a deliberate complexity trade-off. The surface includes everything the UI needs (kind tabs,
a search box, and the cached lists' `is_system_*` and `owner` filters) and nothing more.

**Supported:** `=`, `!=`, `<`, `<=`, `>`, `>=`, string `:` substring, `AND`, `OR`, `NOT`/`-`, and
parenthesized groups. Values are quoted strings/RFC 3339 timestamps, bare booleans, or bare integers.

**Deliberately omitted (documented deviations):**
- Field traversal, `*`/wildcard matching, function calls (including `.contains()`), bare fuzzy-match
  terms, and the full AIP-160 `:` semantics for repeated, map, or message presence checks. A non-empty
  unsupported construct → `InvalidArgument`, never silently ignored.
- We use AIP-160's **`:` spelling** for string substring now, while filters are still ignored or rejected and
  no client can depend on the older `.contains()` comments. Update the existing
  database, schema, table, and view proto comments to `name:"..."` in the same implementation pass.
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
write our own lowering to the Jet and SQL plans. That dependency is not warranted for this subset.

## 3. Background: where does each list come from?

2 read paths exist; the filter must be honored on **both** and compiled differently.

| Path | Source | aip entry | Compiler | Endpoints |
|---|---|---|---|---|
| **Metadata database (catalog cache)** | Querylane's own PostgreSQL database, synced from instances | `aip.Execute` or `ExecuteWithCondition` → go-jet | `jet.go` | `ListDatabases`, `ListSchemas`, `ListTables`, `ListViews`, `ListInstances` |
| **Live target instance** | target's `pg_catalog`, queried directly | `aip.ExecuteSQL` → raw SQL | `sql.go` | `ListRoles`, `ListRoleGrants`, `ListRoleOwnedObjects`, `ListRoleDefaultPrivileges`, `ListPublicGrants` |

A `Field` carries both a go-jet `Column` (Jet path) and a raw `SQLExpr` (SQL path); the filter compiler
uses whichever the endpoint's backend needs.

> **Behavior-change callout (resolved).** Before this rollout, `ListDatabases`, `ListSchemas`, `ListTables`, and `ListViews`
> did **not** silently ignore filters: a legacy pre-parser (`storage/catalog/filter.go`) accepted
> exactly `name.contains('...')` (compiled to `REGEXP_LIKE`) and rejected every other non-empty filter
> with `InvalidArgument`. The legacy grammar and the new `:` grammar were therefore mutually rejecting.
> The rollout replaced the pre-parser with `normalizeLegacyCatalogFilter`, a **translation shim** that
> rewrites the legacy spelling `name.contains('X')` to `name:'X'` (identical escape rules, so the
> quoted content is carried verbatim) and hands everything else to the engine unchanged. Old SPA
> bundles keep working; the engine compiles both spellings to `ILIKE` on the trigram-indexed `name`
> columns; the proto comments now document the `:` grammar. Remove the shim once no pre-rollout
> frontend remains in service.
> Note `TestListDatabasesFilterIsTokenOnly` covers the **live engine** `ListDatabases` (0
> filterable fields → no-op rule), not the cached catalog list; it still asserts the ignore behavior
> and is unaffected. The catalog lists are covered by `TestIntegrationCatalogListAIPFilterGrammar`.

## 4. Filter grammar (the supported subset)

Uses AIP-160's `:` spelling for the substring operation we need; see §2.1 for how this narrows the
full AIP-160 language.

```
restriction := field op value
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
  and AIP-160 precedence for both compilers.
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

### 5.4 `:` string substring: SQL form, escaping, and the ILIKE decision

**Decision: `ILIKE` on both backends**, as `<expr> ILIKE $n` with the bound value
`"%" + escapeLikePattern(term) + "%"`, where unexported `escapeLikePattern` escapes `\`, `%`, `_`.
**No explicit `ESCAPE` clause**: PostgreSQL's default `LIKE`/`ILIKE` escape character is already the
backslash, and because the pattern is a **bound parameter** (not a string literal) it is not subject to
`standard_conforming_strings`. Dropping `ESCAPE` keeps the go-jet construction simple (`BinaryOperator`,
§5.6) and avoids a `CustomExpression`/`Token` dance.

Rationale:
- The meta tables **already have `pg_trgm` GIN indexes on every `name` column**
  (`backend/storage/migrations/0001_initial.sql`). `col ILIKE '%term%'` uses those indexes; the
  alternatives **silently disable them**: `LOWER(col) LIKE LOWER($n)` can't use an index on the raw
  column, and `strpos(lower(col), …) > 0` can't either. So **do not** use `LOWER(col) LIKE …`. (Per the
  pg_trgm docs, very short or wildcard-only patterns degrade to a scan, which is acceptable here.)
- `ILIKE` is case-insensitive natively (no `LOWER` needed) and marginally cheaper per row on the live path.
- `escapeLikePattern` neutralizes user `%`, `_`, and `\` so a search for `"50%"` matches the literal,
  not a wildcard. It gets a focused unit test for the metacharacter cases, and the Jet and SQL
  compilers get a `DebugSql()` or string assertion confirming the emitted `ILIKE $n`.

> **Rejected:** `strpos` or `POSITION` (simpler escaping, but forfeits the existing trigram indexes and
> causes a performance regression on the cached path). Escaping adds only a small, tested helper.

### 5.5 SQL compiler (`backend/aip/sql.go`): live path

Add `buildSQLFilterPredicate[M](b *sqlBuilder, fields Fields[M], conds []FilterCondition) (string, error)`.
Create a parameterized fragment for each condition and join the fragments with `AND`:
- `OpEqual`: `(<SQLExpr> = $n)`
- `OpNotEqual`: `(<SQLExpr> <> $n)`
- `OpContains` (`:`): `(<SQLExpr> ILIKE $n)`, arg = `"%"+escapeLikePattern(v)+"%"` (default backslash escape, §5.4)

**Parameter ordering (invariant, not a style note):** placeholders are positional, so build the filter
predicate **first**, then the cursor predicate, **sharing the same `sqlBuilder`**, inside
`buildSQLClauses`. Combine, **skipping empty fragments** (critical: `joinPredicates` does **not** skip
`""`, so `joinPredicates(["", cursor], "AND")` would emit invalid `() AND (cursor)`):

```go
func buildSQLClauses[M any](schema *Schema[M], plan *Plan, placeholderStart int) (*SQLClauses, error) {
    b := sqlBuilder{next: placeholderStart}
    // Filter params MUST precede cursor params (placeholder numbering is positional).
    filterWhere, err := buildSQLFilterPredicate(&b, schema.fields, plan.parsedFilter) // $n first
    // ... cursorWhere uses the SAME &b, continuing the numbering ...
    var parts []string
    if filterWhere != "" { parts = append(parts, filterWhere) }
    if cursorWhere != "" { parts = append(parts, cursorWhere) }
    where := joinPredicates(parts, "AND") // existing helper; parenthesizes each branch
    return &SQLClauses{Where: where, Args: b.args, OrderBy: orderBy, Limit: plan.PageSize + 1}, nil
}
```

`assembleSQLQuery` (`sql_execute.go`) is **unchanged**: it appends the single combined `clauses.Where`
with `WHERE` and `AND` according to `SQLQuery.HasWhere`. Document in a comment that the filter and
cursor are combined inside `buildSQLClauses`; `assembleSQLQuery` must stay unaware of the distinction.

### 5.6 Jet compiler (`backend/aip/jet.go`): cached path

Add `buildJetFilterCondition[M](fields Fields[M], conds []FilterCondition) (postgres.BoolExpression, error)`,
combined at `execute.go:63` through the already-variadic, nil-safe `combineJetConditions`:

```go
if where := combineJetConditions(baseCondition, filterCond, cursorCond); where != nil {
    stmt = stmt.WHERE(where)
}
```

Reuse, don't duplicate, the type-switch:
- `OpEqual` and `OpNotEqual`: route through the existing `equalityExpr` (`jet.go:143`). Extend it with an
  operator argument (or add a thin `inequalityExpr` peer) so `=` and `<>` share 1 type switch over
  strings, booleans, and integers.
- `OpContains` (`:`): type-assert the column to `postgres.StringExpression` (exactly as `equalityExpr` does
  at `jet.go:147`; error if it is not because substring is `StringCodec`-only). Emit `col ILIKE $n` using
  `postgres.BoolExp(postgres.BinaryOperator(col, postgres.String(pattern), "ILIKE"))`, pattern =
  `"%"+escapeLikePattern(v)+"%"` (no `ESCAPE` clause needed, §5.4). Add a **`Sql()`** assertion (it keeps
  `$n` placeholders; `DebugSql()` inlines literals) that the emitted SQL is `… ILIKE $n` (not
  `LOWER(col) LIKE …`, which would break the trigram index).

`len(conds) == 0` → returns `nil` (no-op). `combineJetConditions` already guards
`postgres.AND()`-on-empty.

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
| `roleSchema` (engine/postgres/roles.go) | live | `name` (+ `is_system_role`, see caveat) |
| `tableSchema` (engine/postgres/tables.go) | live | `table_type` |
| `catalog{Database,Schema,Table}Schema` (storage/catalog/*.go) | jet | `name`, `owner`, `table_type` (tables), `is_system_*` |
| `catalogViewSchema` (storage/catalog/view.go) | jet | `name` |
| `instanceSchema` (storage/instance.go) | jet | `display_name`, `id` (note: `instance` has no `name` trigram index) |

Caveats from review:
- **`is_system_role` is a computed SELECT alias** (`list_roles.sql`: `r.rolname LIKE 'pg\_%' … AS
  is_system_role`). PostgreSQL can't reference a SELECT alias in `WHERE`, so its `Field.SQLExpr` must be
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
`TimestampCodec` accepts quoted RFC 3339 timestamps. Jet and raw SQL compile all comparison operators.
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

Mirror `backend/aip` conventions (table-driven, standard library `t.Fatalf`, exact SQL string and
argument-count assertions; `newTestSchema()` for Jet, `newTestSQLSchema()` for SQL; no `-short` guard
on the I/O-free unit tests).

- **Parser** (`filter_test.go`): valid grammars → expected raw conditions; malformed → wrapped
  `ErrInvalidFilter`; empty and whitespace-only → `nil`; both quote styles; case-insensitive `AND`;
  `:` substring; `.contains(...)` rejected as an unsupported function call; **operator-looking content inside quotes** (`name = ":"`, `name = "a!=b"`,
  `name = "x AND y"`) parses as 1 condition; `\\`, `\"`, and `\'` unescape; a dangling backslash → error;
  exceeding `maxConditions` or `maxFilterBytes` → error.
- **`escapeLikePattern`** (`filter_test.go`): `%`, `_`, `\`, and combinations.
- **SQL compiler** (`sql_test.go`): assert the exact `WHERE` fragment **and `$n` ordering when
  combined with a cursor** (the empty-fragment and filter-before-cursor cases explicitly).
- **Jet compiler**: assert using the statement's **`Sql()`** method (parameterized, keeps `$n`; not
  `DebugSql()`, which inlines literals). No `jet_test.go` exists, so add minimal coverage, including that `:` emits
  `ILIKE $n` (not `LOWER … LIKE`).
- **Validation**: unknown field, non-filterable field, disallowed operator, or type mismatch →
  wrapped `ErrInvalidFilter`; message lists `filterableFields()`.
- **Service** (`service/role/service_test.go`): the "rejects filter" cases flip to "passes filter to
  engine" using `fakeOpener` and `fakeDatabaseSession`.
- **Integration** (`postgres_integration_test.go`, `-short`-guarded suite): `ListRoleOwnedObjects`
  filter by `object_type`, by `object_name:"..."`, and by both fields; the filter and cursor round trip
  (page 1 → next consistent under the same filter; changed filter → `ErrFilterMismatch`).
- **Existing test that breaks (cached-list rollout):** `postgres_integration_test.go:613`
  `TestListDatabasesFilterIsTokenOnly` asserts today's no-op (filtered == unfiltered); it breaks
  deterministically once `catalogDatabaseSchema.owner` becomes `Filterable`. Rewrite it then to assert
  filtered results, keeping the changed-filter → `ErrFilterMismatch` half. (Distinct from the
  known-flaky `TestCreateInstance_Success` and `TestDeleteInstance_Success`.)
- **API errors**: `ErrInvalidFilter` → `InvalidArgument` with a `filter` field violation.
- **Frontend**: `paginateUpTo` caps role summaries without changing counts or tabs. Shared escaped filter
  builders have unit coverage; integration tests assert role, grant, Explorer, and palette request filters.

## 9. Security

- **Field names never come from user input**: the parser maps user tokens to declared schema fields;
  unknown/non-filterable fields error. Column/`SQLExpr` come only from the schema.
- **Values are always bound parameters** (`$n` on the SQL path; `postgres.String` or `postgres.Bool`
  literals on the Jet path). No string interpolation of values into SQL.
- **`:` and `ILIKE`**: `escapeLikePattern` neutralizes `%`, `_`, and `\` (default backslash escape,
  §5.4) in a read-only context. This is the only place user text reaches a pattern position.
- **Filter-grammar injection:** the frontend uses tested
  `quoteFilterValue`/`buildOwnedFilter` helper: `quoteFilterValue` escapes `\` and `"` and wraps the
  value in quotes. User search text is always a single escaped, quoted literal and cannot inject
  conditions or operators. The backend parser independently re-validates (unknown field or operator, bad escape,
  over-limit → `InvalidArgument`) regardless of client.
- **No new engine RPC surface**: the existing `filter` field simply becomes effective.

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

## 11. Leanest v1: file-by-file delta

**Backend (`backend/aip/`):**
- `filter.go`: comparison operators, raw and validated expression trees, the quote-aware schema-free
  `parseFilter`, schema-aware `validateFilter` (coercion, `FilterValues` bounds, and codec operations
  through `allowedOps`), `newFilterFieldError`, `escapeLikePattern`.
- `schema.go`: add `Filterable bool` and optional `FilterValues []string` to `Field`; extend `validate()`
  for filter codecs independently of ordering; add `filterableFields()`.
- `plan.go`: add the validated filter expression to `Plan`; trim `params.Filter`; if the
  schema has 0 filterable fields, reject non-empty input; otherwise, parse and validate in `BuildPlan`
  between `validateToken` and `decodeCursorValues`, using `wrapAIPError`.
- `errors.go`: add `ErrInvalidFilter`.
- `sql.go`: add `buildSQLFilterPredicate`; in `buildSQLClauses`, build filter first (shared `sqlBuilder`)
  and combine skipping empty fragments.
- `jet.go`: add `buildJetFilterCondition` (reusing `equalityExpr`); combine at `execute.go:63`.
- `engine/errors.go`, `storage/errors.go`: re-export `ErrInvalidFilter`.
- `connectrpc/apierrors/{engine,storage}.go`: add `ErrInvalidFilter` → `filter` field violation.

**Per-endpoint (the slice):**
- `engine/postgres/owned_objects.go`, `default_privileges.go`, and `grants.go` (shared by role and `PUBLIC`
  grants). Add `Filterable: true` to the listed fields and `FilterValues:` on `object_type` from the
  shared `backend/engine` token slices. The sets differ by endpoint: singular tokens for owned
  objects/grants, plural tokens for default privileges (§5.8).
- `service/role/service.go`: remove the shared opener guard (enables grants, owned objects, and default
  privileges) and the `ListPublicGrants` guard; drop the now-dead `filter` param from
  `openRoleDatabaseSession` and its call sites.
- `storage/catalog/`: mark the §5.8 fields `Filterable`; replace the `catalogNameContainsFilter`
  pre-parser with the `normalizeLegacyCatalogFilter` translation shim (§3 callout).
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

About 100 lines of new backend code, no new dependencies, no new abstractions.

## 12. Resolved decisions

1. **Subset, not full AIP-160** (AIP-160-*inspired*, not wire-compatible; §2.1): comparisons, string
   substring using `:`, logical operators, and groups. Enum fields are filtered on the stored token with a bounded `FilterValues` set
   that also makes them **equality-only** (no `:`); token sets differ per endpoint (singular for
   owned/grants, plural for default privileges) and live in shared `backend/engine` token slices.
   Documented deviations; no silent unsupported syntax.
2. **`:` substring:** `ILIKE` on both backends (uses the existing trigram GIN indexes); `escapeLikePattern`
   and the **default** backslash escape (no explicit `ESCAPE`, §5.4).
3. **Allowed operators:** `FilterValues`-bounded → `=` and `!=` only; otherwise, derive from `Codec`;
   no `FilterOps` override. Abuse guards bound bytes, conditions, and nesting (§5.3).
4. **Parser vs validation:** `parseFilter` is lexical and schema-free; coercion, bounds, and operator checks live in
   schema-aware `validateFilter`.
5. **Explicit support:** endpoints with 0 `Filterable` fields reject non-empty filters (§5.3).
6. **AST:** validated `FilterAnd`/`FilterOr`/`FilterNot`/`FilterCondition` tree.
7. **Frontend:** bounded unfiltered summaries feed KPIs/overview/tabs; split table queries send escaped
   server filters and expose partial-result states (§7).
8. **`is_system_role`:** filterable, but its `SQLExpr` must be the full LIKE expression, not the alias.
9. **Jet `:` substring:** `col ILIKE $n` using go-jet `BinaryOperator`/`BoolExp`, column type-asserted to
   `StringExpression`, asserted with **`Sql()`** (keeps `$n`; not `DebugSql()`).

## 13. Open questions (for implementation)

- Verify with `EXPLAIN` whether PostgreSQL prunes / pushes into the owned-objects `UNION ALL` arms under
  a kind filter (§10), which determines whether the single-branch query variant is worth building.
- ~~`paginateUpTo` cap value.~~ **Resolved:** role summaries cap at 5,000; grant table slices cap at one
  1,000-row server page and ask the user to refine filters when more rows exist.
- ~~Whether to enable the cached-list (`ListDatabases/Schemas/Tables/Views`) filters in the same release
  as the live slice or stage them after.~~ **Resolved: enabled with the live slice**, with a legacy
  `name.contains('...')` translation shim for pre-rollout SPA bundles (§3 callout). The Explorer now emits
  `name:"..."`; remove the shim after the compatibility window. Also add the
  §5.8 partial btree indexes for `is_system_*` if those filters show up in slow-query logs.
- **AIP-158 follow-up (not blocking):** page tokens enforce filter/order/resource type but not
  parent/database scope (`proto/querylane/common/v1/pagination.proto`). AIP-158 wants all non-`page_size`
  arguments stable across page turns; add scope to the token hash later if "AIP-compatible" becomes the standard.
- If full AIP-160 (`OR`, wildcards, traversal, full `:` HAS semantics) is ever required, adopt
  `go.einride.tech/aip/filtering` for parsing and write our own lowering. That work is out of scope.
