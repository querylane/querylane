# Dependency upgrade: React Doctor 0.6.2 to 0.7.1

## Summary
- Ecosystem: npm and Bun frontend development dependency.
- Manifest and lockfiles: `frontend/package.json`, `frontend/bun.lock`.
- Dependency relation: direct dev dependency; pulls `oxlint-plugin-react-doctor` and `deslop-js` transitively.
- Request: Ben, to make React Doctor stricter, surface design diagnostics everywhere, and upgrade to latest coverage.

## Version path
Every published stable version from current exclusive to target inclusive; each row was researched from Bun registry metadata and the React Doctor changelog.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 0.6.2 | 0.6.3 | 0.x patch, low API churn | [React Doctor changelog](https://www.react.doctor/docs/community/changelog) | Lint batch balancing and cooperative yielding; changelog says diagnostics are byte-identical. | Apply with target install. |
| 2 | 0.6.3 | 0.7.0 | 0.x minor, medium release-cadence risk | [React Doctor changelog](https://www.react.doctor/docs/community/changelog) | Cache and dead-code reuse changes; no configuration migration required. | Apply with target installation; verify full and changed scans. |
| 3 | 0.7.0 | 0.7.1 | 0.x patch, low API churn | [registry metadata](https://www.npmjs.com/package/react-doctor), [React Doctor changelog](https://www.react.doctor/docs/community/changelog) | Adds no-React-project detection in JSON/API; no rule-id removals observed. | Applied. |

## Consolidated upgrade actions
API changes: `react-doctor/api` still exports `defineConfig`; `0.7.1` JSON/API includes no-React detection fields.
Syntax and style-guide changes: prefer `doctor.config.ts` with `defineConfig`; keep `react-doctor.config.json` as the JSON policy file requested for this repo.
Behavior and configuration changes: all React Doctor categories are error; 383 of 389 local React Doctor rules are error; the remaining 6 are explicitly disabled with rationale in `frontend/doctor.config.ts`; `blocking` is warning; the design tag appears in PR comments, scores, and CI failure surfaces.
Repository actions before target install: install with Bun, scripts disabled, then update `react-doctor@0.7.1`; inspect rule list; run policy test and Doctor changed scan.

## Dependency tree
Target: `react-doctor@0.7.1`.
Parents: direct `frontend/package.json` dev dependency.
Children: `oxlint-plugin-react-doctor@0.7.1`, `deslop-js@0.7.1`, `oxlint >=1.66.0 <1.67.0`, `eslint-plugin-react-hooks`, `@sentry/node`, `jiti`, `conf`, `confbox`, `magicast`, `yaml`, `typescript`.
Repository dependents: `frontend` scripts `doctor`, `doctor:changed`, `doctor:full`, `doctor:ci`, `quality:gate`, `quality:changed`; frontend CI runs `frontend/scripts/run-react-doctor-ci.ts` against the installed `react-doctor@0.7.1`.
Peers: none declared by `react-doctor`.
Plugins and adapters: `oxlint-plugin-react-doctor`, bundled React Compiler and React Hooks diagnostics.
Ignored generated/UI surfaces: `src/components/ui/**`, `src/components/querylane-ui/**`, protobuf/generated route files, build output, coverage, and test result artifacts.

## Non-SemVer scale
Release cadence: high; 0.7.1 was published on 2026-07-04, less than the default 7-day freshness window.
Change volume: moderate for cache internals; rule registry count stayed stable at 389 in local `rules list` output.
Diff size: moderate through transitive package updates.
API churn: low for the CLI and configuration used here.
Effort: low.
Danger and blast radius: medium because this is a strict CI gate and 0.x package, mitigated by a draft PR, pinned CI action package version, local policy tests, and changed-scope and full-scope Doctor verification.

## Security notes
| Advisory | Source | Reachability and exploitability | Fixed version | Decision |
|---|---|---|---|---|
| None for `react-doctor@0.7.1`, `oxlint-plugin-react-doctor@0.7.1`, `deslop-js@0.7.1` | OSV API query | No advisories returned for target packages. | Not applicable | Proceed. |
| No published GitHub advisories for `millionco/react-doctor` | [GitHub security page](https://github.com/millionco/react-doctor/security) | No project advisories listed. | Not applicable | Proceed. |
| Existing unrelated frontend audit findings: `uuid`, `tmp`, `js-yaml` | `bun audit --audit-level low` | From `@lhci/cli`, `shadcn`, and `@changesets/cli`; not introduced by this upgrade. | Not applicable | Document only. |
| Snyk package-manifest check | `snyk test --file=package.json --package-manager=npm --json` | `ok: true`, 0 vulnerabilities reported for the manifest view after removing top-level overrides. | Not applicable | Proceed. |

## Risk gate
Decision: apply now.
Reason: the user explicitly requested the latest strict React Doctor coverage; the researched path has no configuration migration or rule ID removals, but this stays a draft PR because the release age is under 7 days and the package is pre-1.0.
Explicit approval: user requested the upgrade and draft PR in this thread.

## Commands
```bash
cd frontend
bun install --frozen-lockfile --ignore-scripts
bun update react-doctor@0.7.1 --ignore-scripts
bun react-doctor rules list --json
QUALITY_BASE_REF=origin/main bun run doctor:changed
bun vitest run --config vitest.unit.config.ts scripts/react-doctor-policy.unit.test.ts
bun run lint:fix
bun run type:check
bun run build
QUALITY_BASE_REF=origin/main bun run test:unit:changed
QUALITY_BASE_REF=origin/main bun run test:integration:changed
QUALITY_BASE_REF=origin/main bun run test:browser:changed
bun audit --audit-level low
snyk test --file=package.json --package-manager=npm --json
```

## Verification
Lint: `bun run lint:fix` passed.
Type check: `bun run type:check` passed.
Doctor: `bun run doctor:full -- --json --no-score` passed with 0 diagnostics; `bun run doctor:changed` passed with a 100/100 score.
Tests: the policy test failed before the configuration migration. Then `bun run test:unit -- scripts/react-doctor-policy.unit.test.ts`, `QUALITY_BASE_REF=origin/main bun run test:unit:changed` (19 files, 138 tests), `QUALITY_BASE_REF=origin/main bun run test:integration:changed` (25 files, 164 tests), and `QUALITY_BASE_REF=origin/main bun run test:browser:changed` (26 files, 192 tests) passed.
Build, vet, and security scan: `bun run build` passed. `bun audit --audit-level low` still reports existing unrelated `@lhci/cli`, `shadcn`, and `@changesets/cli` advisories. OSV target package queries returned no advisories. `snyk test --file=package.json --package-manager=npm --json` returned `ok: true` with 0 vulnerabilities after removing top-level overrides in response to PR review feedback.

## Notes
React Doctor 0.7.1 does not detect this repository's React Compiler setup from `rsbuild.config.ts`; it detects only known package and configuration surfaces locally. The explicit `compilationMode: "annotation"` was removed in response to PR review because Rsbuild infers the repository's compiler mode and the explicit option made the configuration less strict.
Disabled rules are limited to documented false positives/tooling conflicts: automatic JSX runtime (`react-in-jsx-scope`), Tailwind/shadcn `className` styling API (`forbid-component-props`), lazy stable state instances (`hook-use-state`), formatter conflict on boolean JSX props (`jsx-boolean-value`), pass-through event props (`jsx-handler-names`), and typed adapter prop forwarding (`jsx-props-no-spreading`).
Frontend CI does not use `millionco/react-doctor@v2` after PR feedback because that composite action still shells through `actions/cache@v4` internally, producing Node 20 deprecation warnings even while the workflow itself uses Node 24 LTS. The local wrapper keeps the sticky PR comment, commit status, score, and CI summary surfaces without the deprecated action dependency.
