# Browser visual regression tests

Use Vitest browser mode for focused UI snapshots of critical components and routes.
It runs in Chromium via Playwright, but stays component-scoped: mock API hooks,
render one stable state, assert accessible text, then snapshot the smallest stable
container.

Use Playwright e2e separately for full user journeys against a served app. E2e
should validate routing, backend integration, and cross-browser behavior. Do not
put component visual baselines there.

## Commands

```sh
bun run test:browser             # light theme, default local check
bun run test:browser:ci          # CI-style light + dark verbose output
bun run test:browser:update      # intentionally update Linux light baselines
bun run test:browser:ui          # debug light browser tests interactively
```

For an explicit dark-theme local run, call Vitest directly with
`vitest.browser.dark.config.ts` instead of adding another package script.

## Stability rules

- Chromium baselines use a canonical Linux screenshot path via Vitest's
  `resolveScreenshotPath`; cross-browser belongs in e2e.
- Update baselines from Linux only. The config rejects `--update` on macOS/Darwin
  so local updates cannot overwrite canonical Linux screenshots.
- Default local browser tests run light mode only for fast feedback. CI uses the
  all-themes config so dark baselines stay required.
- Reduced motion and near-zero CSS animation/transition duration are applied in
  `vitest.browser.setup.css`.
- Fixed `ScreenshotFrame` dimensions and a fixed browser viewport keep layout
  deterministic.
- Assert visible UI before snapshotting.
- Mock network and timers; no real backend in browser visual tests.
- Snapshot critical states: empty, happy path, error, loading/progress.

## CI output

CI uses Vitest directly with the built-in verbose reporter. Avoid custom Vitest
wrapper scripts unless native reporters stop exposing enough failure and runtime
detail.

## Agent capabilities and limitations

This document is agent-facing guidance under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

Agents may run Vitest browser commands, inspect snapshots, capture failure artifacts, and parse native verbose output to explain failures. Agents may propose or apply baseline updates only when the user explicitly asks or when CI artifacts prove the expected visual state.

Agents must not autonomously redesign UI, bless visual diffs, commit refreshed screenshots, access secrets, or run production-affecting/network mutations without human approval. Escalate to a human when the intended UX is ambiguous, when a visual diff hides possible product regression, or when credentials/external services are required.
