# PostgreSQL 19 readiness audit

Updated: 2026-11-05. Source review: repository baseline `f29927881dc360e663f12b591194bbe0a8516a13`.

## ELI5

This is a checklist, not a promise that the next database version works. Attempts to test real servers stopped before any database query ran. Keep the existing version until real tests supply that evidence.

## Decision

Retain `postgres:18-alpine` as the integration default. This audit changes no backend, dependency, workflow, server configuration or upgrade behavior. A user-managed **instance** and Querylane's internal **meta database** require separate compatibility evidence. Neither is certified for PostgreSQL 19 by this document.

## Release and image checkpoint

Checked 2026-11-05: the [official release announcement](https://www.postgresql.org/about/news/postgresql-19-rc-1-released-3409/) still identifies RC1, with RC2 planned for November 12 and general availability planned for November 19. These are provisional recheck dates, not scheduled actions. The [19 release notes](https://www.postgresql.org/docs/19/release-19.html) label the version unsupported and show an October 9 content cutoff, not a final release date.

The [Docker Official Images manifest](https://raw.githubusercontent.com/docker-library/official-images/master/library/postgres) lists `19rc1-alpine`, including amd64 and arm64v8. A fresh public Registry V2 manifest request for `library/postgres:19rc1-alpine` returned:

- OCI index: `sha256:a3095ec8782b77587ca34006edaf09df362212351745069cb7758e256ecd488f`.
- linux/amd64: `sha256:d9da2cdfda29f62a8da0363b8a663431f5b12fcab6c80673bc9768fa3abc2cf6`.
- linux/arm64/v8: `sha256:10a125ee6067fdfdcb6efed797d88ace5681b8e0dc94535f5c9fcf6fb93c39b3`.

This confirms publication, not a pull, startup, extension inventory or SQL result. `docker buildx imagetools inspect docker.io/library/postgres:19rc1-alpine` could not run in the publication environment because the buildx command was unavailable; the registry request supplied the fresh digest check instead. Recheck release status and image identity before every later run. Do not guess a final-version tag.

## Test seams and dated outcomes

The image override is in [`backend/integration/testutil/postgres.go`](../../backend/integration/testutil/postgres.go). Engine tests use a real container. [`RPCSuite`](../../backend/integration/rpctest/suite_test.go) creates both meta and external databases on that chosen server; it does not prove mixed-version combinations. [`backend/storage/testing.go`](../../backend/storage/testing.go) uses a different embedded-storage setup and does not consume this override.

Historical local outcomes, 2026-11-04, macOS arm64 / Go 1.27.3:

| Attempt | Observed outcome | Interpretation |
| --- | --- | --- |
| First pinned RC1 engine integration | Provider-health skip after 92.78 seconds; process exit 0 | Infrastructure-blocked. No SQL fixture ran; not a compatibility pass. |
| Later stable-18 engine integration | Exit 1; one failed root test, no skips; container-creation context deadline | Infrastructure-blocked. No SQL fixture ran. |
| Later pinned-RC1 engine integration | Exit 1; one failed root test, no skips; container-creation context deadline | Infrastructure-blocked. No SQL fixture ran. |
| Short tests: engine/postgres, engine, runner/jobs | Three packages passed | Existing non-server contracts only. |
| Short tests: service/sqlsvc, postgreserrors | Two packages passed | Existing non-server SQL-safety contracts only. |

Docker provider/socket availability failed during these attempts. The later failed attempts supersede any reading of the earlier skipped run as success. No current server compatibility test was run for this documentation publication. No SQL compatibility is verified.

## Source inventory and targeted follow-up

These are source findings and test requirements, not newly reproduced production incidents.

| Area | Repository evidence | Required proof before a support or feature claim |
| --- | --- | --- |
| Catalog shape | [`list_table_columns.sql`](../../backend/engine/postgres/queries/list_table_columns.sql), [`get_table_query_insights.sql`](../../backend/engine/postgres/queries/get_table_query_insights.sql) use explicit projections | Run catalog, generated/identity, partition, extension, role and dependency fixtures on the real candidate. Additive columns alone do not prove compatibility. |
| Older I/O | [`get_io_metrics.sql`](../../backend/engine/postgres/queries/get_io_metrics.sql), [`probe_metrics.go`](../../backend/engine/postgres/probe_metrics.go), [`probes.go`](../../backend/runner/jobs/probes.go) | Prove the 16-era `op_bytes` multiplication separately from 18/19 byte counters. On 14, absent I/O must be unavailable/partial, not a passing zero. Existing full integration expectations assume I/O; do not run them unchanged and interpret that as an older-version verdict. |
| Availability and permissions | [`server_info.go`](../../backend/engine/postgres/server_info.go), [`get_cache_counters.sql`](../../backend/engine/postgres/queries/get_cache_counters.sql) | Preserve partial errors. Distinguish unsupported, denied, inapplicable, failed collection and observed zero. A successful SELECT on masked stats does not establish access to all data. |
| New types | [`table_metadata.go`](../../backend/engine/postgres/table_metadata.go), [`result_types.go`](../../backend/engine/postgres/result_types.go), [`value_convert.go`](../../backend/engine/postgres/value_convert.go) do not explicitly classify the new types | Test `oid8` unsigned limits, NULL, arrays, keys, pagination and full-cell round trips; test readable `regdatabase` names. The [official type contract](https://www.postgresql.org/docs/19/datatype-oid.html) warns about signed/unsigned conversion. Unclassified is not yet proven value loss. |
| Extension search path | Server health qualifies a discovered extension schema; [`get_top_queries.sql`](../../backend/engine/postgres/queries/get_top_queries.sql) uses unqualified `pg_stat_statements` | Reproduce custom-schema installation outside search_path; preserve unrelated insights with visible unavailability. No extension installation/loading is authorized. |
| Startup notices | [`postgres_notice.go`](../../backend/engine/postgres_notice.go) attaches query collectors after connection | Test SCRAM failures/success and password/legacy-auth startup warnings on disposable accounts. Query notices do not prove startup notice delivery. |
| SQL and EXPLAIN | [`validate_query.go`](../../backend/engine/postgres/validate_query.go), [`execute_query.go`](../../backend/engine/postgres/execute_query.go), [`read_only_sql.go`](../../backend/service/sqlsvc/read_only_sql.go) | Parse/Describe without execution; preserve read-only transactions and lexical checks. Capture server-generated JSON plans; preserve unknown fields. New syntax, including maintenance syntax, is not permission to execute it. |
| Cancellation | Query/service cleanup and timeout paths in the same files | Cancel, statement/lock timeout, early stream close, disconnect, then pool reuse. Assert no lingering transaction or exhausted connection budget; prefer SQLSTATE to localized messages. |
| Row identity | [`identity.go`](../../backend/engine/postgres/identity.go), [`pagination.go`](../../backend/engine/postgres/pagination.go), [`cell_value.go`](../../backend/engine/postgres/cell_value.go) | Physical `ctid` identities and cell/page tokens must not return another logical row after a rewrite. Signature/TTL alone do not establish identity. Require restart/reload or invalidation before maintenance exposure. |

New autovacuum scores, lock statistics and recovery views remain proposals. Require version **and** view/function/column discovery, access and semantic checks before bounded read-only collection. Recovery role and masked visibility must distinguish a primary, a restricted standby and a privileged standby. See the [official statistics contract](https://www.postgresql.org/docs/19/monitoring-stats.html). No new probe is implemented here.

Operational work is separate: [REPACK](https://www.postgresql.org/docs/19/sql-repack.html) needs authorization, eligibility, disk/WAL limits, lock/cancellation recovery and token invalidation. Planner advice needs installation/loading, scope and rollback review. Standby WAIT needs role/topology/LSN validation, a timeout and promotion handling. No automatic module load, grant, restart, maintenance or upgrade follows from this audit.

## Required runtime matrix

Every applicable server cell needs three independent logins: setup administrator; restricted `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` with explicit object access; and a monitoring login with `pg_read_all_stats` plus only required settings access. Include a distinct owner, hidden/revoked objects and row-level security. Brief administrator `SET ROLE` checks are insufficient.

| Environment | Required distinction | Status |
| --- | --- | --- |
| Instance 18 and pinned 19 | Catalog, SQL, types, permissions, notices, cancellation | Both infrastructure-blocked on November 4; all server behavior unverified. |
| Instance 16 and 14 | Older I/O conversion versus absent capability; version-aware expectations | Not attempted; not a supported-major-range claim. |
| Meta 18 and 19 | Migration owner versus application credential; up/down/up, persistence/restart | Unverified, including mixed instance/meta majors. |
| Standby, FDW and extension variants | Recovery visibility, remote read-only writes, missing/not-loaded/custom-schema extensions | Not attempted. |

## Portable revalidation runbook

Use disposable fixtures only. First check Docker health, image digest/architecture, `SELECT version()`, `server_version_num` and extension inventory. From the repository root:

```sh
task backend:test:unit
task backend:test:integration
```

The integration task selects both Integration and RPCSuite; the narrower CI name filter is not equivalent. For an explicitly pinned version, from `backend/`, after verifying the image above:

```sh
export QUERYLANE_TEST_POSTGRES_IMAGE='postgres:19rc1-alpine@sha256:a3095ec8782b77587ca34006edaf09df362212351745069cb7758e256ecd488f'
go test -count=1 -json -timeout 6m -run '^TestIntegration$' ./engine/postgres
go test -count=1 -json -timeout 10m -run '^TestRPCSuite$' ./integration/rpctest
```

Repeat with an independently verified stable-18 image, then the remaining matrix. These are future commands, not results of this PR. Inspect actual fixture execution and pass/fail/skip counts, not only exit status. Stop on provider skip, failed pull, denied-data leakage, write escape, leaked transaction/connection, changed unsigned value, wrong-row stale token or unavailable data represented as success/zero. Preserve the failure for a separately scoped repair. Do not change required stable checks or add a schedule to make this audit look complete.
