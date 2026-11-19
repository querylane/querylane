# Landmines in Querylane UI

The [Ultracite 8.3.0 Landmines preset](https://www.ultracite.ai/changelog/ultracite-8-3-0) supplies ten fatal rules from [Landmines](https://github.com/interfere-inc/landmines). Querylane loads them into the existing typed Oxlint gate alongside the core, React, and shadcn presets. The Biome Playwright preset and other existing checks still run. The same CI command applies whether a person, Codex, Claude, or another tool authored a change.

| Area | Contract |
| --- | --- |
| Testing | Do not replace dependencies, sleep, poll request logs, or retry failures. Use real app code and Connect clients. Intercept RPCs at the HTTP boundary with strict MSW; wait on completion, a request signal, or user-visible state. |
| Structure | Keep module tests beside the implementation and use the runner's semantic `.test` suffix. Name fixtures and shared test utilities by role. Keep package exports intentional; broad source wildcards are not public APIs. |
| Style and types | Use names, typed data and explicit control flow rather than prose comments. Infer return types. Put real type contracts on values, generic calls, or `satisfies` checks. |

These rules are syntactic checks, not a coverage metric or a proof that a test is useful. For example, the package-exports rule rejects unrestricted source globs in the manifest; it does not independently audit every runner's resolution settings. The tests still need review for whether a regression would fail them at the right boundary. Interfere's reported throughput is not a Querylane benchmark.

## Test ownership

- Unit tests own pure, consequential transformations: identifiers, request construction, SQL and filter values, and other domain rules.
- Integration tests own boundaries difficult to see from the browser alone, such as Connect error mapping, deadlines, shared instance concurrency, and discarding stale setup responses.
- Rstest and Playwright in real Chromium own user interaction, navigation, accessibility, and a focused group of visual regressions. Visuals exercise reachable routes, not a separate application entrypoint.

## RPC invariants

The default RPC deadline is 30 seconds, matching the backend's row-read statement deadline. The long-running deadline is 90 seconds, leaving room for the backend's 60-second EXPLAIN ANALYZE ceiling. Both real transports share one four-slot semaphore per user-managed instance for scoped unary RPCs, so one unresponsive instance cannot monopolize browser connections. Console and onboarding calls bypass that semaphore. Keep error handling outside it so queued failures normalize and report the same way as dispatched failures.

SQL editor validation shares the instance semaphore with Run and Explain. Its cache keys include validator scope and statement text; failed checks do not populate the cache.
