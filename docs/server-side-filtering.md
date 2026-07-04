# Spec: Server-side filtering for list endpoints (AIP-160-inspired subset)

> Status: **IMPLEMENTED (backend)** — the `backend/aip` filter engine, the live slice
> (`ListRoleOwnedObjects`, `ListRoleDefaultPrivileges`, `ListRoleGrants`, `ListPublicGrants`), and the
> cached catalog lists (`ListDatabases/Schemas/Tables/Views`, with a legacy `name.contains('...')`
> translation shim for pre-rollout SPA bundles) all ship. `ListRoles` and `ListInstances` still reject /
> ignore filters pending their data-flow splits. Frontend phases F1/F2 (§7) are not implemented yet.
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
spelling, `name.contains('...')`, via a pre-parser (now a translation shim — see the §3 callout).

The framework already compiles a validated query *plan* to **two backends** — go-jet
(`backend/aip/jet.go`, meta-DB / catalog-cache reads via `aip.Execute`/`ExecuteWithCondition`) and
raw SQL (`backend/aip/sql.go` + `sql_execute.go`, live target-instance reads via `aip.ExecuteSQL`).
Cursor predicates and `ORDER BY` already have a compiler in each. **Filtering becomes a third concern
that follows the exact same dual-compiler pattern**, reusing the existing helpers (`joinPredicates`,
the shared `sqlBuilder`, `combineJetConditions`, `equalityExpr`). Implemented once in `aip`, every
list endpoint — cached or live — gains filtering by declaring which fields are filterable.

This revision deliberately trims the original design: **no `Filter` wrapper struct, no `FilterOps`
override, no new abstractions** — ~100 lines across the existing files (see §11).

## 2. Goals / non-goals

**Goals**
- A small **AIP-160 subset** grammar (equality, inequality, string substring via `:`, `AND` — see §2.1),
  parsed by a tiny **quote-aware, schema-free** scanner; coercion/validation happen later (§5.3).
- One parser → a flat `[]FilterCondition` → two compilers (jet + raw SQL), reusing existing helpers.
- Per-field opt-in via a single `Filterable bool`; allowed operators **derived from the field codec**;
  enum-like fields validated against an optional **bounded value set** (§5.1).
- Endpoints that opt in **nothing** keep today's no-op behavior (filter ignored, not rejected) — so
  enablement is purely additive with **no regression** (§5.3).
- Safe by construction: field names from a schema allowlist only; values always bound parameters; the
  **frontend** escapes user text into quoted literals so it can't inject filter grammar (§7, §9).
- `InvalidArgument` errors for bad filters, consistent with `order_by`/`page_token`.
- Cursor consistency preserved (already implemented via the token filter-hash).
- A first backend vertical slice (`ListRoleOwnedObjects` + `ListRoleDefaultPrivileges`) with API and
  integration coverage. UI server-filtering is Phase F2 because today's owned-objects query feeds
  summary state as well as table rows (§7).

**Non-goals (this iteration)** — deliberate AIP-160 omissions, see §2.1:
- `OR`, `NOT`, nested groups, field traversal (`a.b.c`), full `:` HAS semantics for repeated/map/message
  fields, function calls (including legacy `.contains()`), comparison operators (`<`, `>=`, …), and `*`
  wildcards.
- Strict AIP enum-name semantics for `object_type`/`privilege` (we filter on the stored token — §2.1).
- Matching all non-`page_size` args in the page token (parent/database scope not enforced — §13).
- Changing the keyset pagination model (still cursor-based AIP-132).
- Removing the per-page catalog scan on live endpoints (see §10).
- Frontend cursor pagination + facets (deferred to Phase F2, §7).

### 2.1 Relationship to AIP-160 (a documented subset)

