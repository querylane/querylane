# Dependency upgrade: frontend packages current -> newest risky targets

## Summary
- Ecosystem: npm/Bun frontend workspace
- Manifest/lockfiles: frontend/package.json, frontend/bun.lock
- Direct dep, parent dep, or transitive: direct dependencies and direct devDependencies; package overrides are removed after review
- Requested by: user asked to upgrade every single Querylane frontend package, including risky beta, rc, alpha, and nightlies
- Target policy: highest semver including prereleases; fresh nightly/canary/experimental/insiders channels when newer than the current manifest version; stale prerelease downgrades skipped; PR feedback overrode prerelease choices where the changelog showed no Querylane benefit or a peer/tooling risk.
- Rebase note: report is aligned to `origin/main` after Base UI 1.6.0 merged; `@base-ui/react` is already in the base branch and is not part of this PR delta.
- Full per-package version paths: docs/dependency-upgrades/frontend-packages-full-version-paths.json

## Version path
Every published version path captured in JSON because this request spans 80 direct package entries.

| Package | Section | From | To | Target reason | Release age days | Path count | Prerelease |
|---|---|---:|---:|---|---:|---:|---|
| @axe-core/playwright | devDependencies | ^4.11.3 | 4.12.2-6c589ff.0 | highest-semver-including-prerelease | 1 | 25 | yes |
| @base-ui/react | dependencies | 1.6.0 | 1.6.0 | already-current-after-rebase | 6 | 0 | no |
| @biomejs/biome | devDependencies | 2.5.0 | 2.5.1 | highest-semver-including-prerelease | 1 | 1 | no |
| @bufbuild/protobuf | dependencies | 2.12.0 | 2.12.1 | highest-semver-including-prerelease | 2 | 1 | no |
| @bufbuild/protovalidate | dependencies | ^1.2.0 | 1.2.0 | highest-semver-including-prerelease | 63 | 0 | no |
| @changesets/cli | devDependencies | ^2.31.0 | 2.31.0 | held-stable-action-v1-compatible | 94 | 0 | no |
| @connectrpc/connect | dependencies | 2.1.2 | 2.1.2 | highest-semver-including-prerelease | 11 | 0 | no |
| @connectrpc/connect-query | dependencies | ^2.2.0 | 2.2.0 | highest-semver-including-prerelease | 287 | 0 | no |
| @connectrpc/connect-query-core | dependencies | ^2.2.0 | 2.2.0 | highest-semver-including-prerelease | 287 | 0 | no |
| @connectrpc/connect-web | dependencies | 2.1.2 | 2.1.2 | highest-semver-including-prerelease | 11 | 0 | no |
| @fontsource-variable/geist | dependencies | ^5.2.9 | 5.2.9 | highest-semver-including-prerelease | 38 | 0 | no |
| @fontsource-variable/geist-mono | dependencies | ^5.2.8 | 5.2.8 | highest-semver-including-prerelease | 38 | 0 | no |
| @lhci/cli | devDependencies | 0.15.1 | 0.15.1 | highest-semver-including-prerelease | 363 | 0 | no |
| @rsbuild/core | devDependencies | 2.1.0-beta.0 | 2.1.0-rc.0 | highest-semver-including-prerelease | 0 | 1 | yes |
| @rsbuild/plugin-react | devDependencies | 2.1.0 | 2.1.0 | highest-semver-including-prerelease | 6 | 0 | no |
| @rsbuild/plugin-tailwindcss | devDependencies | 2.0.3 | 2.0.3 | highest-semver-including-prerelease | 11 | 0 | no |
| @rsdoctor/rspack-plugin | devDependencies | 1.5.15 | 2.0.0-alpha.0 | alpha-after-review-with-rsdoctor-build-verification | 0 | 2 | yes |
| @rspack/core | devDependencies | 2.1.0-beta.0 | 2.1.0-rc.0 | highest-semver-including-prerelease | 1 | 1 | yes |
| @t3-oss/env-core | dependencies | ^0.13.11 | 0.13.11 | highest-semver-including-prerelease | 93 | 0 | no |
| @tailwindcss/postcss | devDependencies | 4.3.1 | 4.3.1 | stable-4x-after-review | 2 | 0 | no |
| @tailwindcss/vite | devDependencies | 4.3.1 | 4.3.1 | stable-4x-after-review | 2 | 0 | no |
| @tanstack/query-core | dependencies | ^5.101.0 | 5.101.1 | highest-semver-including-prerelease | 1 | 1 | no |
| @tanstack/react-query | dependencies | 5.101.0 | 5.101.1 | highest-semver-including-prerelease | 1 | 1 | no |
| @tanstack/react-query-devtools | dependencies | 5.101.0 | 5.101.1 | highest-semver-including-prerelease | 1 | 1 | no |
| @tanstack/react-router | dependencies | 1.170.16 | 1.170.16 | highest-semver-including-prerelease | 7 | 0 | no |
| @tanstack/react-router-devtools | dependencies | 1.167.0 | 1.167.0 | highest-semver-including-prerelease | 39 | 0 | no |
| @tanstack/react-table | dependencies | 9.0.0-beta.17 | 9.0.0-beta.18 | highest-semver-including-prerelease | 0 | 1 | yes |
| @tanstack/router-plugin | dependencies | 1.168.18 | 1.168.18 | highest-semver-including-prerelease | 18 | 0 | no |
| @tanstack/virtual-core | dependencies | 3.17.1 | 3.17.1 | highest-semver-including-prerelease | 8 | 0 | no |
| @testing-library/dom | devDependencies | ^10.4.1 | 10.4.1 | highest-semver-including-prerelease | 332 | 0 | no |
| @testing-library/react | devDependencies | ^16.3.2 | 16.3.2 | highest-semver-including-prerelease | 156 | 0 | no |
| @testing-library/user-event | devDependencies | ^14.6.1 | 14.6.1 | highest-semver-including-prerelease | 518 | 0 | no |
| @types/istanbul-lib-coverage | devDependencies | ^2.0.6 | removed | removed-direct-istanbul-after-review | 960 | 0 | no |
| @types/istanbul-lib-report | devDependencies | ^3.0.3 | removed | removed-direct-istanbul-after-review | 960 | 0 | no |
| @types/istanbul-reports | devDependencies | ^3.0.4 | removed | removed-direct-istanbul-after-review | 960 | 0 | no |
| @types/node | devDependencies | 25.9.3 | 26.0.0 | highest-semver-including-prerelease | 5 | 2 | no |
| @types/react | devDependencies | 19.2.17 | 19.2.17 | highest-semver-including-prerelease | 18 | 0 | no |
| @types/react-dom | devDependencies | 19.2.3 | 19.2.3 | highest-semver-including-prerelease | 224 | 0 | no |
| @typescript/native-preview | devDependencies | 7.0.0-dev.20260618.1 | 7.0.0-dev.20260624.1 | highest-semver-including-prerelease | 0 | 6 | yes |
| @vitest/browser | devDependencies | 4.1.9 | 5.0.0-beta.5 | highest-semver-including-prerelease | 9 | 5 | yes |
| @vitest/browser-playwright | devDependencies | 4.1.9 | 5.0.0-beta.5 | highest-semver-including-prerelease | 9 | 5 | yes |
| @vitest/ui | devDependencies | 4.1.9 | 5.0.0-beta.5 | highest-semver-including-prerelease | 9 | 5 | yes |
| @xyflow/react | dependencies | ^12.11.0 | 12.11.1 | highest-semver-including-prerelease | 2 | 1 | no |
| bun-types | devDependencies | 1.3.14 | 1.4.0-canary.20260519T150915 | fresh-canary-channel | 35 | 1 | yes |
| chrono-node | dependencies | ^2.9.1 | 2.9.1 | highest-semver-including-prerelease | 49 | 0 | no |
| class-variance-authority | dependencies | ^0.7.1 | 0.7.1 | highest-semver-including-prerelease | 575 | 0 | no |
| cmdk | dependencies | ^1.1.1 | 1.1.1 | highest-semver-including-prerelease | 466 | 0 | no |
| cnfast | dependencies | ^0.0.8 | 0.0.8 | highest-semver-including-prerelease | 2 | 0 | no |
| date-fns | dependencies | 4.4.0 | 4.4.0 | held-stable-alpha-no-app-benefit | 25 | 0 | no |
| dotenv | devDependencies | ^17.4.2 | 17.4.2 | highest-semver-including-prerelease | 72 | 0 | no |
| happy-dom | devDependencies | 20.10.6 | 20.10.6 | highest-semver-including-prerelease | 6 | 0 | no |
| istanbul-lib-coverage | devDependencies | ^3.2.2 | removed | removed-direct-istanbul-after-review | 959 | 0 | no |
| istanbul-lib-report | devDependencies | ^3.0.1 | removed | removed-direct-istanbul-after-review | 1065 | 0 | no |
| istanbul-reports | devDependencies | ^3.2.0 | removed | removed-direct-istanbul-after-review | 310 | 0 | no |
| lucide-react | dependencies | 1.21.0 | 1.21.0 | highest-semver-including-prerelease | 6 | 0 | no |
| next-themes | dependencies | ^0.4.6 | 0.4.6 | stale-prerelease-skipped-latest-stable | 469 | 0 | no |
| playwright | devDependencies | 1.61.0 | 1.62.0-alpha-2026-06-24 | highest-semver-including-prerelease | 0 | 16 | yes |
| playwright-core | devDependencies | 1.61.0 | 1.62.0-alpha-2026-06-24 | highest-semver-including-prerelease | 0 | 16 | yes |
| react | dependencies | 19.2.7 | 19.2.7 | stable-latest-after-review | 18 | 0 | no |
| react-data-grid | dependencies | 7.0.0-beta.59 | 7.0.0-beta.59 | current-latest-stale-canary-skipped | 1855 | 0 | yes |
| react-day-picker | dependencies | ^10.0.1 | 10.0.1 | highest-semver-including-prerelease | 40 | 0 | no |
| react-doctor | devDependencies | 0.5.6 | 0.5.8 | highest-semver-including-prerelease | 4 | 28 | no |
| react-dom | dependencies | 19.2.7 | 19.2.7 | stable-latest-after-review | 18 | 0 | no |
| react-hook-form | dependencies | 7.79.0 | 7.80.0 | stable-latest-after-browser-smoke | 38 | 0 | no |
| react-resizable-panels | dependencies | 4.11.2 | 4.11.2 | highest-semver-including-prerelease | 31 | 0 | no |
| rsbuild-plugin-devtools-json | devDependencies | 1.0.1 | 1.0.1 | highest-semver-including-prerelease | 26 | 0 | no |
| shadcn | devDependencies | 4.11.0 | 4.11.0 | highest-semver-including-prerelease | 16 | 0 | no |
| sonner | dependencies | ^2.0.7 | 2.0.7 | highest-semver-including-prerelease | 325 | 0 | no |
| tailwindcss | dependencies | 4.3.1 | 4.3.1 | stable-4x-after-review | 2 | 0 | no |
| tw-animate-css | devDependencies | ^1.4.0 | 1.4.0 | stable-latest-after-review | 273 | 0 | no |
| typescript | devDependencies | 6.0.3 | 6.0.3 | held-ts6-native-preview-covers-ts7 | 6 | 0 | no |
| ultracite | devDependencies | 7.8.3 | 7.8.3 | highest-semver-including-prerelease | 14 | 0 | no |
| vitest | devDependencies | 4.1.9 | 5.0.0-beta.5 | highest-semver-including-prerelease | 9 | 5 | yes |
| vitest-browser-react | devDependencies | 2.2.0 | 2.2.0 | highest-semver-including-prerelease | 80 | 0 | no |
| zod | dependencies | 4.4.3 | 4.4.3 | held-stable-canary-no-app-benefit | 50 | 0 | no |
| zustand | dependencies | 5.0.14 | 5.0.14 | highest-semver-including-prerelease | 27 | 0 | no |

