# Dependency upgrade: Vitest 4.1.9 -> 5.0.0-beta.5

## Summary
- Ecosystem: JavaScript / Bun frontend workspace
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`
- Direct dep, parent dep, or transitive: direct dev dependencies `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/ui`
- Requested by: user requested latest Vitest 5 beta migration and benchmark
- Current repo state: `origin/main` already pinned `5.0.0-beta.5`; this branch confirms latest beta, normalizes the lockfile, records migration audit, and validates the suite.

## Version path
Every published stable version from latest Vitest 4 stable to the Vitest 5 beta target was reviewed through the Vitest migration guide, GitHub releases, and package registry dist-tags.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 4.0.0 | 4.0.18 | patch series | GitHub releases / package registry | No repo-specific migration found beyond normal patch fixes. | No code change. |
| 2 | 4.0.18 | 4.1.9 | minor + patch series | GitHub releases / package registry | No repo-specific migration found; latest stable before v5 is `4.1.9`. | Used as benchmark baseline. |
| 3 | 4.1.9 | 5.0.0-beta.1 | prerelease major | Vitest 5 migration guide | Requires Node >= 22.12 and Vite >= 6.4. Major behavior changes include default `clearMocks`, stricter hoisted mocks, benchmark API rewrite, browser locator/text strictness, report/artifact moves, config lookup changes, and browser screenshot/orchestrator changes. | Audited repo patterns and ran tests. |
| 4 | 5.0.0-beta.1 | 5.0.0-beta.5 | prerelease patches | GitHub releases / package registry | Latest beta includes browser orchestrator readiness fixes, session-bound browser runner URLs, worker/concurrency id changes, and config lookup changes. | Target remains `5.0.0-beta.5`. |

Published Vitest 4 stable path checked: `4.0.0` through `4.0.18`, then `4.1.0` through `4.1.9`. Published Vitest 5 beta path checked: `5.0.0-beta.1` through `5.0.0-beta.5`.

## Consolidated upgrade actions

API changes:
- No `bench()` imports found in repo tests, so the v5 benchmarking API rewrite needs no code migration.
- No `test.sequential`, `describe.sequential`, or `{ sequential: true }` usage found.
- No removed `vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`, `vitest/runners`, `vitest/suite`, `vitest/mocker`, or `vitest/internal/module-runner` imports found.
- No custom browser commands accepting serialized locators found.

Syntax/style-guide changes:
- `vi.mock` hoisting audit found no nested `vi.mock` calls needing migration.
- `toThrow("")` / `toThrowError("")` audit found no affected assertions.

Behavior/config changes:
- Node prerequisite satisfied locally: Node `v26.0.0`.
- Vite prerequisite satisfied through lockfile: `vite@8.0.16`.
- `clearMocks` v5 default is accepted and now explicit in unit, integration, and browser configs.
- Browser locator strictness is accepted and now explicit via `browser.locators.exact: true`; browser tests pass on v5 without compatibility fallback.
- Vitest v5 generated artifact root is covered by existing `frontend/.vitest` ignore.
- Config is already explicit at every package script call site, so v5 parent-directory config lookup removal does not affect local scripts.

Repo actions before target install:
- Confirmed registry dist-tag `beta=5.0.0-beta.5` for `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, and `@vitest/ui`.
- Temporarily downgraded to `4.1.9` for benchmark only, then restored `5.0.0-beta.5` using Bun.
- Regenerated `frontend/bun.lock`; stale optional coverage package entries were removed because this workspace does not depend on coverage packages.

## Dependency tree
Target: `vitest@5.0.0-beta.5`  
Parents: direct dev dependency in `frontend/package.json`  
Children: `@vitest/mocker`, `@vitest/pretty-format`, `@vitest/spy`, `@vitest/utils`, `vite@8.0.16`, `tinybench@6`, Chai and supporting runtime packages  
Repo dependents: frontend unit, integration, browser, changed-test, and CI scripts  
Peers: `@vitest/browser-playwright@5.0.0-beta.5`, `@vitest/ui@5.0.0-beta.5`, `happy-dom`, `@types/node`, `vite`  
Plugins/adapters: `@vitest/browser@5.0.0-beta.5`, `@vitest/browser-playwright@5.0.0-beta.5`, `vitest-browser-react@2.2.0`

