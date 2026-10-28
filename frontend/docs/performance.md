# Frontend performance measurement

Querylane stays client-side only. Measure performance in 4 layers instead of trusting 1 score.

## Local commands

```bash
cd frontend
bun run build                    # hard gzip bundle budgets
bun run dev:scan                 # local React Scan + default global Compiler
bun run perf:lighthouse          # build, run Lighthouse CI, print summary
bun run perf:lighthouse:public   # one run, upload public Google report links
bun run test:e2e -- --grep @perf # mocked task-level Data Explorer budgets
bun run build:profile            # Rsdoctor route chunk analysis
bun run doctor:full              # React Doctor full health gate
```

React Scan is local-only and opt-in. `dev:scan` serves the exact pinned package
asset before React; normal development and production builds omit it. A build
with `QUERYLANE_REACT_SCAN=1` is rejected. React Compiler runs globally in
`infer` mode by default. For single local comparisons, set
`QUERYLANE_REACT_COMPILER_MODE=annotation` on `dev` or `build` directly.
Verify compilation through the production build output and React DevTools.

See the [2026-07-16 React performance audit](react-performance-audit-2026-07-16.md)
for the 5-run baseline, compatibility findings, and raw measurements.

Lighthouse HTML and JSON reports are written to `frontend/dist/lighthouse`.
Public report links use Lighthouse CI temporary public storage. Those links are
shareable and intended for CI logs or pull request comments. They are not the
long-term source of truth; keep bundle budgets and local assertions as the hard
gate.

## Rsdoctor analysis loop