## Consolidated upgrade actions
API changes:
- React and React DOM stay on latest stable 19.2.7 after review rejected the experimental channel.
- Vitest browser packages move to 5.0 beta; all direct Vitest coverage scripts, provider config, and merge tooling are removed after review.
- React Hook Form stops at latest stable 7.80.0; 8.0.0-beta.2 caused maximum-update-depth errors in browser onboarding smoke.
- date-fns stays on 4.4.0 because v5 alpha is package-size/CDN work only and peer ranges remain 4.x.
- Tailwind packages stay on stable 4.3.1 after review rejected 0.0.0 insiders builds.
- Rspack/Rsbuild move from beta to rc where available; Rsdoctor is restored to 2.0.0-alpha.0 after review and the Rsdoctor build is verified.
- react-data-grid stayed on 7.0.0-beta.59 because its canary dist-tag is older and regresses package exports and API shape.
- next-themes stayed on 0.4.6 because the 1.0.0 beta is an old, stale prerelease outside the current stable lineage.
- TypeScript package stays on 6.0.3; the native-preview tsgo package carries the TS7-native benefit used by this repo.
- Zod stays on stable 4.4.3; the 4.5 canary touches JSON Schema/CIDR internals Querylane does not use.

Syntax/style-guide changes:
- Deleted package-version policy assertions for React Doctor and Vitest UI so tests no longer require edits for dependency bumps.
- Enabled broader React Doctor opt-in rules, plus Biome `noAutofocus`, and a large Biome rule set verified by a rule sweep; only high-churn refactor rules with current findings stay out of this dependency PR.
- Updated the sort-column integration test to use the accessible add-sort-column combobox after giving the trigger a stable ARIA label.
- Enabled `exactOptionalPropertyTypes` for the UI TypeScript config and fixed the resulting `sonner` prop typing.

