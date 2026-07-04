# QueryLane Playwright smoke tests

Playwright is a frontend UI-state harness for QueryLane. It is intentionally **not** the backend end-to-end test layer.

## Contract

- CI starts the frontend only.
- QueryLane RPC traffic must be intercepted with `page.route()`.
- Tests use `route.fulfill()` to model happy paths and unhappy paths.
- A spec should not depend on a live backend, meta database, or user PostgreSQL instance.
- Unhandled QueryLane RPCs return a mocked 503 error and abort the test so missing scenarios are visible and deterministic.
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
- Prefer one mocked browser journey per business risk. Do not add duplicate route-load tests for the same state.
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
