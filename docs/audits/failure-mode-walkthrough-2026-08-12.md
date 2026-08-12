# Failure-mode walkthrough — 2026-08-12

Tracking issue: [#112](https://github.com/querylane/querylane/issues/112)

## Objective

Break a local Querylane stack on purpose and grade what the user sees:

1. Is the failure surfaced?
2. Is the message actionable and attributed to the correct dependency?
3. Can the user recover after the dependency returns without restarting Querylane or reloading the browser?

The walkthrough produced one issue for each bad experience. It did not implement fixes.

## Environment

- Querylane commit: `484b1834`
- macOS with Docker Desktop 29.4.3
- PostgreSQL 17 containers for the meta and target databases
- Chrome against the Rsbuild development frontend
- Isolated audit ports: meta database `5532`; target databases `5550`–`5553`
- Toxiproxy 2.12.0 for latency and response blackholes
- A bounded 32 MiB HFS volume for embedded PostgreSQL ENOSPC reproduction

The target stack used the repository's seed configuration with the ports changed only to avoid other local workspaces.

## Results

| Scenario | Surfaced | Actionable | Recovers without restart | Result |
| --- | --- | --- | --- | --- |
| Meta database stopped and restarted mid-session | No | No | Partial: manual Refresh after restart | [#312](https://github.com/querylane/querylane/issues/312) |
| Target PostgreSQL stopped during `ReadRows` pagination | Yes, but paired with a false empty state | Yes | Yes: restart target, then Retry | [#313](https://github.com/querylane/querylane/issues/313) |
| `SELECT` revoked while browsing a table | Wrong failure: resource not found | No | Yes: restore grant, then Retry | [#314](https://github.com/querylane/querylane/issues/314) |
| Previously healthy credentials rotated | Raw failure only | No UI correction path | Partial: correct external config, then Refresh | [#315](https://github.com/querylane/querylane/issues/315) |
| Querylane backend restarted while frontend stayed open | Misleading target status | No | Yes: restart backend, then Refresh | [#316](https://github.com/querylane/querylane/issues/316) |
| Embedded PostgreSQL setup ran out of disk | Yes, wrong classification | No | Yes: add capacity, then Retry resumes setup | [#317](https://github.com/querylane/querylane/issues/317) |
| 3G-class latency: 400 ms each way and 200 KB/s downstream | Yes: Connecting to Querylane | Yes | Automatic | Pass |
| Frontend-to-backend responses blackholed through boot deadline | Yes | Wrong dependency guidance | Yes: restore path, then Retry | [#318](https://github.com/querylane/querylane/issues/318) |

## Walkthrough notes

### Meta database outage

After the meta database stopped, the backend returned `unavailable` for database-backed RPCs. The overview changed the target badge to **Disconnected**, retained old target health details, changed the database count to zero, and remained on **Loading databases…** without an error for several minutes. Restarting the meta database did not automatically clear the state; **Refresh data** recovered it.

### Target outage during row reads

Stopping the selected target before requesting the next table page produced a useful **PostgreSQL instance unavailable** alert and retry guidance. The same panel also claimed **This table is empty** and reset pagination to page 1 of 1. Restarting the target and choosing **Retry** restored the requested page.

A separate `StreamRows` export interruption was not executed. The current Data Explorer UI exposed no export action in this build, and `exportStreamRows` had no frontend call site. The former timeout defect tracked by #91 is closed.

### Privilege revocation

Revoking `SELECT` on the open table and terminating the role's pooled sessions made `ReadRows` return `not_found`. Data Explorer showed **Resource not found** and `table not found` above the still-visible rows. Restoring `SELECT` and choosing **Retry** recovered immediately.

### Credential rotation

Changing the configured role password and terminating existing sessions caused the overview to print the complete nested pgx/SASL error, including the host, role, database, and SQLSTATE. The health list recognized that there was no authenticated session, but the page offered no credential update action or targeted guidance. Restoring the credential and refreshing recovered without restarting Querylane.

### Backend restart

With the backend stopped, the overview retained **Connected** and live-looking target data. The only visible failure said **Metrics unavailable** and advised checking the instance connection. After the backend restarted, the existing tab recovered on **Refresh data**.

### Slow and stalled network

With 400 ms latency in each direction plus a 200 KB/s downstream cap, boot showed **Connecting to Querylane** and completed in about seven seconds.

With downstream responses blackholed, boot stayed on that loading screen until the request deadline. It then showed **Request timed out**, but advised that a database instance might still be starting even though the failed path was between the frontend and Querylane. Removing the blackhole and choosing **Retry** recovered.

### Disk full during embedded setup

Embedded setup ran with about 3 MiB free and failed while extracting PostgreSQL with `no space left on device`. The wizard categorized it as **May be a transient issue**, suggested Retry or connection reconfiguration, and exposed the absolute extraction path. After the volume was expanded, **Retry** returned the same session to setup progress without restarting Querylane.

WAL-growth exhaustion was not repeated separately; the bounded audit covered the embedded setup branch of the disk-full scenario.

## Cleanup

The audit used an isolated Compose project, temporary configuration under `.context`, a temporary disk image, and a dedicated proxy container. None is required to reproduce the findings from the linked issues.