Behavior/config changes:
- Added an admin-shell browser-test scale shim to preserve existing Linux visual baselines after Vitest 5 screenshot capture semantics changed.
- Removed all package-manager overrides after review accepted dev-tooling transitive advisory risk over forced overrides.
- External browser telemetry setup is no longer bundled in this app.
- Advanced Rspack/Rsbuild settings are now explicit: deterministic IDs, duplicate chunk merge, real content hash, export/module graph optimizers, `incremental: advance-silent`, `runtimeMode: rspack`, deferred imports, native watcher, pure functions, future defaults, and explicit Rsdoctor loader/plugin/resolver/bundle/tree-shaking analysis unless explicitly disabled.
- Very high toolchain blast radius remains: Vitest beta, Playwright alpha, Rsbuild/Rspack rc, Rsdoctor alpha, and TypeScript native-preview.
- Some targets are younger than seven days: @axe-core/playwright@4.12.2-6c589ff.0, @biomejs/biome@2.5.1, @bufbuild/protobuf@2.12.1, @rsbuild/core@2.1.0-rc.0, @rspack/core@2.1.0-rc.0, @tanstack/query-core@5.101.1, @tanstack/react-query@5.101.1, @tanstack/react-query-devtools@5.101.1, @tanstack/react-table@9.0.0-beta.18, @types/node@26.0.0, @typescript/native-preview@7.0.0-dev.20260624.1, @xyflow/react@12.11.1, playwright@1.62.0-alpha-2026-06-24, playwright-core@1.62.0-alpha-2026-06-24, react-doctor@0.5.8.
- Non-semver pins are intentional risky-channel pins in this PR: @axe-core/playwright uses a commit-SHA prerelease and bun-types uses a dated canary because the request explicitly asked for beta/rc/alpha/nightly packages. Re-check both on the next dependency sweep because registry availability is more fragile than normal semver releases.

