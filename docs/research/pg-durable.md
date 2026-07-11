# pg_durable research

Research against primary sources only (the GitHub repo, its README, USER_GUIDE, docs/, CHANGELOG, LICENSE, releases and issues pages, and the project's GitHub Pages site). Fetched 2026-07-11.

Repo: <https://github.com/microsoft/pg_durable> — description: "PostgreSQL in-database durable execution". ~2.4k stars, 63 forks, primary language Rust (~54%), latest release v0.2.3.

## What it is

`pg_durable` is a **PostgreSQL extension** (Rust, built with pgrx) that provides **durable execution inside Postgres**: "Long-running, fault-tolerant SQL functions for teams that already keep their state in Postgres and want to stop stitching together cron jobs, workers, queues, and status tables to make background work reliable." Workflows are defined in SQL using a small DSL of composable operators, executed asynchronously with automatic checkpointing between steps; after a crash or restart, execution resumes from the last checkpoint instead of restarting. Target use cases: vector embedding pipelines, ingest pipelines, scheduled maintenance, fan-out aggregation, and external API workflows. It requires no external services (no Redis, no Temporal). [README](https://github.com/microsoft/pg_durable) ([raw](https://raw.githubusercontent.com/microsoft/pg_durable/main/README.md)), repo sidebar metadata.

## How it works

Per [docs/ARCHITECTURE.md](https://raw.githubusercontent.com/microsoft/pg_durable/main/docs/ARCHITECTURE.md), execution has two phases:

1. **Graph construction (synchronous).** DSL functions (`df.sql()`, `df.join()`, ...) and SQL operators (`~>`, `|=>`, `&`, `|`, `?>`, `!>`, `@>`) build an AST of nodes. `df.start()` inserts the nodes into the `df.nodes` table (columns: `id`, `instance_id`, `node_type` [SQL/THEN/IF/JOIN/LOOP/...], `query`, `result_name`, `left_node`, `right_node`, `status`, `result` JSONB, `created_at`) and records instance metadata in `df.instances` (`id`, `label`, `root_node`, `status`, ...), then enqueues the orchestration.
2. **Durable execution (asynchronous).** A persistent background worker (`pg_durable_worker`, registered via `_PG_init()` / BackgroundWorkerBuilder) runs the **duroxide** orchestration runtime inside the Postgres server, with **duroxide-pg** as its state provider (sqlx connection pool back into Postgres). Duroxide provides deterministic replay from history, checkpointed activities (`execute-sql`, `execute-http`, `load-function-graph`, `update-instance-status`, `update-node-status`), sub-orchestrations for JOIN/RACE, and continue-as-new for loops. Orchestration history/checkpoints live in duroxide provider tables (schema renamed to `_duroxide` in v0.2.3 per [CHANGELOG.md](https://raw.githubusercontent.com/microsoft/pg_durable/main/CHANGELOG.md)).

Durable functions execute with the privileges of the submitting user, not the worker: `df.start()` captures `current_user`, and "The captured role must have the `LOGIN` attribute, because the background worker authenticates as that role." ([USER_GUIDE.md](https://raw.githubusercontent.com/microsoft/pg_durable/main/USER_GUIDE.md), user-isolation section)

Instance lifecycle: `pending` → `running` → terminal (`completed`, `failed`, `cancelled`). (USER_GUIDE.md)

## API surface (SQL examples)

The entire user-facing API is **SQL functions in the `df` schema** plus DSL operators — no client SDK, no separate wire protocol; any Postgres client works. (README, USER_GUIDE.md)

Quick-start example, verbatim from the [README](https://raw.githubusercontent.com/microsoft/pg_durable/main/README.md):

```sql
-- A durable function that processes data in steps
SELECT df.start(
    'SELECT id FROM documents WHERE processed = false LIMIT 100' |=> 'batch'
    ~> 'UPDATE documents SET processed = true WHERE id IN (SELECT id FROM $batch.*)'
);
```

Operators (USER_GUIDE.md): `~>` sequence, `|=>` name a result, `&` parallel join, `|` race, `?>` if-then, `!>` else, `@>` loop prefix. Variable substitution: `$name` / `$name.column` / `$name.*` for named results, `{varname}` for user variables, `{sys_instance_id}` / `{sys_label}` system variables.

DSL / node functions ([docs/api-reference.md](https://raw.githubusercontent.com/microsoft/pg_durable/main/docs/api-reference.md), USER_GUIDE.md): `df.sql(query)`, `df.seq(a,b)`, `df.as(fut,name)`, `df.join(a,b)`, `df.join3(a,b,c)`, `df.race(a,b)`, `df.if(cond,then,else)`, `df.if_rows(result_name,then,else)`, `df.loop(body[,cond])`, `df.break([value])`, `df.sleep(seconds)`, `df.wait_for_schedule(cron)`, `df.wait_for_signal(name[,timeout])`, `df.http(url[,method,body,headers,timeout])`, `df.setvar/getvar/unsetvar/clearvars`.

Control functions: `df.start(fut[,label])` → returns `instance_id TEXT`; `df.signal(instance_id, signal_name[, signal_data])`; `df.cancel(instance_id[, reason])`; `df.status(instance_id)` → status string; `df.result(instance_id)` → result JSON; `df.await_instance(id[,timeout])`; `df.explain(input)` visualizes the graph. `df.http()` returns JSON like `{"status": 200, "body": "...", "headers": {...}, "ok": true, "duration_ms": 245}`. (api-reference.md, USER_GUIDE.md)

## Requirements and constraints

- **PostgreSQL 17 or 18.** Debian packages and Docker images (`ghcr.io/microsoft/pg_durable:pg17`) available since v0.2.3. (README, CHANGELOG.md)
- **Compiled Rust/pgrx extension, not a trusted-language extension.** It must be added to `shared_preload_libraries` (it registers a background worker), Postgres restarted, then `CREATE EXTENSION pg_durable;` in the configured database. Building from source needs Rust nightly and cargo-pgrx 0.16.1. (README)
- **Superuser/admin:** installation requires superuser or a role with CREATE EXTENSION rights; the extension grants nothing to PUBLIC — an admin must call `df.grant_usage('app_role')` per role (`include_http => true` to allow `df.http`, `with_grant => true` for admin-tier access including `df.metrics()`). By default superusers cannot submit workflows (`pg_durable.enable_superuser_instances = off`, a safety default because "superuser-submitted workflows bypass RLS and run with full privileges"). (USER_GUIDE.md)
- **GUCs** (postmaster context unless noted; USER_GUIDE.md): `pg_durable.database` (default `postgres`), `pg_durable.worker_role`, `pg_durable.enable_superuser_instances`, `pg_durable.max_management_connections` (6), `pg_durable.max_duroxide_connections` (10), `pg_durable.max_user_connections` (10), `pg_durable.execution_acquire_timeout` (30), `pg_durable.reconcile_interval` (3600), `pg_durable.retention_days` (30), `pg_durable.list_instances_max_limit` (1000, SUSET/runtime-settable).
- Submitting roles must have `LOGIN`. Multi-database support is documented (USER_GUIDE.md, docs/multi-database.md).

## Maturity and license

- **License:** PostgreSQL License, copyright Microsoft Corporation ([LICENSE.txt](https://raw.githubusercontent.com/microsoft/pg_durable/main/LICENSE.txt) — opening paragraph matches the standard PostgreSQL License text verbatim; GitHub's license detector agrees).
- **Status:** explicitly "**Preview** - This project is currently in preview." (README). Maintained by Microsoft; support via GitHub Issues; Microsoft Open Source Code of Conduct; no telemetry collected. (README)
- **Release history** ([CHANGELOG.md](https://raw.githubusercontent.com/microsoft/pg_durable/main/CHANGELOG.md), [releases page](https://github.com/microsoft/pg_durable/releases)): v0.1.1 initial tracked release → v0.2.0 (per-user RLS on `df.vars`, dot-notation, `df.if_rows`, connection limits) → v0.2.1 → **v0.2.2 (2026-05-28): "First open-source release of pg_durable on GitHub under the PostgreSQL License"** → v0.2.3 (2026-06-17, latest stable: Debian packages, Docker images, `_duroxide` schema rename) → v0.2.4-rc1 pre-release (2026-07-02: instance retention/pruning, paginated `df.list_instances()`, cron fixes; release tracked in open issue #286). Note: repo is public since late May 2026, so the ~2.4k stars accrued in about six weeks.
- **Open issue themes** ([issues](https://github.com/microsoft/pg_durable/issues), 15 open at fetch time): control-flow correctness bugs in nested loop/JOIN/RACE combinations, several `blocked_by_upstream` (duroxide); cancellation edge cases ("Cancelled workflows are recorded as Failed" #170); missing declarative retry/backoff/on_error (#155); no observable "waiting on a signal" instance state (#239).

## Introspection catalog (what an admin UI can read)

All observability is plain SQL — the project site states: "All workflow state lives in Postgres tables. Query execution history, inspect step outputs, and debug failures with standard SQL. No external dashboards." (<https://microsoft.github.io/pg_durable/>)

Set-returning functions in the `df` schema (USER_GUIDE.md monitoring section; docs/api-reference.md):

| Object | Returns | Notes |
|---|---|---|
| `df.list_instances([status][,limit])` | `instance_id, label, function_name, status, execution_count, output` | Newest first, default 100. RLS: callers see only their own instances; superusers see all. |
| `df.list_instances(status, limit, label[, after_cursor])` | above + `created_at, completed_at, next_cursor` | Paginated overload (v0.2.4); `next_cursor` NULL on last page; server cap `pg_durable.list_instances_max_limit`. |
| `df.instance_info(id)` | `instance_id, label, function_name, function_version, current_execution_id, status, output` | Single-instance metadata. |
| `df.instance_executions(id[,limit])` | `execution_id, status, event_count, duration_ms, output` | Execution (replay) history per instance; default last 5. |
| `df.instance_nodes(id)` | `node_id, node_type, query, result_name, left_node, right_node, status, result, status_details, inferred_status, inferred_status_from_ancestor_id, updated_at` | Per-step graph view; `inferred_status*` computed at read time. |
| `df.metrics()` | `total_instances, running_instances, completed_instances, failed_instances, total_executions, total_events` | System-wide aggregates; "Requires a direct admin grant; `df.grant_usage()` does not include it" (granted via `with_grant => true`). |
| `df.status(id)` / `df.result(id)` | status string / result JSON | Per-instance point lookups. |
| `df.explain(input)` | graph visualization | Renders the DSL graph without running it. |

Underlying tables (ARCHITECTURE.md, USER_GUIDE.md):

- `df.instances` — instance metadata (`id`, `label`, `root_node`, `status`, `submitted_by`, timestamps). RLS-protected (`submitted_by = current_user`); superusers bypass RLS.
- `df.nodes` — workflow graph nodes with per-node `status` and `result` JSONB. RLS-protected.
- `df.vars` — user variables, per-user RLS.
- `df._worker_epoch` — background worker heartbeat (USER_GUIDE.md), useful for an admin UI health check.
- `_duroxide.*` (schema named `duroxide` before v0.2.3) — orchestration history, activity results, checkpoints owned by the duroxide-pg provider. Internal; the guide does not recommend querying it directly — admin interaction should go through the `df.*` functions.

Retention caveat for a UI: a background reconciliation pass prunes terminal instances (keeps at most the newest 10,000 terminal instances AND only those younger than `pg_durable.retention_days`, default 30; running/pending never pruned), so history is bounded. (USER_GUIDE.md; CHANGELOG v0.2.4)

## Management operations

Everything is SQL (USER_GUIDE.md, api-reference.md):

- **Submit:** `df.start(fut[,label][,database])`.
- **Cancel:** `df.cancel(instance_id[, reason])` — ownership-checked under RLS ("Instance not found or access denied" for others' instances). Known bug: cancelled workflows can be recorded as `failed` (issue #170).
- **Signal:** `df.signal(instance_id, signal_name[, data])` — resume instances blocked in `df.wait_for_signal()`; payload arrives as `{"signal_name": ..., "timed_out": false, "data": {...}}`.
- **Wait:** `df.await_instance(id[,timeout])` blocks until completion.
- **Access control:** `df.grant_usage(role[, include_http][, with_grant])` / `df.revoke_usage(role)`.
- **Worker/runtime configuration:** GUCs only (see Requirements); most are postmaster-context (restart required); `pg_durable.list_instances_max_limit` is runtime-settable (SUSET). Retention tuned via `pg_durable.reconcile_interval` and `pg_durable.retention_days`.
- **Not available (yet):** no pause/resume, no manual retry, no declarative retry/backoff policy (open enhancement #155). A `docs/proposal-management-api.md` exists in the repo, indicating a richer management API is proposed but not shipped.

## Existing UI / dashboard

None. The README and the project website ship no UI and recommend none; the website explicitly frames "No external dashboards" as a feature, with observability via "Postgres tables such as `df.instances`" under standard Postgres auth. The docs site (<https://microsoft.github.io/pg_durable/>) is marketing/docs only. The only hosted offering mentioned is Azure HorizonDB integration (`aka.ms/horizondb_pg_durable`). This is a clear gap an admin tool like querylane could fill: instance list/detail (graph node drill-down via `df.instance_nodes`), execution history, `df.metrics()` overview, cancel/signal actions, and worker heartbeat from `df._worker_epoch`.

## Live validation against v0.2.3 (2026-07-11)

Validated hands-on against `ghcr.io/microsoft/pg_durable:pg17` (amd64, PostgreSQL 17.10, pg_durable 0.2.3). The shipped introspection signatures differ from the current docs in ways that matter for tooling:

```text
df.list_instances(status_filter text DEFAULT NULL, limit_count integer DEFAULT 100)
  → TABLE(instance_id text, label text, function_name text, status text,
          execution_count bigint, output text)
df.instance_info(instance_id text)
  → TABLE(instance_id text, label text, function_name text, function_version text,
          current_execution_id bigint, status text, output text)
df.instance_nodes(instance_id_param text, last_n_executions integer DEFAULT 5)
  → TABLE(execution_id bigint, node_id text, node_type text, query text,
          result_name text, left_node text, right_node text, status text,
          result text, updated_at timestamptz)
```

Differences from the doc-derived table above: `current_execution_id` is **bigint** (not text); `df.instance_nodes` has an extra leading `execution_id` column and a `last_n_executions` parameter, node ids (`node_id`, `left_node`, `right_node`) are **text** hex ids (e.g. `fd79a31b`), and there are **no** `status_details` / `inferred_status` / `inferred_status_from_ancestor_id` columns in v0.2.3 (those are newer additions). Instance ids from `df.start()` are short hex strings (e.g. `dc1a9927`). `df.instance_info()` returns zero rows (not an error) for unknown or RLS-hidden ids, and calling any `df.*` function in a database without the extension raises `3F000` (`schema "df" does not exist`).

- Repo page (metadata, stars, structure): <https://github.com/microsoft/pg_durable>
- README (raw): <https://raw.githubusercontent.com/microsoft/pg_durable/main/README.md>
- User guide: <https://raw.githubusercontent.com/microsoft/pg_durable/main/USER_GUIDE.md>
- API reference: <https://raw.githubusercontent.com/microsoft/pg_durable/main/docs/api-reference.md>
- Architecture: <https://raw.githubusercontent.com/microsoft/pg_durable/main/docs/ARCHITECTURE.md>
- Changelog: <https://raw.githubusercontent.com/microsoft/pg_durable/main/CHANGELOG.md>
- License: <https://raw.githubusercontent.com/microsoft/pg_durable/main/LICENSE.txt>
- docs/ listing: <https://github.com/microsoft/pg_durable/tree/main/docs>
- sql/ listing (extension migration scripts): <https://github.com/microsoft/pg_durable/tree/main/sql>
- Releases: <https://github.com/microsoft/pg_durable/releases>
- Issues: <https://github.com/microsoft/pg_durable/issues>
- Project website: <https://microsoft.github.io/pg_durable/>
