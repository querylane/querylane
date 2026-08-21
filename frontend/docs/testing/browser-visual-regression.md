# Browser visual regression tests

Use Vitest browser mode for focused UI snapshots of critical components and routes.
Use experimental Rstest Browser Mode for component-scoped browser behavior that does
not need screenshot assertions. Both run in Chromium through Playwright.

Use Playwright e2e separately for full user journeys against a served app. E2e
should validate routing, backend integration, and cross-browser behavior. Do not
put component visual baselines there.

## Commands

```sh
bun run test:browser             # light theme, default local check
bun run test:browser:ci          # CI-style light + dark coverage
bun run test:browser:update      # intentionally update Linux light baselines
bun run test:browser:ui          # debug light browser tests interactively
bun run test:browser:rstest      # run only the Rstest browser subset
bun run test:browser:rstest:ui   # debug the Rstest subset in a visible browser
```

For an explicit dark-theme local run, call Vitest directly with
`vitest.browser.dark.config.ts` instead of adding another package script.

## Stability rules

- Chromium baselines use a canonical Linux screenshot path through Vitest's
  `resolveScreenshotPath`; cross-browser belongs in e2e.
- Update baselines from Linux only. The configuration rejects `--update` on macOS/Darwin
  so local updates cannot overwrite canonical Linux screenshots.
- Default local browser tests run light mode only for fast feedback. CI uses the
  all-themes configuration so dark baselines stay required.
- Reduced motion and CSS animation and transition durations near 0 are applied in
  `browser-test.setup.css`.
- Fixed `ScreenshotFrame` dimensions and a fixed browser viewport keep layout
  deterministic.
- Assert visible UI before snapshotting.
- Mock network and timers; no real backend in browser visual tests.
- Snapshot critical states: empty, happy path, error, loading/progress.

## CI output

CI uses Vitest's built-in verbose reporter for visual tests and Rstest's compact native
reporter for functional browser tests.

## Agent capabilities and limitations

This document is agent-facing guidance under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

Agents may run Rstest and Vitest browser commands, inspect snapshots, capture failure artifacts, and parse native output to explain failures. Agents may propose or apply baseline updates only when the user explicitly asks or when CI artifacts prove the expected visual state.

Agents must not autonomously redesign UI, bless visual diffs, commit refreshed screenshots, access secrets, or run production-affecting/network mutations without human approval. Escalate to a human when the intended UX is ambiguous, when a visual diff hides possible product regression, or when credentials/external services are required.
