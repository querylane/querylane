# Bounded UI investigation decisions

Updated: 2026-11-13 (source/link review only; no runtime experiments rerun). Source checkpoint: main at `968c028dca349ce52423214cacd7b608f3cc1d52`, including #388, #389, #407, #411 and #416. External API references last checked on 2026-11-10; repository source and locked versions govern Querylane's integration.

## ELI5

These decisions keep unproved changes out of the application. Each open idea needs a small test with a clear reason to stop. An existing column-selection feature does not need to be built again.

## Scope and evidence

Audience: maintainers choosing the next focused investigation. No experiment, dependency, persistence store, renderer alias, production fetch change, workflow or schedule is enabled by this record. Source structure is not emitted-artifact, timing or waterfall evidence, nor a measured speed, memory, usability or CI improvement. November 4 observations below are reported history, not rerun or revision-bound acceptance evidence. No current emitted chunk inventory or paired transfer/first-paint measurement is supplied. Future probes must declare exact source revisions, fixtures, environment, metric and a worthwhile threshold before comparing results. Behavior changes need a regression that fails before the repair.

## Q08: Defer detail-tab code splitting

[`explorer-resource-detail.tsx`](../../frontend/src/features/data-explorer/explorer-resource-detail.tsx) lazily imports table detail and eagerly imports the view-detail module. [`explorer-table-detail.tsx`](../../frontend/src/features/data-explorer/explorer-table-detail.tsx) wraps its header/tabs in the grid's render-prop lifetime. [`explorer-view-detail.tsx`](../../frontend/src/features/data-explorer/explorer-view-detail.tsx) also imports the grid, but renders it only for populated materialized views. Ordinary view detail has no data tab or grid. A table-only lazy body does not establish removal of grid bytes from emitted route assets. Table URL `tab` and the materialized view's local default-data tab are not equivalent deep-link contracts.

The [explorer route loader](../../frontend/src/routes/instances/$instanceId/databases/$databaseId/explorer.tsx) starts selected-table code before loading its route-data helper; its [preload selector](../../frontend/src/routes/instances/$instanceId/databases/$databaseId/database-explorer-preload.ts) does not inspect the table tab. Moving discovery to render time could delay default-data readiness; that is a hypothesis, not an observed waterfall. No additional detail-tab split is adopted. Reopen only after exact-revision paired cold-transfer/request traces identify avoidable work in **both** importers, while a candidate preserves default-data discovery, headers, repeated tab lifetime, local pending/error handling and deep links. An unrevisioned generated chunk list is neither transferred bytes nor a baseline comparison.

## E01: Defer server-query persistence

[`query-client.ts`](../../frontend/src/lib/query-client.ts) is in-memory; [`query-policy.ts`](../../frontend/src/lib/query-policy.ts) and [`db-persistence.ts`](../../frontend/src/lib/db-persistence.ts) already separate server freshness from navigation persistence. Keep the server-data persistence allowlist empty. First measure reload-to-useful-action against warm navigation with identical fixtures and explicit cold/warm conditions. Stop if repeated eligible data is not the bottleneck.

Before implementation, approve endpoint/field sensitivity, schema version, expiry/byte limits, deployment and verified principal/session-generation scope. Require access revalidation, purge on session/access/schema/instance change, cancellation of stale restores/writes, explicit clear and bounded usable recovery from quota, eviction, unavailable or stalled storage. Instance ID alone is not a user boundary. Object names and definitions are not automatically safe to persist. No reload benefit or identity/purge lifecycle is established.

## E02: Reject another local collection store without an unmet task

[`sql-workbench-store.ts`](../../frontend/src/features/sql-workbench/sql-workbench-store.ts) already persists database-scoped SQL drafts, saved queries and history through Zustand's [`persist` middleware](https://zustand.docs.pmnd.rs/reference/middlewares/persist.html). Preserve it and ConnectRPC/Query ownership of server data. No local collection dependency or duplicate SQL copy is added. Draft SQL can contain secrets.

