# Frontend performance measurement

Querylane stays client-side only. Measure performance in four layers instead of trusting one score.

## Local commands

```bash
cd frontend
bun run build                    # hard gzip bundle budgets
bun run dev:scan                 # local React Scan + default global Compiler
bun run dev:scan:control         # local React Scan + annotation control
bun run build:compiler-control   # production annotation-control build
bun run compiler:check           # local Compiler coverage and compatibility
bun run perf:lighthouse          # build, run Lighthouse CI, print summary
bun run perf:lighthouse:public   # one run, upload public Google report links
bun run test:e2e -- --grep @perf # mocked task-level Data Explorer budgets
bun run build:profile            # Rsdoctor route chunk analysis
bun run doctor:full              # React Doctor full health gate
```

React Scan is local-only and opt-in. `dev:scan` serves the exact pinned package
asset before React; normal development and production builds omit it. A build
with `QUERYLANE_REACT_SCAN=1` is rejected. React Compiler runs globally in
`infer` mode by default; annotation mode exists only for local comparison.
`compiler:check` verifies discovered component coverage and incompatible
libraries locally; it is intentionally not a CI command.

See the [2026-07-16 React performance audit](react-performance-audit-2026-07-16.md)
for the five-run baseline, compatibility findings, and raw measurements.

Lighthouse HTML and JSON reports are written to `frontend/dist/lighthouse`.
Public report links use Lighthouse CI temporary public storage. Those links are
shareable and intended for CI logs or pull request comments. They are not the
long-term source of truth; keep bundle budgets and local assertions as the hard
gate.

## Accessibility manual-check evidence

Lighthouse always lists some accessibility checks as manual because it cannot
prove intent, visual order, or focus behavior from static audits alone. QueryLane
keeps those checks covered by Playwright accessibility tests.

Run:

```bash
cd frontend
bun run test:accessibility
```

Current route-level coverage:

| Lighthouse manual item | QueryLane evidence |
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

The Lighthouse command uses three desktop runs and median assertions against a mocked Data Explorer route. The mock API is served only by `scripts/lighthouse-mock-server.ts`; production transport has no public perf-demo flag or fixture branch. Lighthouse uses actual local Chrome timings, not simulated throttling, then writes HTML/JSON reports with performance, accessibility, best practices, SEO, first contentful paint, largest contentful paint, speed index, total blocking time, time to interactive, and cumulative layout shift.

## Current thresholds

| Metric | Initial policy |
| --- | --- |
| Initial gzip | Hard fail at 450 KiB |
| Initial JavaScript gzip | Hard fail at 400 KiB |
| Core gzip | Hard fail at 950 KiB |
| Largest async JavaScript gzip | Hard fail at 130 KiB |
| Deferred visualization gzip | Hard fail at 90 KiB |
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
