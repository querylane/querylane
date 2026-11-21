# PostgreSQL 19 readiness audit

Updated: 2026-11-10. Source review: repository baseline `5a7ae028cf34713951bb82016bf8e7d61cdf698d`. Dated runtime and release/image evidence below remains historical.

## ELI5

This is a checklist, not a promise that the next database version works. Attempts to test real servers stopped before any database query ran. Keep the existing version until real tests supply that evidence.

## Decision

Retain `postgres:18-alpine` as the integration-test baseline, not evidence that the full support matrix passed. This audit changes no backend, dependency, workflow, server configuration or upgrade behavior. A user-managed **instance** and Querylane's internal **meta database** require separate compatibility evidence. Neither is certified for PostgreSQL 19 by this document.

## Historical release and image checkpoint

Checked 2026-11-08: the [official release announcement](https://www.postgresql.org/about/news/postgresql-19-rc-1-released-3409/) (published October 15) still identifies RC1, with RC2 planned for November 12 and general availability planned for November 19. These are provisional recheck dates, not scheduled actions. The [19 release notes](https://www.postgresql.org/docs/19/release-19.html) label the version unsupported and show an October 9 content cutoff, not a final release date. The [upstream version policy](https://www.postgresql.org/support/versioning/) lists 18.6 as the current supported release and 14 through 18 as supported majors. This upstream list does not expand Querylane's tested-support baseline.

The [Docker Official Images manifest](https://raw.githubusercontent.com/docker-library/official-images/master/library/postgres) lists `19rc1-alpine`, including amd64 and arm64v8. A 2026-11-08 public Registry V2 manifest request for `library/postgres:19rc1-alpine` returned:

- OCI index: `sha256:0571e712ad11a80278d6850551ae50a224d1e27a0234bbdc7b39e8aed391f924`.
- linux/amd64: `sha256:d96ac5110a1f08a082c76a5cb23b8787e977324138fdd947cb74b5066f4ac5ab`.
- linux/arm64/v8: `sha256:ea33c8c422a4caf7b541ca5c77b6afa607bf36e43e7f99211d59c2e46c68531b`.

These digests supersede the November 5 snapshot: the tag is mutable. The response digest matched the SHA-256 of the index bytes. This confirms publication, not a pull, startup, extension inventory or SQL result. Recheck release status and image identity before every later run. Do not guess a final-version tag.

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

Docker provider/socket availability failed during these attempts. The later failed attempts supersede any reading of the earlier skipped run as success. On November 8, a bounded `docker info` check failed because the daemon socket was absent. No disposable Docker provider was available, and no current server compatibility test ran for this documentation publication. No SQL compatibility is verified.

## Source inventory and targeted follow-up

These are source findings and test requirements, not newly reproduced production incidents.

| Area | Repository evidence | Required proof before a support or feature claim |
| --- | --- | --- |
| Catalog shape | [`list_table_columns.sql`](../../backend/engine/postgres/queries/list_table_columns.sql), [`get_table_query_insights.sql`](../../backend/engine/postgres/queries/get_table_query_insights.sql) use explicit projections | Run catalog, generated/identity, partition, extension, role and dependency fixtures on the real candidate. Additive columns alone do not prove compatibility. |
| Key metadata | [`list_table_columns.sql`](../../backend/engine/postgres/queries/list_table_columns.sql) and [`discover_row_identity.sql`](../../backend/engine/postgres/queries/discover_row_identity.sql) match attributes against all of `indkey` | Test primary/unique indexes with INCLUDE columns. The [official index catalog](https://www.postgresql.org/docs/19/catalog-pg-index.html) distinguishes key columns (`indnkeyatts`) from included attributes in `indkey`. Verify flags and identity include only actual keys. This is a pre-existing source risk, not a reproduced PostgreSQL 19 regression. |
| Older I/O | [`get_io_metrics.sql`](../../backend/engine/postgres/queries/get_io_metrics.sql), [`probe_metrics.go`](../../backend/engine/postgres/probe_metrics.go), [`probes.go`](../../backend/runner/jobs/probes.go) | Prove the 16-era `op_bytes` multiplication separately from 18/19 byte counters. On 14, absent I/O must be unavailable/partial, not a passing zero. Existing full integration expectations assume I/O; do not run them unchanged and interpret that as an older-version verdict. |
| Availability and permissions | [`server_info.go`](../../backend/engine/postgres/server_info.go), [`get_cache_counters.sql`](../../backend/engine/postgres/queries/get_cache_counters.sql) | Preserve partial errors. Distinguish unsupported, denied, inapplicable, failed collection and observed zero. A successful SELECT on masked stats does not establish access to all data. |
| New types | [`table_metadata.go`](../../backend/engine/postgres/table_metadata.go), [`result_types.go`](../../backend/engine/postgres/result_types.go), [`value_convert.go`](../../backend/engine/postgres/value_convert.go) do not explicitly classify the new types | Test `oid8` unsigned limits, NULL, arrays, keys, pagination and full-cell round trips; test readable `regdatabase` names. The [official type contract](https://www.postgresql.org/docs/19/datatype-oid.html) warns about signed/unsigned conversion. Unclassified is not yet proven value loss. |
| Extension search path | [`server_info.go`](../../backend/engine/postgres/server_info.go) qualifies a discovered extension schema; [`get_top_queries.sql`](../../backend/engine/postgres/queries/get_top_queries.sql) uses unqualified `pg_stat_statements` | Reproduce custom-schema installation outside search_path; preserve unrelated insights with visible unavailability. No extension installation/loading is authorized. |
| Startup notices | [`postgres_notice.go`](../../backend/engine/postgres_notice.go) installs the notice router before connection, but attaches request collectors after acquiring a connection | Test SCRAM failures/success and password/legacy-auth startup warnings on disposable accounts. Query notices do not prove startup notice delivery. |
| SQL and EXPLAIN | [`validate_query.go`](../../backend/engine/postgres/validate_query.go), [`execute_query.go`](../../backend/engine/postgres/execute_query.go), [`read_only_sql.go`](../../backend/service/sqlsvc/read_only_sql.go) | Parse/Describe without execution; preserve read-only transactions and lexical checks. Capture server-generated JSON plans; preserve unknown fields. New syntax, including maintenance syntax, is not permission to execute it. |
| Cancellation | Query/service cleanup and timeout paths in the same files | Cancel, statement/lock timeout, early stream close, disconnect, then pool reuse. Assert no lingering transaction or exhausted connection budget; prefer SQLSTATE to localized messages. |
| Row identity | [`identity.go`](../../backend/engine/postgres/identity.go), [`pagination.go`](../../backend/engine/postgres/pagination.go), [`cell_value.go`](../../backend/engine/postgres/cell_value.go) | The [official system-column contract](https://www.postgresql.org/docs/19/ddl-system-columns.html) says `ctid` changes on updates and rewrites. Reject stale physical cell identities and restart pagination after rewrites. Prove invalidation before maintenance exposure; reload or a valid signature/TTL alone is not that proof. |

New autovacuum scores, lock statistics and recovery views remain proposals. Require version **and** view/function/column discovery, access and semantic checks before bounded read-only collection. Recovery role and masked visibility must distinguish a primary, a restricted standby and a privileged standby. See the [official statistics contract](https://www.postgresql.org/docs/19/monitoring-stats.html). No new probe is implemented here.

Operational work is separate: [REPACK](https://www.postgresql.org/docs/19/sql-repack.html) needs authorization, eligibility, disk/WAL limits, lock/cancellation recovery and token invalidation. [Planner advice](https://www.postgresql.org/docs/19/pgplanadvice.html) needs installation/loading, scope and rollback review. [Standby WAIT](https://www.postgresql.org/docs/19/sql-wait.html) needs role/topology/LSN validation, a timeout and promotion handling. No automatic module load, grant, restart, maintenance or upgrade follows from this audit.

## Required runtime matrix

**UNVERIFIED as of 2026-11-10:** this source-only refresh supplies no new live version, privilege or runtime-matrix results.

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
export QUERYLANE_TEST_POSTGRES_IMAGE='postgres:19rc1-alpine@sha256:0571e712ad11a80278d6850551ae50a224d1e27a0234bbdc7b39e8aed391f924'
go test -count=1 -json -timeout 6m -run '^TestIntegration$' ./engine/postgres
go test -count=1 -json -timeout 10m -run '^TestRPCSuite$' ./integration/rpctest
```

Repeat with an independently verified stable-18 image, then the remaining matrix. These are future commands, not results of this PR. Inspect actual fixture execution and pass/fail/skip counts, not only exit status. Stop on provider skip, failed pull, denied-data leakage, write escape, leaked transaction/connection, changed unsigned value, wrong-row stale token or unavailable data represented as success/zero. Preserve the failure for a separately scoped repair. Do not change required stable checks or add a schedule to make this audit look complete.
