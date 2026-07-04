# Backend

Go 1.26 - use modern stdlib (`slices`, `maps`, `cmp`, range-over-func). Interfaces belong in the consumer package.

## Testing

- Table-driven tests with `t.Run()` + `t.Parallel()` in parent and subtests.
- `require` for preconditions, `assert` for assertions.
- Unit tests: guarded by `-short`. Integration tests: name contains `Integration`, use `storage.NewTestDB(t)`.
- No mocking libraries - lightweight custom mocks only.

## Key Constraints

- Use Jet query builder in `storage/` against the meta database. Use handwritten SQL in `engine/postgres/` for live instance and system catalog queries.
- API uses ConnectRPC, not gRPC-Go.
- `engine.Manager` = user instance pools. `storage` = meta database. Don't mix them.
- Migrations: `storage/migrations/`, goose format. See rules below.

## Migration Authoring

Migrations use [goose](https://github.com/pressly/goose). Each migration is a single `.sql` file
with `-- +goose Up` and `-- +goose Down` annotations. Goose wraps each migration in a transaction
by default — if a statement fails, the entire migration rolls back atomically.

- Every migration MUST have both `-- +goose Up` and `-- +goose Down` sections. For irreversible
  changes, the Down section contains only a comment explaining why rollback is not possible.
- Don't modify migrations from previous releases that may have been applied by users.
  Fixing a broken migration in the current release cycle (before it ships, or as a
  patch when it failed for all users) is fine — see "Corrective Migrations" below.
- Prefer idempotent DDL: `IF NOT EXISTS` / `IF EXISTS` guards.
- One concern per migration. Don't mix unrelated schema changes.
- Naming: `NNNN_verb_noun.sql` (e.g., `0008_add_query_history.sql`).
- Startup migrations are bounded DDL only. No unbounded backfills or full-table data rewrites.
- Wrap PL/pgSQL function bodies in `-- +goose StatementBegin` / `-- +goose StatementEnd`.
- For statements that cannot run in a transaction (e.g., `CREATE INDEX CONCURRENTLY`),
  add `-- +goose NO TRANSACTION` at the top of the file.
- For breaking changes, use expand-and-contract across separate migrations/releases:
  1. Expand: add new structure alongside old, dual-write in application code.
  2. Contract: remove old structure in a later release, only after old binaries are no longer in service.

## Corrective Migrations

Goose wraps migrations in transactions, so a failed migration rolls back completely — the
database stays at the previous version with no partial state. This makes recovery simple.

**Migration failed for all users** (deterministic bug):
1. Fix the migration file directly — it never applied anywhere, so editing it is safe.
2. Ship a patch release. On next startup, goose applies the fixed migration. No user action needed.

**Migration succeeded for some users, failed for others** (data/version-dependent bug):
1. Don't edit the migration — it's been applied on some instances.
2. Ship a corrective migration N+1 with `IF EXISTS` / `IF NOT EXISTS` guards that handles both states.
3. All users upgrade to the patch release. Goose applies what's pending on each instance.