## Non-SemVer scale
Release cadence: active prerelease beta  
Change volume: high because major beta  
Diff size: low in repo because main was already pinned to v5  
API churn: medium, mostly browser mode, benchmarks, reports, mocks, config lookup  
Effort: low after audit because tests already conform  
Danger/blast radius: medium; test infrastructure only, but browser mode is customer-surface validation

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| GHSA-w5hq-g745-h8pq | Bun audit | Existing transitive via `@lhci/cli -> uuid`, not introduced by Vitest v5. | `uuid >=11.1.1` | Out of scope for Vitest migration; track separately. |
| GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 | Bun audit | Existing transitive via `@lhci/cli -> tmp`, not introduced by Vitest v5. | patched `tmp` release unavailable through current parent path | Out of scope for Vitest migration; track separately. |
| GHSA-h67p-54hq-rp68 | Bun audit | Existing transitive via `@lhci/cli`, `shadcn`, and `@changesets/cli`, not introduced by Vitest v5. | `js-yaml >=3.15.0` | Out of scope for Vitest migration; track separately. |

## Benchmark
Machine: local macOS arm64, Node `v26.0.0`, Bun `1.3.14`. Benchmarks used `hyperfine`; unit and integration used five measured runs with one warmup. Browser v5 used three measured runs with one warmup. Browser v4 was a single compatibility run because it failed.

| Command | Vitest 4.1.9 | Vitest 5.0.0-beta.5 | Result |
|---|---:|---:|---|
| `bun run test:unit` | 6.699s ± 0.670s | 5.525s ± 0.098s | 17.5% faster |
| `bun run test:integration` | 5.413s ± 0.082s | 5.056s ± 0.143s | 6.6% faster |
| `bun run test:browser` | Failed in 16.13s: 13/17 files failed, 57/101 tests failed | 11.795s ± 0.268s, passing | v5 restores local browser compatibility |

## Risk gate
Decision: apply now  
Reason: user explicitly requested the Vitest 5 beta; `origin/main` already pins the target; audit found no required code migrations; v5 unit, integration, and browser suites pass.  
Explicit approval: user requested latest Vitest 5 beta despite beta status.

## Commands
```bash
cd frontend
bun install --frozen-lockfile
bun add -d vitest@4.1.9 @vitest/browser@4.1.9 @vitest/browser-playwright@4.1.9 @vitest/ui@4.1.9
bun run test:unit
bun run test:integration
bun run test:browser
hyperfine --warmup 1 --runs 5 'bun run test:unit'
hyperfine --warmup 1 --runs 5 'bun run test:integration'
bun add -d vitest@5.0.0-beta.5 @vitest/browser@5.0.0-beta.5 @vitest/browser-playwright@5.0.0-beta.5 @vitest/ui@5.0.0-beta.5
bun run test:unit
bun run test:integration
bun run test:browser
hyperfine --warmup 1 --runs 5 'bun run test:unit'
hyperfine --warmup 1 --runs 5 'bun run test:integration'
hyperfine --warmup 1 --runs 3 'bun run test:browser'
bun audit
```

## Verification
Lint: `bun run lint:fix`  
Type check: `bun run type:check`; `bun install --frozen-lockfile` postinstall ran `tsgo -p tsconfig.ui.json --pretty false`  
Tests: `bun run test:unit`; `bun run test:integration`; `bun run test:browser`  
Build/vet/security scan: `bun audit` reports pre-existing non-Vitest transitive advisories via `@lhci/cli`, `shadcn`, and `@changesets/cli`; not introduced by this migration.
