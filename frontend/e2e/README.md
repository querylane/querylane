# Querylane Playwright tests

Playwright runs the built frontend in Chromium. Backend integration tests own PostgreSQL behavior and API correctness; Playwright owns workflows where browser state, navigation, or the Connect wire contract matters.

- `journeys/*.e2e.test.ts` covers critical workflows across routes and reloads, including instance setup and mutations, catalog browsing, and SQL execution.
- `visual/*.e2e.test.ts` keeps representative real routes, dialogs, and recovery states in both themes.
- `docs/*.e2e.test.ts` covers built documentation search, runnable examples, and EPUB export.

Querylane RPCs use MSW handlers from the scenario fixtures. The browser still uses the real Connect client. An unhandled RPC fails the test instead of reaching a backend. Register a Playwright request or response wait before the action that emits it; prefer visible UI outcomes when the request shape is not the contract. Keep retries disabled.

Add one journey per distinct browser risk. Use narrower tests for pure models and individual component interactions, and don't replay the same contract across routes merely because they share an implementation.

## Running the suites

```sh
bun run test:browser:setup
bun run test:e2e:list
bun run test:e2e
bun run test:accessibility
bun run test:visual
bun run test:visual:container
```

`test:e2e:ci` includes accessibility-tagged tests. `test:docs` expects the repository's documentation build or a `DOCS_BASE_URL` pointing to one.

Linux screenshot baselines are generated only in the pinned Playwright image via `bun run test:visual:update`. Other platforms can compare with a looser threshold, but their results are not authoritative. Use `PLAYWRIGHT_PORT` for simultaneous workspaces instead of reusing a preview.
