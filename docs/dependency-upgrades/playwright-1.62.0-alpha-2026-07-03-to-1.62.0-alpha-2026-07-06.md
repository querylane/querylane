# Dependency upgrade: playwright 1.62.0-alpha-2026-07-03 -> 1.62.0-alpha-2026-07-06

## Summary
- Ecosystem: npm/Bun
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`
- Direct dep, parent dep, or transitive: direct dev dependencies `playwright` and `playwright-core`; `playwright` depends on matching `playwright-core`
- Requested by: Ben, with explicit direction to stay on the latest `next` prerelease channel (`rc` / `alpha` / `beta`)

## Version path
Every published stable version from current exclusive to target inclusive; research every row; do not install every version. There are no stable releases between these two prereleases. The applicable npm `next` prerelease path is:

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 1.62.0-alpha-2026-07-03 | 1.62.0-alpha-2026-07-04 | prerelease alpha | npm registry dist/version metadata | No official release notes for daily alpha. Change is prerelease-only and inherits alpha churn risk. | Keep existing Playwright config; verify install, typecheck, and e2e config load. |
| 2 | 1.62.0-alpha-2026-07-04 | 1.62.0-alpha-2026-07-05 | prerelease alpha | npm registry dist/version metadata | No official release notes for daily alpha. Change is prerelease-only and inherits alpha churn risk. | Keep existing Playwright config; verify install, typecheck, and e2e config load. |
| 3 | 1.62.0-alpha-2026-07-05 | 1.62.0-alpha-2026-07-06 | prerelease alpha, npm `next` | npm registry dist-tag `next` | Latest `next` at apply time for both `playwright` and `playwright-core`. No known migration notes. | Pin both packages to `1.62.0-alpha-2026-07-06`. |

## Consolidated upgrade actions
Priority: majors + announcements/blogs/migrations/codemods, then minors, then patches/security.

API changes:
- No Querylane source uses removed Playwright APIs from the stable release notes.
- Existing e2e config already uses prerelease-capable trace/video options and is kept unchanged.

Syntax/style-guide changes:
- None required.

Behavior/config changes:
- Keep Querylane on the Playwright prerelease channel by pinning `playwright` and `playwright-core` to the current npm `next` tag: `1.62.0-alpha-2026-07-06`.
- Do not fall back to latest stable `1.61.1`; user explicitly prefers latest prerelease (`rc` / `alpha` / `beta`).

Repo actions before target install:
- Check direct dependencies and peer adapters.
- Check release age, dist-tags, lockfile source shape, and advisories.
- Verify the Playwright CLI version after install.

## Dependency tree
Target: `playwright@1.62.0-alpha-2026-07-06`, `playwright-core@1.62.0-alpha-2026-07-06`
Parents: direct `frontend/package.json`; `playwright@1.62.0-alpha-2026-07-06` depends on `playwright-core@1.62.0-alpha-2026-07-06`
Children: `playwright-core`, optional `fsevents`
Repo dependents: e2e CLI scripts, `frontend/e2e/playwright.config.ts`, `@vitest/browser-playwright`, `@axe-core/playwright`, Lighthouse script importing `chromium` from `playwright`
Peers: `@vitest/browser-playwright@5.0.0-beta.5` has `playwright: "*"`; its dev dependency is `playwright: ^1.60.0`. `@axe-core/playwright@4.12.2-2d3cb18.0` has `playwright-core: >= 1.0.0`.
Plugins/adapters: Vitest browser Playwright provider, axe-core Playwright integration.

## Non-SemVer scale
Release cadence: daily prerelease alpha builds plus monthly stable releases.
Change volume: unknown per daily alpha; target tarballs are slightly larger than `1.61.1` and newer than the existing alpha by three daily builds.
Diff size: package pins plus lockfile entries and this report.
API churn: medium because this is the prerelease `next` channel.
Effort: low for repo integration because current config loads and tests pass.
Danger/blast radius: e2e/browser-test tooling only; no production runtime dependency, but CI may need fresh browser cache after alpha changes.

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| None found for `playwright@1.62.0-alpha-2026-07-06` | OSV query, GitHub advisory query | dev/test-only package; no known advisory for target | n/a | Accept prerelease risk by user preference |
| None found for `playwright-core@1.62.0-alpha-2026-07-06` | OSV query, GitHub advisory query | dev/test-only package; no known advisory for target | n/a | Accept prerelease risk by user preference |

Supply-chain checks:
- npm dist-tags at apply time: `latest` is `1.61.1`, `next` is `1.62.0-alpha-2026-07-06`, `beta` is `1.61.1-beta-1782889362000`, and `rc` is stale at `1.18.0-rc1`.
- `playwright@1.62.0-alpha-2026-07-06` published 2026-07-06T06:44:21Z.
- `playwright-core@1.62.0-alpha-2026-07-06` published 2026-07-06T06:44:28Z.
- Release age is below the default 7-day supply-chain window; accepted because the user explicitly asked to stay on latest prerelease.
- No git, tarball, or raw URL dependencies found in the package manifest or lockfile entries for this target.
- Install ran with `--ignore-scripts`.

## Risk gate
Decision: apply now
Reason: prerelease/non-SemVer risk, but this is dev/test tooling, the repo was already on a Playwright alpha, and the user explicitly prefers the latest prerelease channel over stable.
Explicit approval: user said, "I want to stay on latest next rc/alpha/beta".

## Commands
```bash
# research / tree
curl -fsSL https://registry.npmjs.org/playwright | jq -r '."dist-tags"'
curl -fsSL https://registry.npmjs.org/playwright-core | jq -r '."dist-tags"'
bun info playwright@1.62.0-alpha-2026-07-06 --json
bun info playwright-core@1.62.0-alpha-2026-07-06 --json