Reopen only for a named draft-search/join task the existing selectors cannot handle. First test the current store on a bounded dataset; stop if it suffices. A later comparison needs startup restoration, retained heap, disk bytes, edits, cross-tab conflicts, export/deletion/recovery and blocked-storage/upgrade behavior. Historical external API research is not an installed capability or a current API guarantee; revalidate any candidate library before use.

## E03: Defer an alternate React renderer

Native React remains production. No alias, build mode or runtime switch is added. [`main.tsx`](../../frontend/src/main.tsx), [`rsbuild.config.ts`](../../frontend/rsbuild.config.ts) and table detail's [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue) grid-mount gate are integration constraints, not proof another renderer is compatible.

First show renderer bytes dominate a real route. Only then evaluate a version-pinned disposable adapter covering compiler output, deferred grid input, portals/focus, external stores, errors, lazy loading, router navigation and diagnostics. Compare exact-revision bytes and interactions; stop on a scheduler/UI incompatibility or duplicated native runtime. Historical third-party bundler/API documentation does not establish an Rsbuild adapter or installed support. No byte, responsiveness or memory benefit is measured.

## E04: Probe secondary-metadata contention only

[`explorer-table-detail.tsx`](../../frontend/src/features/data-explorer/explorer-table-detail.tsx) shares metadata queries between panels and counts; keys and Columns inventory need both constraints and indexes, while foreign-key references use constraints. [`table-data-query.ts`](../../frontend/src/features/data-explorer/table-data/table-data-query.ts) requires the column catalog when validating selected columns, sorting or filters, not for every unfiltered row request. Preserve these shared dependencies and unknown counts before any staging proposal. The [read-mask contract](../adr/list-response-read-masks.md) leaves table-detail metadata responses complete; hiding columns does not make those endpoints projected or their SQL cheaper.

Trace one fixed synthetic route before proposing a change. Compare first usable rows, active-tab readiness, request concurrency and unknown/loading/failed badge transitions. Mock delays alone do not prove live contention. Stop if no limiting resource or worthwhile paired delta exists. Preserve immediate active-tab dependencies, one query identity, refresh/error behavior and unknown counts rather than fake zero. Production fetching stays unchanged.

## E05: Already supplied by #388; no duplicate visibility implementation

