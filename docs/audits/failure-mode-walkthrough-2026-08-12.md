# Failure-mode walkthrough and remediation — 2026-08-12

Tracking issue: [#112](https://github.com/querylane/querylane/issues/112)

## Objective

Break a local Querylane stack on purpose and verify that each dependency or network failure:

1. is surfaced without contradictory state;
2. names the failing dependency and gives a useful recovery action;
3. recovers after the dependency returns without restarting Querylane or reloading the browser.

The first walkthrough created one issue for each bad experience. This PR resolves all seven findings and repeats the failure and recovery paths against the current implementation.

## Environment

- Base commit: `484b1834`
- Remediation branch: `ben-malinski/112-failure-ux-walkthrough`
- macOS with Docker Desktop 29.4.3
- PostgreSQL 17 containers for the meta and target databases
- Chrome against the Rsbuild development frontend
- Isolated replay ports: meta database `5532`; target databases `5550`–`5553`; backend `8188`; frontend `3188`
- A bounded 32 MiB HFS volume, expanded to 512 MiB for recovery, for embedded PostgreSQL ENOSPC replay

The target stack used the repository seed data with ports changed only to avoid other local workspaces.

## Results

| Scenario | Before | Current behavior and recovery | Tracking |
| --- | --- | --- | --- |
| Meta database stopped mid-session | Target shown as disconnected; catalog disappeared; recovery was unclear | **Meta database unavailable** identifies Querylane's store, cached catalog stays visible with a stale marker, status becomes **Status unavailable**, and **Retry** recovers after restart | [#312](https://github.com/querylane/querylane/issues/312) |
| Target PostgreSQL stopped during row reads | Correct error plus false empty state and reset pagination | Existing same-request rows and pagination remain visible as stale; a first-load failure shows neither empty-state nor fake pagination; **Retry** recovers | [#313](https://github.com/querylane/querylane/issues/313) |
| `SELECT` revoked while browsing a table | `not_found` / **Resource not found** | `ReadRows` returns canonical `permission_denied` with `ErrorInfo`, SQLSTATE `42501`, typed PostgreSQL detail, and after-correction retry guidance; restoring the grant makes the same request succeed | [#314](https://github.com/querylane/querylane/issues/314) |
| Previously healthy credentials rotated | Raw pgx/SASL error with host, role, database, and SQLSTATE; no stale marker | **PostgreSQL authentication failed** explains the correction, hides raw details behind disclosure, links to credential configuration when UI-managed, and marks retained data stale; restoring the password plus **Refresh data** recovers | [#315](https://github.com/querylane/querylane/issues/315) |
| Querylane backend stopped while the frontend stayed open | Target still shown as connected; target-focused metrics guidance | **Cannot reach Querylane** attributes browser transport failure to the backend, target status becomes unavailable, cached rows stay marked stale, and **Retry** recovers after restart | [#316](https://github.com/querylane/querylane/issues/316) |
| Embedded PostgreSQL setup ran out of disk | Classified as transient; exposed absolute path; offered irrelevant reconfiguration | **Storage full** gives disk-specific recovery, omits reconfiguration and bug-report actions, keeps raw paths under **Error details**, and suppresses the duplicate raw-error toast; expanding the same volume plus **Retry** completes all five setup steps | [#317](https://github.com/querylane/querylane/issues/317) |
| Frontend-to-backend responses exceeded the boot deadline | Timeout copy suggested that a target database was starting | **Cannot reach Querylane** names the backend/network path and **Retry** resumes boot after reachability returns | [#318](https://github.com/querylane/querylane/issues/318) |
| 3G-class latency: 400 ms each way and 200 KB/s downstream | **Connecting to Querylane** then automatic completion | Unchanged pass | — |

## Implementation notes

### Dependency attribution and cached state

The instance page now treats meta-database and Querylane-server failures as dependency failures rather than target PostgreSQL health. It keeps successful instance and database query data in TanStack Query, marks it as last-loaded data, and never keeps a live-looking **Connected** badge while the dependency is unavailable.

### Table rows

The grid relies on TanStack Query's successful same-key snapshot during failed refetches. Errors disable forward pagination but do not replace rows with **This table is empty**. New page, filter, sort, column, and table keys do not borrow rows from a different request.

### PostgreSQL authorization

`ReadRows`, `StreamRows`, and `ReadCellValue` no longer perform a catalog-resolver preflight that could disguise a PostgreSQL authorization failure as a missing resource. The live query is the authority and flows through the existing SQLSTATE adapter.

This follows [AIP-193](https://google.aip.dev/193): the response uses canonical `PERMISSION_DENIED`, includes `google.rpc.ErrorInfo`, and carries structured PostgreSQL diagnostics. It also follows [AIP-211](https://google.aip.dev/211) by returning permission denied rather than false not-found. No protobuf, HTTP binding, resource name, or generated retry-policy change was required.

### Safe connection failures

Persisted instance runtime errors are reduced to stable authentication, timeout, reachability, or generic messages. Raw driver text remains available only in the current request's explicit technical details, not in durable runtime state or the default overview and health copy.

### Embedded setup

Disk-exhaustion detection covers ENOSPC and common storage-full messages. The error summary gives one applicable action, and the setup mutation is marked as handled inline so the global mutation cache does not produce a second raw toast.

## AIP review

`ReadRows` is an existing data-plane method. The review walked all 72 published General AIPs; seven apply to this behavioral and error-contract correction.

| AIP | State | Applicability | Result and evidence |
| --- | --- | --- | --- |
| [1](https://google.aip.dev/1) | Approved | Select authoritative guidance | Pass — approved AIPs are the review baseline |
| [111](https://google.aip.dev/111) | Approved | `ReadRows` operates on user table data | Pass — treated as a data-plane method without redesigning its established resource-oriented facade |
| [147](https://google.aip.dev/147) | Approved | Connection failures can contain credential-shaped data | Pass — persisted/default UI errors are sanitized and diagnostic disclosure is explicit |
| [180](https://google.aip.dev/180) | Approved | Public error semantics change from false not-found to permission denied | Pass — request, response, wire shape, resource names, and successful behavior stay compatible; the corrected failure is machine-readable |
| [181](https://google.aip.dev/181) | Approved | Compatibility depends on stability | Pass — the existing package is `v1alpha1`, and the correction removes misleading behavior without a schema break |
| [193](https://google.aip.dev/193) | Approved | Canonical status and structured details | Pass — HTTP 403 / `PERMISSION_DENIED`, `ErrorInfo`, SQLSTATE `42501`, and one typed PostgreSQL detail are asserted at the real RPC boundary |
| [211](https://google.aip.dev/211) | Approved | Protected table read | Pass — the live PostgreSQL read determines access; the removed catalog preflight no longer converts denied access to not-found |

The remaining 65 AIPs are not applicable:

- AIP process or terminology without an AIP proposal: 2, 3, 8, 9, 100.
- Resource, method, or lifecycle shape not changed: 121, 122, 123, 124, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 151, 156.
- Field shape or field semantics not changed: 140, 141, 142, 143, 144, 145, 146, 148, 149, 202, 203, 216.
- Optional design patterns not introduced: 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 210, 214, 217.
- Versioning, dependency, documentation, retry-policy, precedent, or common-proto trigger absent: 182, 185, 190, 191, 192, 194, 200, 205, 213, 215.
- Batch or policy-preview method absent: 231, 233, 234, 235, 236.

`api-linter` is not applicable because no `.proto` or OpenAPI surface changed. The real Connect JSON response and generated types were exercised instead.

## Replay receipt

**Verdict: PASS**

- **Entrypoints:** Chrome at the real instance overview, Data Explorer, and onboarding wizard; Connect JSON `TableDataService/ReadRows` at the public HTTP endpoint.
- **Use:** loaded a two-database instance overview; loaded 50 live customer rows from a seeded table; completed the normal row retry; sent a real named `ReadRows` request.
- **Abuse:** stopped the target database before both a same-key refresh and an initial row load; stopped the meta database; stopped the Querylane backend; rotated and restored a live PostgreSQL password; revoked and restored `SELECT`; filled the embedded-data volume to 3 MiB free; retried setup while still full.
- **Observations:** target failures retained 50 rows or suppressed the initial empty state; a failed page transition retained the prior rows as stale while hiding misleading page controls, then recovered to page 2; meta and backend failures retained two catalog rows with unavailable/stale state; revoked `SELECT` returned HTTP 403, `PERMISSION_DENIED`, SQLSTATE `42501`, and typed retry guidance; rotated credentials exposed no host/SASL/SQLSTATE copy before disclosure; disk exhaustion showed no raw toast or absolute path and no **Reconfigure** or **Report bug** action.
- **Repairs during replay:** classified browser `Failed to fetch` as Querylane reachability; added the connection-failure stale marker; silenced the duplicate handled setup toast; removed redundant component state identified by React Doctor.
- **Replay:** restarting each dependency and choosing **Retry** or **Refresh data** recovered in the same tab. Expanding the HFS volume from 32 MiB to 512 MiB and choosing **Retry** completed all five embedded setup steps.
- **Limits:** the unused `StreamRows` export path and separate WAL-growth exhaustion were not replayed because this build exposes no export call site and the changed behavior is shared with the exercised row-query and embedded-setup paths.

## Automated evidence

- Frontend: lint, TypeScript, production build with bundle budget, React Doctor changed-scope scan, all 1,266 unit tests, and all 353 changed-impact integration tests.
- Backend: format, golangci-lint, SQL lint, all unit packages, focused storage integration tests, and a real RPC integration test for revoked `SELECT`.
- The authorization regression was first observed red as `CodeNotFound`, then green as `CodePermissionDenied` with SQLSTATE `42501` and both required structured details.

## Cleanup

The replay used isolated Compose services, temporary configuration under `.context`, and a temporary disk image. The services and mounted image were stopped after verification; no replay artifact is required by the product or tests.