Querylane already uses Rsbuild 2; it is one web app, not a Module Federation host.
Rsdoctor 2 is opt-in through `build:profile`. Normal builds do not collect profiles.
The pinned Agent CLI reads local reports without an MCP server or external upload.
See the upstream [migration guide](https://rsdoctor.rs/guide/migration/migration-v2)
and [Agent CLI documentation](https://rsdoctor.rs/guide/start/ai).

From `frontend/`:

```bash
# Baseline before changing imports or chunking. This cleans dist, not the build cache.
bun run build:profile
# Keep the baseline outside dist: the next build replaces that directory.
cp dist/rsdoctor-data.json /tmp/querylane-rsdoctor-baseline.json

bun run analyze bundle optimize --data-file dist/rsdoctor-data.json
bun run analyze tree-shaking summary --data-file dist/rsdoctor-data.json
bun run analyze tree-shaking retained-modules --emitted-only --sort parsedSize --limit 25 --data-file dist/rsdoctor-data.json
bun run analyze loaders hot-files --data-file dist/rsdoctor-data.json

# Drill into a retained module, then trace the ID returned by this query.
bun run analyze modules by-path --path chrono-node --data-file dist/rsdoctor-data.json
# bun run analyze modules issuer --id <returned-id> --data-file dist/rsdoctor-data.json

# After one evidence-backed change, rebuild and compare.
bun run build:profile
bun run analyze assets diff --baseline /tmp/querylane-rsdoctor-baseline.json --current dist/rsdoctor-data.json --data-file dist/rsdoctor-data.json
```

Open `dist/rsdoctor-report.html` for the visual overview, compilation analysis,
and bundle tree. Use `bun run analyze --describe` and `--schema <group.command>`
to inspect supported commands/options. A missing data file fails with a nonzero
exit; regenerate it with `build:profile` before querying again.

### Measurement boundaries

- Module sizes help locate retained code, not estimate download savings. Concatenated
  parent/child entries can describe the same emitted code. Do not sum module gzip sizes.
- No rule alerts does not mean every retained module is needed. Inspect emitted chunks,
  issuer chains, and source before making a change. Empty export data is not proof of
  perfect tree-shaking.
- Agent CLI 0.1.1's `assets diff` reported zero initial JS/CSS assets for this build
  despite three initial chunks. Use `budget:check` for initial payload and request counts;
  do not treat that CLI field as a first-load measurement.
- Budgets use Node's default `gzipSync`/Brotli compression. Initial payload counts
  scripts/styles referenced by `index.html`, including theme initialization, but not
  fonts, HTML, API responses, or route-navigation downloads. Total payload counts app
  HTML/JS/CSS, not the profiler's HTML/JSON, source maps, fonts, or images.
- Profiling changes chunk IDs and adds analysis overhead. Compare normal production
  builds for user payload or build-speed claims. For build timing, use the same machine,
  environment and locked dependencies, clear `dist` and `node_modules/.cache/rsbuild`
  before each run, and report the median of three runs per revision. Do not mix cold
  and warm builds or include profiler timing in normal-build claims.
- Keep only improvements that clear a declared worthwhile threshold. Re-run the same
  route journey for navigation claims; this profile alone does not measure a journey.

### Baseline: October 28, 2026

At `e7196590`, a normal production build on macOS arm64, Bun 1.4.4, Node 26.12.1,
Rsbuild 2.2.10 and Rspack 2.2.9 reported:

| Metric | Baseline |
| --- | ---: |
| Initial scripts/styles, gzip | 337.4 KiB |
| Initial JavaScript, gzip | 303.0 KiB |
| Initial script/style requests | 5 |
| All application HTML/JS/CSS, gzip | 1395.5 KiB |
| Largest async script, gzip | 111.6 KiB |

### Implemented validation-runtime improvements

The normal production build now reports **326.3 KiB initial gzip**, **292.0 KiB
initial JavaScript gzip**, and **1371.7 KiB total application HTML/JS/CSS gzip**.
The initial script/style request count stays at five. Compared with the baseline,
that removes **11,301 initial gzip bytes (3.27%)** and **24,414 total gzip bytes
(1.71%)**. These are emitted-payload measurements, not load-time or route-journey
speed claims. The comparison uses the same machine, locked packages, production
configuration and `collectBundleBudgetStats` compression; normal builds were
measured separately from instrumented builds.

Two changes implement the Rsdoctor findings:

- Browser schemas use `zod/mini`'s functional API instead of Classic. They import
  `@/lib/zod-locale` to retain English validation messages. Node-only tooling keeps
  its existing Classic imports. URL search, persisted drafts, and public environment
  variables retain their validation and transformation behavior.
- `buf.gen.yaml` pins protoc-gen-es 2.15.0 and maps `buf/validate/` imports to
  `@bufbuild/protovalidate/gen`. Generated API schemas and the validation runtime
  therefore share one canonical descriptor. Validation annotations are preserved,
  not stripped or deferred. Regenerate with `task proto:generate`; never edit
  generated output. See the generator's [map_imports release notes](https://github.com/bufbuild/protobuf-es/releases/tag/v2.15.0)
  and [Zod Mini documentation](https://zod.dev/packages/mini).

The descriptor-only experiment reduced total gzip by 9,959 bytes but grew initial
payload by 3,201 bytes. It missed the independent startup guardrail. The combined
slice is retained because the Mini change more than offsets that cost while
removing the duplicate descriptor overall. Do not describe descriptor sharing
alone as a startup optimization.

Rsdoctor's final emitted graph contains one canonical validation descriptor and no
local validation-descriptor copy, Zod Classic modules, or Zod JSON-schema conversion
modules. Its rule report has no alerts; that is not a general proof of perfect
bundling. React DOM remains eager, while CodeMirror, charts, React Flow, the
validation engine, and SQL highlighting remain deferred.

Verification includes a failing-before descriptor-identity assertion, actual
required-field/range and message-level CEL validation, binary/JSON round trips,
English multi-error output, existing search/draft tests, and a failing-before
startup byte-budget gate. The 28 generated encoded file descriptors are unchanged;
only dependency imports and generator-produced TypeScript declarations changed.

### Further experiments: rejected, not shipped

A follow-up pass compared normal builds against `8d8b8a64`, using the same byte
collector and locked dependencies. Rsdoctor traced an eager import from the SQL
workbench route to the shared prefetch registry, including table and extension
RPC schemas. Deferring it lowered initial bytes, but duplicated small modules
across async chunks. Initial bytes alone were not sufficient evidence to keep it.

| Experiment | Initial gzip change | Total app gzip change | Decision |
| --- | ---: | ---: | --- |
| Dynamic workbench prefetch import only | −9,302 bytes | +8,217 bytes | Reverted |
| Separate common, explorer and extension prefetch factories | −9,143 bytes | +8,763 bytes | Reverted |
| Split factories plus targeted shared async query chunk | −9,102 bytes | +3,904 bytes | Reverted |

Before the shared-chunk revision, the acceptance ceiling was set at 2 KiB total
growth while retaining at least 5 KiB initial savings. That revision still missed
the ceiling. Rsdoctor confirmed the cause: the factory split emitted the infinite
query observer in five chunks and the extension descriptor in three; the shared
group removed those duplicates but did not offset the remaining output growth.
The import-only variant also missed the ceiling. All candidate code and cache
groups were discarded; the implemented measurements above remain unchanged.

The narrower import-only variant would benefit setup and empty deployments, not
necessarily existing-instance startup: instance loaders already import that same
registry. Moving bytes out of `index.html`'s initial assets does not prove a
smaller cold route journey. Existing mocked Data Explorer readiness and navigation
payload gates passed on the retained implementation without relaxed limits.

A Tailwind compiler probe restricting source detection to `src` produced a
negligible CSS reduction and was also discarded. Investigation reports stay local
because they contain absolute paths and source/configuration details.


## Accessibility manual-check evidence

Lighthouse always lists some accessibility checks as manual because it cannot
prove intent, visual order, or focus behavior from static audits alone. Querylane
keeps those checks covered by Playwright accessibility tests.

Run:

```bash
cd frontend
bun run test:accessibility
```

Current route-level coverage:

| Lighthouse manual item | Querylane evidence |
| --- | --- |
| Interactive controls are keyboard focusable | `data explorer: Lighthouse route covers manual accessibility contracts` focuses key Data Explorer controls and walks tab focus. |
| Interactive elements indicate their purpose and state | Axe plus role/name assertions cover buttons, comboboxes, selected tabs, and labels. |
| The page has a logical tab order | The Data Explorer test starts in the object browser and proves tab focus can move through and out of that region. |
| Visual order on the page follows DOM order | Manual visual review remains required for major layout changes; current route uses source order of app nav, object browser, then detail region. |
| User focus is not accidentally trapped in a region | The Data Explorer test verifies focus leaves the object browser. |
| The user's focus is directed to new content added to the page | Route and tab content changes are checked by visible headings, selected tab state, and focused controls. |
| HTML5 landmark elements are used to improve navigation | The Data Explorer route has a single `main`, plus named complementary and detail regions. |
| Offscreen content is hidden from assistive technology | Axe checks run against the exact mocked route; manual review remains required for new responsive drawers/popovers. |
| Custom controls have associated labels | Role/name assertions cover custom select, tab, and toolbar controls. |
| Custom controls have ARIA roles | Role assertions cover tabs, tablists, comboboxes, buttons, and complementary navigation. |

## Current local policy

- Hard gates: deterministic bundle budgets from `scripts/check-bundle-budget.ts`.
- Hard gates: Lighthouse desktop category scores must stay 100/100 from local `bun run perf:lighthouse`.
- User journey gates: Playwright `@perf` specs for mocked Data Explorer readiness and payload budgets.
- React health gates: React Doctor changed-file checks in `frontend-ci`.

The Lighthouse command uses 3 desktop runs and median assertions against a mocked Data Explorer route. The mock API is served only by `scripts/lighthouse-mock-server.ts`; production transport has no public performance-demo flag or fixture branch. Lighthouse uses actual local Chrome timings, not simulated throttling, then writes HTML and JSON reports with performance, accessibility, best practices, SEO, first contentful paint, largest contentful paint, speed index, total blocking time, time to interactive, and cumulative layout shift.

## Current thresholds

| Metric | Current limit |
| --- | --- |
| Initial gzip | Hard fail at 327 KiB |
| Initial JavaScript gzip | Hard fail at 293 KiB |
| Core gzip | Hard fail at 1027 KiB |
| Largest async JavaScript gzip | Hard fail at 130 KiB |
| Deferred visualization gzip | Hard fail at 91 KiB |
| Lighthouse performance | Hard fail below 100 |
| Lighthouse accessibility | Hard fail below 100 |
| Lighthouse best practices | Hard fail below 100 |
| Lighthouse SEO | Hard fail below 100 |
| First contentful paint | Hard fail above 0.5 s |
| Largest contentful paint | Hard fail above 1.2 s |
| Speed index | Hard fail above 0.7 s |
| Total blocking time | Hard fail above 50 ms |
| Time to interactive | Hard fail above 1.0 s |
| Cumulative layout shift | Hard fail above 0.01 |
| Data Explorer direct ready | Hard fail at 1200 ms in Playwright perf spec |
| Data Explorer overview click | Hard fail at 1000 ms in Playwright perf spec |
| Data Explorer cold payload | Hard fail at 160 KiB gzip in Playwright perf spec |

## Next high-confidence upgrades

1. Move bundle comparison into pull requests once the main artifact source is stable.
2. Add Playwright collection for Long Animation Frames and long tasks around Data Explorer interactions.
3. Add local Web Vitals lab collection once the report shape is useful and stable.
4. Add CI only after the local report shape is useful and stable.
5. Add a mocked query editor perf journey once the route has stable fixtures and a clear ready marker.