We implement a **subset** of [AIP-160](https://google.aip.dev/160), not the full grammar — a deliberate
complexity trade-off. The surface is everything the UI needs (kind tabs + a search box + the cached
lists' `is_system_*`/`owner` filters) and nothing more.

**Supported:** `field = value`, `field != value`, `field:"substr"` (case-insensitive string
substring), and top-level `AND`. Values are quoted strings or the bare bools `true`/`false`.

**Deliberately omitted (documented deviations):**
- `OR`, `NOT`, parenthesized groups, field traversal, comparison operators, `*`/wildcard matching,
  function calls (including `.contains()`), and the full AIP-160 `:` semantics for repeated/map/message
  presence checks. A non-empty unsupported construct → `InvalidArgument`, never silently ignored.
- We use AIP-160's **`:` spelling** for string substring now, while filters are still no-op/rejected and
  no client can depend on the older `.contains()` comments. Update the existing
  `database/schema/table/view` proto comments to `name:"..."` in the same implementation pass.
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
write our own lowering to the jet/SQL plans. Not warranted for this subset.

## 3. Background: where does each list come from?

Two read paths; the filter must be honored on **both**, compiled differently.

| Path | Source | aip entry | Compiler | Endpoints |
|---|---|---|---|---|
| **Meta DB (catalog cache)** | querylane's own Postgres, synced from instances | `aip.Execute` / `ExecuteWithCondition` → go-jet | `jet.go` | `ListDatabases`, `ListSchemas`, `ListTables`, `ListViews`, `ListInstances` |
| **Live target instance** | target's `pg_catalog`, queried directly | `aip.ExecuteSQL` → raw SQL | `sql.go` | `ListRoles`, `ListRoleGrants`, `ListRoleOwnedObjects`, `ListRoleDefaultPrivileges`, `ListPublicGrants` |

A `Field` carries both a go-jet `Column` (jet path) and a raw `SQLExpr` (sql path); the filter compiler
uses whichever the endpoint's backend needs.

> **Behavior-change callout (resolved).** Before this rollout, `ListDatabases/Schemas/Tables/Views`
> did **not** silently ignore filters: a legacy pre-parser (`storage/catalog/filter.go`) accepted
> exactly `name.contains('...')` (compiled to `REGEXP_LIKE`) and rejected every other non-empty filter
> with `InvalidArgument` — so the legacy grammar and the new `:` grammar were mutually rejecting.
> The rollout replaced the pre-parser with `normalizeLegacyCatalogFilter`, a **translation shim** that
> rewrites the one legacy spelling `name.contains('X')` to `name:'X'` (identical escape rules, so the
> quoted content is carried verbatim) and hands everything else to the engine unchanged. Old SPA
> bundles keep working; the engine compiles both spellings to `ILIKE` on the trigram-indexed `name`
> columns; the proto comments now document the `:` grammar. Remove the shim once no pre-rollout
> frontend remains in service.
> Note `TestListDatabasesFilterIsTokenOnly` covers the **live engine** `ListDatabases` (zero
> filterable fields → no-op rule), not the cached catalog list; it still asserts the ignore behavior
> and is unaffected. The catalog lists are covered by `TestIntegrationCatalogListAIPFilterGrammar`.

## 4. Filter grammar (the supported subset)

Uses AIP-160's `:` spelling for the one substring operation we need; see §2.1 for how this narrows the
full AIP-160 language.

```
filter      := condition ( "AND" condition )*          // whitespace-separated AND; case-insensitive keyword
condition   := field "=" value
            |  field "!=" value
            |  field ":" string                         // case-insensitive substring for string fields
field       := IDENT                                     // API field name (validated vs schema)
value       := string | bool                             // int reserved; see §5.3
string      := '"' … '"' | "'" … "'"                     // backslash escapes; precise rule in §4 decisions
bool        := "true" | "false"
```

Examples the UI sends:
- Kind tab: `object_type = "TABLE"`
- Search box: `object_name:"orders"`
- Combined: `object_type = "VIEW" AND object_name:"user"`
- System filter (cached lists): `is_system_database = false`

**Decisions**
- **AND-only**, flat (no `OR`/nesting). Covers every current UI need (tab AND search). A flat
  `[]FilterCondition` already leaves room to add `OR` later (e.g. `[][]FilterCondition`) without
  changing call sites.
- **`:`** = case-insensitive substring for string fields (the search-box operator). SQL form + escaping
  in §5.4. This is not the full AIP-160 HAS operator for repeated/map/message fields.
- **Equality/inequality** for string + bool only (v1). Int/timestamp literals are **not** parsed yet, so
  `Int64Codec`/`TimestampCodec` fields are not filterable in v1 (§5.3).
- **Enum values use the stored token** (`object_type = "TABLE"`, not `"GRANT_OBJECT_TYPE_TABLE"`), per
  §2.1; validated against the field's bounded set (§5.1).
- **Quoted values are opaque**: a string value may contain spaces, the `AND` keyword, `=`, `(`, `)`. The
  parser is therefore **quote-aware** (§5.3) — the top-level `AND` split and operator detection ignore
  anything inside quotes — and value contents are not subject to the structural-character allowlist.
- **String escaping (precise):** inside a double-quoted value `\\`→`\` and `\"`→`"`; inside a
  single-quoted value `\\`→`\` and `\'`→`'`. A backslash before any other character, or a trailing
  dangling backslash, is `InvalidArgument`. Operator-looking content inside quotes is literal —
  `name = ":"` and `name = "a!=b"` are each a single equality condition (parser tests, §8).
- **Whitespace-only filters normalize to empty.** `BuildPlan` trims `params.Filter` once and uses the
  trimmed value for **both** hashing and parsing, so `" "` and `""` are equivalent and never trigger a
  spurious `ErrFilterMismatch` across pages.

## 5. Backend design

### 5.1 `Field` change (`backend/aip/schema.go`)

Add a single zero-value-safe field (existing call sites compile unchanged):

```go
type Field[Model any] struct {
    Column          postgres.Column
    SQLExpr         string
    Codec           CursorCodec
    DisableOrdering bool
    GetValue        func(m *Model) any
    Filterable      bool     // NEW. Zero value = not filterable.
    FilterValues    []string // NEW, optional. Bounded value set for enum-like fields; nil = unbounded.
}
```

`FilterValues` is the small **value-validation layer** the review asked for: when non-empty, a `=`/`!=`
value not in the set → `InvalidArgument` (so `object_type = "TABEL"` fails clearly instead of returning
zero rows). A non-empty `FilterValues` also makes the field **equality-only** (operators `=`/`!=`, **no**
`:`) — a bounded enum has no substring semantics; this subsumes the rejected `FilterOps` knob for
the one case that needed it. Set it for `object_type`, but the token set **differs by endpoint** (singular
tokens for owned objects/grants vs plural tokens for default privileges — §5.8). Leave it nil for
`privilege` (the vocabulary is Postgres-version-dependent — `MAINTAIN` arrived in PG17 — so an unknown
privilege harmlessly matches nothing rather than erroring on a newer server). That asymmetry is
intentional UX: bounded, Querylane-defined object types typo-fast; server-version-dependent privileges
stay forward-compatible.

PostgreSQL 17 `MAINTAIN` is supported as a grant display and filter token wherever PostgreSQL returns
it: direct role grants, PUBLIC grants, and default privileges. Clients can filter these rows with
`privilege = "MAINTAIN"` without Querylane treating `MAINTAIN` as an invalid enum value.

`CursorCodec` now has a second use: it defines the field's filter value type and default operator set,
even when the field is `DisableOrdering: true`. That makes fields such as `is_system_*` intentionally
filterable without becoming valid `order_by` fields.

Avoid a third hand-maintained enum vocabulary in the schema files. Add shared token constants/slices in
`backend/engine` (for example `GrantObjectTypeTokens` and `DefaultPrivilegeObjectTypeTokens`) and use
them from both the `engine/postgres` schema `FilterValues` and the role service enum mapping switch. The
SQL `CASE` statements remain the database source, but Go should have one token list plus tests that the
mapping covers every token.

> **Rejected (review):** a `FilterOps []FilterOperator` override. No field in the rollout (§5.8) needs
> a non-default operator set; operators are derived from the codec (§5.3). Add an override later, as a
> named option, only if a real field needs it — strictly additive.

**Validation** (`NewSchema` → `validate()`, currently `schema.go:203-219`): the loop skips
`DisableOrdering` fields entirely today. Add, for any `Filterable` field (including
`DisableOrdering: true` ones like `is_system_*`):

- require `Codec != nil` **and** (`Column != nil` **or** `SQLExpr != ""`);
- **do not** require `GetValue` — it is only used for cursor extraction of *order* fields, never for
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

### 5.2 AST — a flat slice (`backend/aip/filter.go`, new file)

```go
type FilterOperator int
const (
    OpEqual FilterOperator = iota
    OpNotEqual
    OpContains // `:` string substring in the v1 grammar.
)

type FilterCondition struct {
    Field    string         // API field name (validated against schema.fields)
    Operator FilterOperator
    Value    any            // string | bool (matches the field codec; int/time reserved)
}
```

> **Rejected (review):** a `Filter{Conditions []FilterCondition}` wrapper. AND-only semantics make it
> isomorphic to the slice; `nil`/empty slice == "no filter". Both compilers early-return on
> `len(conds) == 0` (mirroring `buildJetKeysetCondition`'s `len(vals)==0` guard at `jet.go:37`).

`FilterCondition.Value` is the **coerced** value (string or bool), produced by the schema-aware
validation step (§5.3), not by the lexical parser. The parser emits raw lexemes; validation coerces and
bounds-checks them — keeping the parser schema-free.

`Plan` (`plan.go:12`) gains an **unexported** `parsedFilter []FilterCondition` alongside the existing
exported `Filter string` (kept for token hashing at `execute.go:99`). Unexported avoids a field/type
name clash and signals it's consumed only inside `package aip` (both compilers).

### 5.3 Parser + validation

- `parseFilter(raw string) ([]rawCondition, error)` in `filter.go` — a **tiny quote-aware, schema-free
  scanner** (lexical only; coercion/validation happen later in `validateFilter`). A plain `strings.Split`
  is **insufficient**: quoted values may contain spaces, the `AND` keyword, `=`, `(`, `)`. Steps:
  1. `strings.TrimSpace`; if empty → `(nil, nil)`.
  2. **Quote-aware top-level `AND` split:** scan the string once tracking an `inQuote` flag (honoring
     the §4 backslash escape); treat a whitespace-delimited, case-insensitive `AND` as a separator only
     when `inQuote == false`. (~15–25 lines; do **not** `strings.Split` the whole string on `AND`.)
  3. Per condition, detect the operator in precedence order **`!=` → `=` → `:`** (test `!=` before `=`,
     and ignore all operator-looking bytes inside quotes), splitting on the **first** top-level match
     only so a value like `"a=b"` survives. The left side must be a bare identifier (validated).
  4. Emit a **raw lexeme** per condition (`rawCondition{field, op, value string, quoted bool}`): a quoted
     value (strip quotes, unescape the backslash escape; contents unrestricted, so `owner = "a@b.com"`,
     `name:"50/50"`, `"my-schema"` all work) or an unquoted bareword (e.g. `true`). The parser
     is **schema-free** — **no** codec coercion or type checks here. The structural-character allowlist
     applies only to the **unquoted** structure, never to quoted contents.
  5. **Duplicate conditions on the same field are allowed** (AND-ed; contradictory equalities simply
     yield no rows) — do not dedupe or reject (unlike `ParseOrderBy`).
- **No-op for non-opted-in endpoints (no regression):** `BuildPlan` first checks
  `len(schema.filterableFields()) == 0`; if so it **ignores** the filter entirely (today's behavior — the
  raw string is still hashed into the token, just never parsed or compiled). Only schemas that opt in ≥1
  `Filterable` field run parsing/validation/compilation, so the global engine never regresses an endpoint
  from "filter ignored" to "filter errored".
- **Schema-aware `validateFilter`** then runs in `BuildPlan` (`plan.go`), **after** `validateToken`
  succeeds and **before** `decodeCursorValues`, turning `[]rawCondition` → `[]FilterCondition`. Per
  condition: field exists in `schema.fields`; field is `Filterable`; operator allowed for the codec
  (below); the lexeme **coerces** to the codec's Go type (`StringCodec` → string; `BoolCodec` → bare
  `true`/`false`, reject a quoted value); and, if the field has `FilterValues`, the value is in that set.
- **Operator allowlist** (unexported helper in `filter.go`): if the field has a non-empty `FilterValues`
  → **`=`, `!=` only** (bounded enum, no substring); else by codec — `StringCodec` → `=`, `!=`,
  `:`; `BoolCodec` → `=`, `!=`. `Int64Codec`/`TimestampCodec` are **not filterable in v1** (the parser
  produces no int/timestamp literals) — a `Filterable` field with those codecs is a schema-construction
  error until literal parsing is added. The error must name the field, codec type, and limitation, e.g.
  `filterable field "create_time" uses TimestampCodec; timestamp filtering requires phase 2 comparison
  operators and literal parsing`. `:` is `StringCodec`-only.
- **Limits (abuse guards):** reject a filter over `maxFilterBytes` (e.g. 1 KiB) or with more than
  `maxConditions` (e.g. 16) AND-conditions → `InvalidArgument`, before compilation — cheap, and bounds
  pathological inputs.
- **Errors use `wrapAIPError(err, ErrInvalidFilter)`** (`plan.go:61`) so the sentinel isn't
  double-wrapped and `errors.Is` stays clean across the engine/storage re-exports. A
  `newFilterFieldError(path, filterableFields())` helper mirrors `newFieldError` (`order.go:112`) but
  wraps `ErrInvalidFilter` (never reuse `newFieldError`, which wraps `ErrInvalidOrderBy`).

Because the token already hashes the (normalized) raw filter, **changing the filter mid-pagination is
already rejected** with `ErrFilterMismatch` (`page.go:117`). No token-machinery change is needed.

### 5.4 `:` string substring — SQL form, escaping, and the ILIKE decision

**Decision: `ILIKE` on both backends**, as `<expr> ILIKE $n` with the bound value
`"%" + escapeLikePattern(term) + "%"`, where unexported `escapeLikePattern` escapes `\`, `%`, `_`.
**No explicit `ESCAPE` clause** — PostgreSQL's default `LIKE`/`ILIKE` escape character is already the
backslash, and because the pattern is a **bound parameter** (not a string literal) it is not subject to
`standard_conforming_strings`. Dropping `ESCAPE` keeps the go-jet construction simple (`BinaryOperator`,
§5.6) and avoids a `CustomExpression`/`Token` dance.

Rationale (resolves the simplicity-vs-performance conflict):
- The meta tables **already have `pg_trgm` GIN indexes on every `name` column**
  (`backend/storage/migrations/0001_initial.sql`). `col ILIKE '%term%'` uses those indexes; the
  alternatives **silently disable them**: `LOWER(col) LIKE LOWER($n)` can't use an index on the raw
  column, and `strpos(lower(col), …) > 0` can't either. So **do not** use `LOWER(col) LIKE …`. (Per the
  pg_trgm docs, very short or wildcard-only patterns degrade to a scan — acceptable here.)
- `ILIKE` is case-insensitive natively (no `LOWER` needed) and marginally cheaper per row on the live path.
- `escapeLikePattern` neutralizes user `%`/`_`/`\` so a search for `"50%"` matches the literal, not a
  wildcard. It gets a focused unit test (the metachar cases), and the jet+SQL compilers get a
  `DebugSql()`/string assertion confirming the emitted `ILIKE $n`.

> **Rejected:** `strpos`/`POSITION` (simpler escaping, but forfeits the existing trigram indexes — a
> performance regression on the cached path). The escaping cost is one small, tested helper.

### 5.5 SQL compiler (`backend/aip/sql.go`) — live path

Add `buildSQLFilterPredicate[M](b *sqlBuilder, fields Fields[M], conds []FilterCondition) (string, error)`.
One parameterized fragment per condition, joined with `AND`:
- `OpEqual`: `(<SQLExpr> = $n)`
- `OpNotEqual`: `(<SQLExpr> <> $n)`
- `OpContains` (`:`): `(<SQLExpr> ILIKE $n)`, arg = `"%"+escapeLikePattern(v)+"%"` (default backslash escape, §5.4)

**Param ordering (invariant, not a style note):** placeholders are positional, so build the filter
predicate **first**, then the cursor predicate, **sharing the same `sqlBuilder`**, inside
`buildSQLClauses`. Combine, **skipping empty fragments** (critical — `joinPredicates` does **not** skip
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
with `WHERE`/`AND` per `SQLQuery.HasWhere`. Document in a comment that filter+cursor are combined
inside `buildSQLClauses` and `assembleSQLQuery` must stay unaware of the distinction.

### 5.6 Jet compiler (`backend/aip/jet.go`) — cached path

Add `buildJetFilterCondition[M](fields Fields[M], conds []FilterCondition) (postgres.BoolExpression, error)`,
combined at `execute.go:63` via the already-variadic, nil-safe `combineJetConditions`:

```go
if where := combineJetConditions(baseCondition, filterCond, cursorCond); where != nil {
    stmt = stmt.WHERE(where)
}
```

Reuse, don't duplicate, the type-switch:
- `OpEqual`/`OpNotEqual`: route through the existing `equalityExpr` (`jet.go:143`). Extend it with an
  operator argument (or add a thin `inequalityExpr` peer) so `=`/`<>` share one type-switch over
  string/bool/int.
- `OpContains` (`:`): type-assert the column to `postgres.StringExpression` (exactly as `equalityExpr` does
  at `jet.go:147`; error if it isn't — substring is `StringCodec`-only). Emit `col ILIKE $n` via
  `postgres.BoolExp(postgres.BinaryOperator(col, postgres.String(pattern), "ILIKE"))`, pattern =
  `"%"+escapeLikePattern(v)+"%"` (no `ESCAPE` clause needed, §5.4). Add a **`Sql()`** assertion (it keeps
  `$n` placeholders; `DebugSql()` inlines literals) that the emitted SQL is `… ILIKE $n` (not
  `LOWER(col) LIKE …`, which would break the trigram index).

`len(conds) == 0` → returns `nil` (no-op). `combineJetConditions` already guards
`postgres.AND()`-on-empty.

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
  is_system_role`). Postgres can't reference a SELECT alias in `WHERE`, so its `Field.SQLExpr` must be
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
- **`defaultPrivilegeSchema` also scans `with_grant_option`.** It stays non-filterable in v1 because
  there is no UI need yet and the default-privilege identity is already covered by
  `(creator_role_name, schema_name, object_type, privilege)`. If needed later, add it as a
  `BoolCodec` field with `DisableOrdering: true` + `Filterable: true`.
- **Meta-DB indexes:** the `is_system_*` and `owner` columns on `catalog_*` have **no btree index**
  (only the `name` trigram GIN). When enabling the jet path, add a migration with **partial btree
  indexes** for the common `is_system_* = false` filter, e.g.
  `CREATE INDEX … ON catalog_table (instance_id, database_name, schema_name, name) WHERE is_system_table = false`.

### 5.9 Explicit phase 2: comparisons and typed literals

The flat `[]FilterCondition` design is ready for numeric and temporal fields, but v1 deliberately does
not parse their literals. The next expansion phase is concrete, not an open-ended reservation:

- add `OpLess`, `OpLessEqual`, `OpGreater`, `OpGreaterEqual`;
- extend the value rule to parse `int64` literals and RFC3339 timestamp strings into `time.Time`;
- allow `Int64Codec`/`TimestampCodec` fields to be `Filterable`;
- compile the new operators in both SQL and jet backends;
- cover table-size, row-count, and created-at style filters before marking any such field filterable.

Until that phase lands, schema construction must fail loudly for `Filterable` fields using
`Int64Codec`/`TimestampCodec`, with an error that names the field, codec, and phase-2 limitation.

## 6. Vertical slice: live role lists (shared session opener)

`openRoleDatabaseSession` (`service.go`) is **shared** by `ListRoleGrants`, `ListRoleOwnedObjects`,
and `ListRoleDefaultPrivileges`, so removing its filter guard affects **all three** at once. The
shipped slice therefore enables all three (plus `ListPublicGrants`, whose schema is the shared
`newGrantSchema`): their schema fields are `Filterable`, the shared guard and the `ListPublicGrants`
guard are removed, and each has integration coverage. A guard removal without a schema opt-in would
have regressed an endpoint from "rejects filters" to "silently ignores filters" against its proto
contract — which is why `ListRoleGrants` could not be left out of the slice. Endpoints that haven't
opted in any `Filterable` field keep ignoring filters (the §5.3 no-op rule); only `ListRoles` still
carries an explicit reject guard.

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

Mirror `backend/aip` conventions (table-driven, stdlib `t.Fatalf`, exact SQL-string + arg-count
assertions; `newTestSchema()` for jet, `newTestSQLSchema()` for sql; no `-short` guard on the
I/O-free unit tests).

- **Parser** (`filter_test.go`): valid grammars → expected raw conditions; malformed → wrapped
  `ErrInvalidFilter`; empty and whitespace-only → `nil`; both quote styles; case-insensitive `AND`;
  `:` substring; `.contains(...)` rejected as an unsupported function call; **operator-looking content inside quotes** (`name = ":"`, `name = "a!=b"`,
  `name = "x AND y"`) parses as one condition; `\\`/`\"`/`\'` unescape; dangling backslash → error;
  over-`maxConditions`/`maxFilterBytes` → error.
- **`escapeLikePattern`** (`filter_test.go`): `%`, `_`, `\`, and combinations.
- **SQL compiler** (`sql_test.go`): assert the exact `WHERE` fragment **and `$n` ordering when
  combined with a cursor** (the empty-fragment and filter-before-cursor cases explicitly).
- **Jet compiler**: assert via the statement's **`Sql()`** (parameterized, keeps `$n`; not `DebugSql()`,
  which inlines literals) — no `jet_test.go` exists, add minimal coverage — incl. that `:` emits
  `ILIKE $n` (not `LOWER … LIKE`).
- **Validation**: unknown field / non-filterable field / disallowed operator / type mismatch →
  wrapped `ErrInvalidFilter`; message lists `filterableFields()`.
- **Service** (`service/role/service_test.go`): the "rejects filter" cases flip to "passes filter to
  engine" using `fakeOpener`/`fakeDatabaseSession`.
- **Integration** (`postgres_integration_test.go`, `-short`-guarded suite): `ListRoleOwnedObjects`
  filter by `object_type`, by `object_name:"..."`, combined; the filter+cursor round-trip
  (page 1 → next consistent under the same filter; changed filter → `ErrFilterMismatch`).
- **Existing test that breaks (cached-list rollout):** `postgres_integration_test.go:613`
  `TestListDatabasesFilterIsTokenOnly` asserts today's no-op (filtered == unfiltered); it breaks
  deterministically once `catalogDatabaseSchema.owner` becomes `Filterable`. Rewrite it then to assert
  filtered results, keeping the changed-filter → `ErrFilterMismatch` half. (Distinct from the
  known-flaky `TestCreateInstance_Success`/`TestDeleteInstance_Success`.)
- **Apierrors**: `ErrInvalidFilter` → `InvalidArgument` + `filter` field violation.
- **Frontend**: F1 — the `paginateUpTo` cap + banner render; counts/tabs unchanged. F2 — the
  `quoteFilterValue`/`buildOwnedFilter` builder unit test, and the table rendering server-filtered results
  + cursor reset (browser test per the project's manual-verification rule).

## 9. Security

- **Field names never come from user input** — the parser maps user tokens to declared schema fields;
  unknown/non-filterable fields error. Column/`SQLExpr` come only from the schema.
- **Values are always bound parameters** (`$n` on the sql path; `postgres.String/Bool` literals on the
  jet path). No string interpolation of values into SQL.
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
- **Frontend:** F1's bounded fetch derives counts/tabs from the in-memory filtered set (correct, no
  extra query). F2's facets must be cached per-filter (§7), not per page-turn.

## 11. Leanest v1 — file-by-file delta

**Backend (`backend/aip/`):**
- `filter.go` (new): `FilterOperator` (3 consts), `rawCondition` + `FilterCondition`, the quote-aware
  schema-free `parseFilter`, schema-aware `validateFilter` (coercion + `FilterValues` bounds + codec ops
  via `allowedOps`), `newFilterFieldError`, `escapeLikePattern`.
- `schema.go`: add `Filterable bool` + optional `FilterValues []string` to `Field`; extend `validate()`
  (Codec + Column/SQLExpr when `Filterable`, **not** GetValue; reject `Filterable` on Int64/Timestamp
  codecs in v1); add `filterableFields()`.
- `plan.go`: add unexported `parsedFilter []FilterCondition` to `Plan`; trim `params.Filter`; if the
  schema has zero filterable fields, skip filtering (no-op); else parse + validate in `BuildPlan`
  between `validateToken` and `decodeCursorValues`, via `wrapAIPError`.
- `errors.go`: add `ErrInvalidFilter`.
- `sql.go`: add `buildSQLFilterPredicate`; in `buildSQLClauses`, build filter first (shared `sqlBuilder`)
  and combine skipping empty fragments.
- `jet.go`: add `buildJetFilterCondition` (reusing `equalityExpr`); combine at `execute.go:63`.
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
- `storage/catalog/`: mark the §5.8 fields `Filterable`; replace the `catalogNameContainsFilter`
  pre-parser with the `normalizeLegacyCatalogFilter` translation shim (§3 callout).
- `proto/…/role.proto`: replace the "Reserved for future … rejects non-empty filters" comments on the
  enabled requests with the supported filters; update existing `database/schema/table/view` comments
  from `.contains()` examples to `field:"..."`; run `task proto:generate` (never hand-edit `protogen/`).

**Frontend (F1 — bounded fetch only; no UI server-filtering, see §7):**
- `lib/paginate-all.ts`: add `paginateUpTo(maxRows)`.
- `hooks/api/role.ts`: switch the owned-objects (and default-privileges) hooks to `paginateUpTo` with a
  cap + the "first N — refine" banner. The query stays **unfiltered**, so KPIs/overview/tabs/counts are
  unaffected and no component internals change. (The `quoteFilterValue`/`buildOwnedFilter` builder, the
  summary/table query split, and the table→server-`filter` wiring are **F2** — §7.)

~100 lines of new backend code, no new dependencies, no new abstractions.

## 12. Resolved decisions

1. **Subset, not full AIP-160** (AIP-160-*inspired*, not wire-compatible — §2.1): `=`, `!=`, string
   substring via `:`, `AND`. Enum fields filtered on the stored token via a bounded `FilterValues` set
   that also makes them **equality-only** (no `:`); token sets differ per endpoint (singular for
   owned/grants, plural for default privileges) and live in shared `backend/engine` token slices.
   Documented deviations; no silent unsupported syntax.
2. **`:` substring:** `ILIKE` on both backends (uses the existing trigram GIN indexes); `escapeLikePattern`
   + the **default** backslash escape (no explicit `ESCAPE`, §5.4).
3. **Allowed operators:** `FilterValues`-bounded → `=`/`!=` only; else by `Codec` (String/Bool only in
   v1); no `FilterOps` override. Abuse guards: `maxFilterBytes` + `maxConditions` (§5.3).
4. **Parser vs validation:** `parseFilter` is lexical + schema-free; coercion/bounds/op-checks live in
   schema-aware `validateFilter`.
5. **No regression:** endpoints with zero `Filterable` fields keep ignoring filters (§5.3) — enablement
   is additive.
6. **AST:** flat `[]FilterCondition`, AND-only; no `Filter` wrapper.
7. **Frontend:** F1 = backend/API filter + **bounded fetch only** — the owned-objects query is shared with
   KPIs/overview/tabs, so it stays unfiltered (§7). F2 = UI server-filtering via a split facets/table
   query + the escaped `quoteFilterValue`/`buildOwnedFilter` builder + cursor pagination.
8. **`is_system_role`:** filterable, but its `SQLExpr` must be the full LIKE expression, not the alias.
9. **Jet `:` substring:** `col ILIKE $n` via go-jet `BinaryOperator`/`BoolExp`, column type-asserted to
   `StringExpression`, asserted with **`Sql()`** (keeps `$n`; not `DebugSql()`).

## 13. Open questions (for implementation)

- Verify with `EXPLAIN` whether PostgreSQL prunes / pushes into the owned-objects `UNION ALL` arms under
  a kind filter (§10) — decides whether the single-branch query variant is worth building.
- `paginateUpTo` cap value (2k vs 5k) and whether the banner should surface the (unknown) true total or
  just "first N".
- ~~Whether to enable the cached-list (`ListDatabases/Schemas/Tables/Views`) filters in the same release
  as the live slice or stage them after.~~ **Resolved: enabled with the live slice**, with a legacy
  `name.contains('...')` translation shim for pre-rollout SPA bundles (§3 callout). Follow-ups: switch
  the Explorer's `buildNameContainsFilter` to emit `name:"..."` and then remove the shim; add the
  §5.8 partial btree indexes for `is_system_*` if those filters show up in slow-query logs.
- **AIP-158 follow-up (not blocking):** page tokens enforce filter/order/resource type but not
  parent/database scope (`proto/querylane/common/v1/pagination.proto`). AIP-158 wants all non-`page_size`
  args stable across page turns; add scope to the token hash later if "AIP-compatible" becomes the bar.
- If full AIP-160 (`OR`, wildcards, traversal, full `:` HAS semantics) is ever required, adopt
  `go.einride.tech/aip/filtering` for parsing and write our own lowering — out of scope now.
