# Browser and visual regression tests

Two runners, one job each:

- **Rstest browser mode** (`src/**/*.browser.test.tsx`) checks component and route
  behavior in real Chromium: interactions, layout measurements, and accessibility
  state. It has no screenshot assertions.
- **Playwright** (`e2e/visual/*.e2e.test.ts`) owns pixel comparisons with
  `toHaveScreenshot`, in the `visual-light` and `visual-dark` projects. Full user
  journeys stay in `e2e/journeys/*.e2e.test.ts`.

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

Open the real app route and serve the necessary RPCs through MSW fixtures. Keep one representative capture for each materially different layout or recovery state. Leave event handling and nonvisual variants to the behavior tests.

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
- Use MSW for RPCs and Playwright’s clock for timestamps; no real backend.

## Agent capabilities and limitations

This document is agent-facing guidance under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

Agents may run rstest and Playwright commands, inspect snapshots, capture failure artifacts, and parse native output to explain failures. Agents may propose or apply baseline updates only when the user explicitly asks or when CI artifacts prove the expected visual state.

Agents must not autonomously redesign UI, bless visual diffs, commit refreshed screenshots, access secrets, or run production-affecting/network mutations without human approval. Escalate to a human when the intended UX is ambiguous, when a visual diff hides possible product regression, or when credentials/external services are required.
