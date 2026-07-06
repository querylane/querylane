# Dependency upgrade: playwright 1.62.0-alpha-2026-07-03 -> 1.61.1

## Summary
- Ecosystem: npm/Bun
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`
- Direct dep, parent dep, or transitive: direct dev dependencies `playwright` and `playwright-core`; `playwright` depends on matching `playwright-core`
- Requested by: Ben, with official Playwright v1.61.0 and v1.61.1 release notes

## Version path
Every published stable version from current exclusive to target inclusive; research every row; do not install every version.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 1.62.0-alpha-2026-07-03 | 1.61.0 | prerelease rollback to latest stable line | https://github.com/microsoft/playwright/releases/tag/v1.61.0 and https://playwright.dev/docs/release-notes#version-161 | v1.61 adds WebAuthn passkeys, page storage APIs, video modes aligned with trace, `expect.soft.poll`, `fullConfig.argv`, `fullConfig.failOnFlakyTests`, WebSocket trace/HAR capture, and Ubuntu 26.04 support. No repo use of removed v1.60 APIs (`Locator.ariaRef`, `exposeBinding` handle, `connect`/`connectOverCDP` logger, `videosPath`/`videoSize`). | Review config for video/retry/flaky-test options and keep package pins on stable releases. |
| 2 | 1.61.0 | 1.61.1 | patch | https://github.com/microsoft/playwright/releases/tag/v1.61.1 | Fixes custom matcher override, UI mode API request byte reporting, WebSocket trace timing, Node 22.15 sync loader regression, and pnpm workspace extensionless TypeScript subpath resolution. No migrations. | Target 1.61.1, not 1.61.0. |

## Consolidated upgrade actions
Priority: majors + announcements/blogs/migrations/codemods, then minors, then patches/security.

API changes:
- No Querylane source uses v1.60 removed APIs.
- No e2e tests use WebAuthn or page storage APIs yet; no code migration needed.

Syntax/style-guide changes:
- None required.

Behavior/config changes:
- Move `playwright` and `playwright-core` off the `1.62.0-alpha-2026-07-03` prerelease and pin both to `1.61.1`.
- Add CI e2e retry evidence without hiding flakes: `retries: 1` on CI plus `failOnFlakyTests: true` on CI.
- Use the v1.61 video mode support: record annotated video only on the first retry in CI, avoiding video overhead for passing first runs.
- Keep trace evidence for CI retries with `retain-on-failure-and-retries`; keep local behavior at `retain-on-failure`.

Repo actions before target install:
- Check direct dependencies and peer adapters.
- Check for removed API usage in e2e config and tests.
- Check release age, lockfile source shape, and security advisories.

## Dependency tree
Target: `playwright@1.61.1`, `playwright-core@1.61.1`
Parents: direct `frontend/package.json`; `playwright@1.61.1` depends on `playwright-core@1.61.1`
Children: `playwright-core`, optional `fsevents`
Repo dependents: e2e CLI scripts, `frontend/e2e/playwright.config.ts`, `@vitest/browser-playwright`, `@axe-core/playwright`, Lighthouse script importing `chromium` from `playwright`
Peers: `@vitest/browser-playwright@5.0.0-beta.5` has `playwright: "*"`; its dev dependency is `playwright: ^1.60.0`. `@axe-core/playwright@4.12.2-2d3cb18.0` has `playwright-core: >= 1.0.0`.
Plugins/adapters: Vitest browser Playwright provider, axe-core Playwright integration.

## Non-SemVer scale
Release cadence: Playwright stable monthly with daily alpha/next builds.
Change volume: low for target stable patch, moderate for moving off alpha.
Diff size: package pins plus lockfile entries and e2e config.
API churn: low for v1.61 stable; alpha rollback removes access to unshipped 1.62 APIs, which Querylane does not use.
Effort: low.
Danger/blast radius: e2e/browser-test tooling only; no production runtime dependency.

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| None found for `playwright@1.61.1` | OSV query, GitHub advisory query | dev/test-only package; no known advisory for target | n/a | Safe |
| None found for `playwright-core@1.61.1` | OSV query, GitHub advisory query | dev/test-only package; no known advisory for target | n/a | Safe |

Supply-chain checks:
- npm dist-tag `latest` is `1.61.1`; `next` is `1.62.0-alpha-2026-07-05`.
- `playwright@1.61.1` published 2026-06-23T19:49:00Z; release age at apply time was more than 7 days.
- `playwright-core@1.61.1` published 2026-06-23T19:49:07Z; release age at apply time was more than 7 days.
- No git, tarball, or raw URL dependencies found in `frontend/package.json` or `frontend/bun.lock`.
- Install ran with `--ignore-scripts --minimum-release-age 604800`.
- Existing untrusted lifecycle scripts reported by Bun are unrelated (`core-js`, `@sentry/cli`) and remained blocked.

## Risk gate
Decision: apply now
Reason: latest stable patch on the 1.61 line, official release notes clear, peer ranges compatible, security checks clean, and user explicitly requested the upgrade. The installed version was a prerelease alpha, so moving to stable reduces supply-chain/release risk.
Explicit approval: user requested update to latest Playwright 1.61.1 and config improvements.

## Commands
```bash
# research / tree
bun pm why playwright
bun pm why playwright-core
curl -fsSL https://registry.npmjs.org/playwright | jq -r '."dist-tags", .time["1.61.0"], .time["1.61.1"], .time["1.62.0-alpha-2026-07-03"]'
curl -fsSL https://registry.npmjs.org/playwright-core | jq -r '."dist-tags", .time["1.61.0"], .time["1.61.1"], .time["1.62.0-alpha-2026-07-03"]'

# advisory checks
curl -fsSL -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' -d '{"package":{"name":"playwright","ecosystem":"npm"},"version":"1.61.1"}'
curl -fsSL -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' -d '{"package":{"name":"playwright-core","ecosystem":"npm"},"version":"1.61.1"}'
gh api 'advisories?ecosystem=npm&package=playwright&per_page=20'
gh api 'advisories?ecosystem=npm&package=playwright-core&per_page=20'

# apply
bun update playwright@1.61.1 playwright-core@1.61.1 --ignore-scripts --minimum-release-age 604800
bun install --frozen-lockfile --ignore-scripts
bun audit
bun run lint:fix
bun run type:check
bun run test
bun run test:browser:changed -- --reporter=verbose
CI=1 bun run test:e2e:list
```

## Verification
Lint: `bun run lint:fix` passed; suppression check passed.
Type check: `bun run type:check` passed.
Tests: `bun run test` passed (112 unit files, 959 tests; 54 integration files, 288 tests). `bun run test:browser:changed -- --reporter=verbose` passed (2 files, 14 tests). `CI=1 bun run test:e2e:list` passed (83 e2e tests listed).
Build/vet/security scan: `bun install --frozen-lockfile --ignore-scripts` passed. Fresh-install compatibility check also passed with `rm -rf node_modules && bun install --frozen-lockfile --ignore-scripts`, `bunx playwright --version` (`Version 1.61.1`), `bun run type:check`, and `CI=1 bun run test:e2e:list`. `bun audit --json` reported existing unrelated advisories in `js-yaml`, `tmp`, and `uuid` via `@lhci/cli` / `@changesets`; no Playwright advisory was found in OSV or GitHub advisory checks.