Repo actions before target install:
- Preserved direct package relationship groups: React + React DOM; Vitest family; Playwright + Playwright core; Tailwind family; TanStack query family; Rspack/Rsbuild family.
- Removed all overrides; no package-manager resolution forcing remains.

## Dependency tree
Target: all direct frontend package entries. Parents: frontend/package.json. Children: transitive packages resolved by Bun. Repo dependents: frontend source, tests, scripts, Rsbuild config, Vitest config, Playwright E2E, bundle/lighthouse scripts. Peers: React, React DOM, TanStack Query, Rsbuild/Rspack, Tailwind, Vitest, Playwright. Plugins/adapters: connect-query, router-plugin, rsbuild plugins, tailwind plugins, vitest browser/playwright adapter.

## Non-SemVer scale
Release cadence: high. Change volume: very high. Diff size: high lockfile churn. API churn: high. Effort: high. Danger/blast radius: very high.

## Security notes
Package-manager overrides were removed after review. `bun audit` now reports only dev/test/tooling transitive advisories, not app runtime dependencies, and these should be handled by upstream package updates instead of forced overrides in this PR.

| Advisory | Source | Reachability/exploitability | Decision |
|---|---|---|---|
| GHSA-w5hq-g745-h8pq | `@lhci/cli > uuid` | Lighthouse CLI transitive, not app runtime | No override |
| GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 | `@lhci/cli > tmp` | Lighthouse CLI transitive, not app runtime | No override |
| GHSA-96hv-2xvq-fx4p | `@vitest/browser`, `happy-dom`, `@rsdoctor/rspack-plugin`, Lighthouse transitives > `ws` | Test/build tooling transitive | No override |
| GHSA-h67p-54hq-rp68 | `@lhci/cli`, `shadcn`, Changesets transitives > `js-yaml` | CLI transitive, not app runtime | No override |