# advisory checks
curl -fsSL -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' -d '{"package":{"name":"playwright","ecosystem":"npm"},"version":"1.62.0-alpha-2026-07-06"}'
curl -fsSL -X POST https://api.osv.dev/v1/query -H 'Content-Type: application/json' -d '{"package":{"name":"playwright-core","ecosystem":"npm"},"version":"1.62.0-alpha-2026-07-06"}'
gh api 'advisories?ecosystem=npm&package=playwright&per_page=20'
gh api 'advisories?ecosystem=npm&package=playwright-core&per_page=20'

# apply
bun update playwright@1.62.0-alpha-2026-07-06 playwright-core@1.62.0-alpha-2026-07-06 --ignore-scripts
bun install --frozen-lockfile --ignore-scripts
bunx playwright --version
bun run lint:fix
bun run type:check
bun run test
bun run test:browser:changed -- --reporter=verbose
bunx vitest run --config vitest.browser.all.config.ts --reporter=verbose
CI=1 bun run test:e2e:list
```

## Verification
Lint: `bun run lint:fix` passed; suppression check passed.
Type check: `bun run type:check` passed.
Tests: `bun run test` passed (118 unit files, 1047 tests; 56 integration files, 296 tests). `QUALITY_BASE_REF=origin/main bun run test:browser:changed -- --reporter=verbose` passed (4 browser files, 22 tests). `bunx vitest run --config vitest.browser.all.config.ts --reporter=verbose` passed (34 browser files, 204 tests). `CI=1 bun run test:e2e:list` passed (83 e2e tests listed). Linux browser baselines were regenerated in Docker for the rebased instance overview surface.
Build/vet/security scan: `bun install --frozen-lockfile --ignore-scripts` passed. `bunx playwright --version` reported `Version 1.62.0-alpha-2026-07-06`. `bun audit --json` reported existing unrelated advisories in `js-yaml`, `tmp`, and `uuid` via `@lhci/cli` / `@changesets`; no Playwright advisory was found in OSV or GitHub advisory checks.
