# Browser and visual regression tests

Two runners, one job each:

- **Rstest browser mode** (`src/**/*.browser.test.tsx`) checks component and route
  behavior in real Chromium: interactions, layout measurements, and accessibility
  state. It has no screenshot assertions.
- **Playwright** (`e2e/visual/*.spec.ts`) owns pixel comparisons with
  `toHaveScreenshot`, in the `visual-light` and `visual-dark` projects. Full user
  journeys stay in `e2e/tests/*.spec.ts`.

## Commands

```sh
bun run test:browser             # rstest browser tests, light then dark
bun run test:browser:changed     # only files affected since QUALITY_BASE_REF
bun run test:browser:ui          # rstest watch mode in a visible browser
bun run test:visual              # Playwright visual comparisons (local, looser threshold)
bun run test:visual:container    # the same run inside the CI Playwright image
bun run test:visual:update       # rewrite baselines inside the CI Playwright image
```

## Where a visual state lives

1. If a route reaches the state, open the real route with `page.goto()` and mock
   RPCs with `page.route()` (helpers in `e2e/tests/helpers.ts`).
2. Otherwise add a scenario component under `src/visual-harness/`, register it in
   `scenarios.tsx`, and open `/visual.html?scenario=<name>`. Use `HarnessProviders`
   with a `createRouterTransport` transport when the component reads server state.
   The entry only exists when `QUERYLANE_VISUAL_HARNESS=1`, so production builds
   never include it.
3. Render the same scenario component from the matching rstest browser test, so
   behavior checks and pixels cover identical markup.

## Stability rules

- Baselines are Linux-only. CI and `test:visual:update` both run in
  `mcr.microsoft.com/playwright:v<version>-noble`; the config rejects
  `--update-snapshots` elsewhere and sets `updateSnapshots: "none"` so a missing
  baseline fails instead of being written.
- macOS runs use a 5% pixel threshold and can still differ on font wrapping; treat
  `test:visual:container` as authoritative.
- Reduced motion, disabled animations, a hidden caret, and a fixed 1280x1000
  viewport keep captures deterministic. `browser-test.setup.css` zeroes transition
  and animation durations for rstest.
- Assert visible UI before capturing, and capture the smallest stable region
  (page `main`, a dialog, or a section).
- Mock network and timers; no real backend.

## Agent capabilities and limitations

This document is agent-facing guidance under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

Agents may run rstest and Playwright commands, inspect snapshots, capture failure artifacts, and parse native output to explain failures. Agents may propose or apply baseline updates only when the user explicitly asks or when CI artifacts prove the expected visual state.

Agents must not autonomously redesign UI, bless visual diffs, commit refreshed screenshots, access secrets, or run production-affecting/network mutations without human approval. Escalate to a human when the intended UX is ambiguous, when a visual diff hides possible product regression, or when credentials/external services are required.