[#388](https://github.com/querylane/querylane/pull/388) supplies shared list visibility, a Columns selector, validated root URL state and independent list keys, including the Columns inventory key `data-explorer-table-columns`. See [`columns-tab.tsx`](../../frontend/src/features/data-explorer/explorer-table-detail/columns-tab.tsx), [`list-columns.ts`](../../frontend/src/lib/list-columns.ts), [`list-columns-provider.tsx`](../../frontend/src/components/list-columns-provider.tsx), [URL policy](../adr/frontend-url-state-policy.md) and [read-mask policy](../adr/list-response-read-masks.md).

The shared provider now also carries URL-backed column order and sorting. Preserve this extended upstream path rather than introducing another visibility implementation.

Preserve that upstream capability and its selection/reload/reset/provider tests during table relocation. It is not newly authored work from this investigation. Do not add another persistence store, switch shareable selection to personal settings, or impose a new always-visible identifying column. Existing required-column and last-visible-column rules remain authoritative. Hidden UI columns must retain filtering/sorting and dependency-safe response fields.

Only a genuinely unmet usability/preference requirement can reopen this topic. A bounded named-column/type task at narrow and desktop widths could compare current hiding/scrolling and reset/reload usability. No task-time, canonical-pixel or need-for-different-policy evidence is established.

## E06: Defer chart zoom and gestures

[`metrics.ts`](../../frontend/src/lib/metrics.ts) and [`metrics.proto`](../../proto/querylane/console/v1alpha1/metrics.proto) use absolute half-open intervals and a separate prior-window request. Response steps are authoritative; preset helpers do not establish safe arbitrary input.

Reopen for a named incident-window task presets cannot serve. First validate explicit start/end, time zone, fixed historical refresh, same-length comparison, stale-response handling and point/read-cost bounds. Only an accepted interval contract could justify controls; gestures additionally need pointer cancellation, Escape/focus recovery, touch scrolling and keyboard alternatives. No wheel zoom, brush or chart change is enabled. Retention/read cost and usability remain unmeasured. Any later implementation must coordinate with then-current chart ownership, not rely on an obsolete in-progress status.

## E07: Measure visual build cost before artifact reuse

[`frontend-ci.yml`](../../.github/workflows/frontend-ci.yml) configures separate visual shards; [`playwright.config.ts`](../../frontend/e2e/playwright.config.ts) already supports `QUERYLANE_E2E_SKIP_BUILD`. That switch alone supplies neither a shared artifact producer nor artifact-identity validation. Configured build invocation counts are not measured saved time.

First inspect existing build/test phase timings. If material, compare redundant builds with one same-revision, same-lockfile/config/environment harness producer, including upload/download/extraction, shard readiness, runner-seconds and total critical path. Stop if overhead or variance removes the benefit. Require complete identity-checked harness assets and theme initializer; missing/mismatched output must fail. Harness output is not ordinary-production byte-budget or route-byte evidence. Keep canonical pixels, strict aggregation, independent production builds and existing caps. No CI savings or workflow change is claimed.

## E08: Reproduce font/scroll tooltip behavior before changing primitives

[`overflow-tooltip.tsx`](../../frontend/src/components/ui/overflow-tooltip.tsx) measures overflow after content/class changes and resize; [`tooltip.tsx`](../../frontend/src/components/ui/tooltip.tsx) delegates positioning to [Base UI's Tooltip.Positioner](https://base-ui.com/react/components/tooltip#positioner). Missing wrapper CSS or a font listener does not establish a defect. November 4 Chromium light/dark hover checks were reported as passing for ordinary truncation only, not delayed fonts or clipped anchors. They were not rerun for this source checkpoint.

A bounded fixture should control late loading of an existing font and prove the measured overflow threshold changes. Exercise multiline/long tokens, nested scrolling, fully clipped anchors, readable popup bounds, Escape/focus and resize cleanup. Stop without production edits if the hypothesis is not reproduced. Any demonstrated primitive repair needs its registry owner and canonical evidence; do not incidentally fork or tune shared primitives. No font/scroll defect is currently reproduced.

## E09: Keep external pre-paint theme initialization

[`theme-init.js`](../../frontend/public/theme-init.js), [`theme-provider.tsx`](../../frontend/src/theme-provider.tsx) and the parser-blocking head script in Rsbuild already target pre-paint theme selection. [`startup.spec.ts`](../../frontend/e2e/tests/startup.spec.ts) tests saved/system/invalid/blocked-storage paths under an enforcing same-origin script policy. That test policy does **not** prove deployed headers. Historical theme-provider units are not a fresh startup E2E result.

The existing startup contract is already represented in source and tests; defer inlining. Those tests were not rerun for this decision update. First measure cold/warm external-script timing and first paint under a declared deployment/cache/network profile. Stop if request cost is not material. Any future inline proposal needs deployment ownership, a reviewed nonce/hash design and unchanged restrictive startup checks. Do not add unsafe-inline or replace enforcement with report-only. Actual deployed policy and request/rendering benefit remain unverified.

## Reopening protocol

Choose one question and one owner, use synthetic non-sensitive data, and keep production defaults unchanged. Declare success and stop criteria in advance. Preserve errors, permission limits, loaded-versus-global scope and missing evidence. Tests of existing contracts can establish a baseline, but cannot stand in for measured benefit or acceptance of an unimplemented experiment. Remove this decision record to revert documentation only; no application state needs migration.