## Risk gate
Decision: apply now
Reason: user explicitly overrode risk gate and requested everything, including beta, rc, alpha, and nightlies.
Explicit approval: "everything. risky upgrades. beta/rc/alpha/nightlies."

## Commands
```bash
bun /tmp/compute-frontend-targets.mjs
bun install
bun audit
bun run lint:fix
bun run type:check
bun run build
bun run build:profile
bun run test
QUALITY_BASE_REF=origin/main bun run test:browser:changed -- --reporter=verbose
./node_modules/.bin/react-doctor . -y --scope changed --base origin/main --no-respect-inline-disables --verbose
```

## Verification
Lint: pass. Type check: pass. Tests: full unit/integration pass; targeted harness unit pass. Backend CORS targeted tests pass. Build/vet/security scan: normal build pass (`initial-br=239.9 KiB`, `total-br=801.6 KiB`), Rsdoctor alpha `build:profile` pass. Changed browser passes locally after the Vitest 5 browser-scale fix. `bun audit` reports dev-tooling transitives because package overrides were intentionally removed. `build:profile` removes `dist` first so Rsdoctor output cannot mix stale profile assets into later budget checks. Dev-server smoke passed with native watcher/runtime experiments enabled (`bun run dev`, `curl /`, live edit, `curl /`).

## Known residual risk
- Frontend still carries risky prerelease/nightly toolchain pins; re-check the SHA/date prereleases during the next dependency sweep.
- React Hook Form 8 beta was dropped after full browser surfaced maximum-update-depth errors; stable 7.80.0 removes that runtime failure.
- Full-scope React Doctor 0.5.8 reports pre-existing warnings in unchanged app files; PR CI uses changed-scope React Doctor, which passes.
