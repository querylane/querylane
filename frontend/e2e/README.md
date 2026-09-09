# Querylane Playwright smoke tests

Playwright is a frontend UI-state harness for Querylane. It is not the backend end-to-end test layer.

## Contract

- CI starts the frontend only.
- Querylane RPC traffic must be intercepted with `page.route()`.
- Tests use `route.fulfill()` to model happy paths and unhappy paths.
- A spec should not depend on a live backend, meta database, or user PostgreSQL instance.
- Unhandled Querylane RPCs return a mocked 503 error and abort the test so missing scenarios are visible and deterministic.
- Retries stay disabled. A flaky smoke test should be fixed, simplified, or moved down to a cheaper unit/integration layer.

## When to add a Playwright test

Use Playwright for smoke coverage of browser-visible behavior:

- route boots into the expected page state
- happy-path form or navigation flow
- important empty/loading/error state
- accessibility smoke (`@a11y`) when useful

Use backend tests for API correctness, database behavior, migrations, and AIP semantics.

## Test design principles

- Treat each spec as a user-facing contract: test visible behavior plus the mocked RPC shape that matters for safety.
- Keep each test under ~1s locally where possible; investigate any e2e test that repeatedly exceeds 2s.
- Prefer 1 mocked browser journey per business risk. Do not add duplicate route-load tests for the same state.
- Use `page.route()` and `route.fulfill()` for every backend condition. Never start a backend just to force an error state.
- Prefer `getByRole()` / `getByLabel()` selectors. `getByText()` is fine for user-visible copy; test ids are only for layout/regression hooks.
- Avoid fixed sleeps and polling loops. Wait on visible UI, URLs, or captured requests.
- Put bulky wire fixtures and reusable route setup in helper modules next to the specs. Specs should read like scenarios.
- Add short comments when a test protects a non-obvious release risk so future agents know why it exists.

## Commands

```bash
bun run test:browser:setup
bun run test:e2e:list
bun run test:e2e
bun run test:e2e:repeat
bun run test:accessibility
bun run test:e2e:ui
bun run test:e2e:debug
```

## Conventions

- Put specs in `e2e/tests/*.spec.ts`.
- Put reusable RPC scenarios in `e2e/tests/querylane-scenarios.ts`.
- Prefer `getByRole`, then `getByLabel`, then visible text.
- Keep scenario responses explicit so tests document frontend expectations.
- Add unhappy paths by fulfilling RPC errors, not by starting a broken backend.

## Playwright 1.63 diagnostics

- Failed tests retain DOM, accessibility, and screen snapshots in their trace.
  Open the trace viewer's Display Aria mode to inspect accessible names beside
  the action screenshot. Successful tests still discard traces; retries stay off.
- Reduced motion uses the standalone test option, so individual suites can
  override it with `test.use({ reducedMotion: "no-preference" })`.
- `bun run test:e2e:profile` adds the Perfetto worker timeline without replacing
  the configured reporters. Open `test-results/perfetto.json` in Perfetto to investigate slow or
  uneven workers; it does not enable retries.
- CI list and GitHub reporters omit repeated tags from titles; JSON and HTML
  reports retain the complete test metadata. HTML now includes step waterfalls
  and automatic locator/argument subtitles.
- Browser setup uses `--no-remove` to preserve browsers needed by other workspaces.

### Choosing the other new APIs

Use features for real scenarios, not to expand smoke tests artificially:

- `test.step(..., { params })`: instance-creation setup records the route and
  empty-catalog scenario. Never put credentials in reporter parameters.
- `locator.visible()`: prefer it over `:visible` when hidden duplicate elements
  really need filtering. Existing role locators already exclude hidden elements.
- Named test locks: only for unavoidable shared external resources. These tests
  use isolated browser contexts and mocked RPCs, so no locks are needed.
- Selector-free `frameLocator()`: only for cross-frame content; this app's smoke
  flows do not use iframes.
- `ariaSnapshotJSON()`: for consumers needing structured accessibility data;
  failure traces already provide accessibility snapshots without extra attachments.
- Typed request `json()`: for APIRequestContext consumers. Our frontend harness
  fulfills mocked RPCs instead of issuing live API requests.
- Standalone `forcedColors` and `contrast`: available for targeted accessibility
  scenarios, not new blanket projects that multiply every smoke test.
- Credential arrays and authenticated codegen: no HTTP Basic auth in this harness.
- OPFS storage state: no persisted origin-private files to restore.
- `dialogclosed`: no native JavaScript dialog lifecycle in these smoke flows.
- Stories registry typing: no experimental Playwright component-testing packages;
  component tests remain on Rstest and Vitest.

CI uses `ubuntu-latest`, not the removed Ubuntu 20.04 platform. Browser installation
follows the pinned package's browser manifest; no manual browser version pins.
