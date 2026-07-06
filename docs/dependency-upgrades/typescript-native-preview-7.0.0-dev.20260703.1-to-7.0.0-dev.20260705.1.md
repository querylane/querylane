# Dependency upgrade: @typescript/native-preview 7.0.0-dev.20260703.1 -> 7.0.0-dev.20260705.1

## Summary
- Ecosystem: JavaScript/Bun frontend workspace.
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`.
- Direct dep, parent dep, or transitive: direct dev dependency.
- Requested by: user request for latest TypeScript native preview / `tsgo` and strict UI type-check hardening.

## Version path
Every published version from current exclusive to target inclusive; research every row; do not install every version.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 7.0.0-dev.20260703.1 | 7.0.0-dev.20260704.1 | nightly preview; non-SemVer date build | package registry versions for `@typescript/native-preview` | no package-specific migration notes found for this nightly hop; official TS 7 RC notes say native-preview nightlies still expose `tsgo` | include in reviewed path; install target once |
| 2 | 7.0.0-dev.20260704.1 | 7.0.0-dev.20260705.1 | nightly preview; non-SemVer date build | package registry metadata for `@typescript/native-preview@7.0.0-dev.20260705.1` | no package-specific migration notes found for this nightly hop; package bin remains `tsgo` | applied target exact pin |

## Consolidated upgrade actions
API changes: none required in Querylane source; `tsgo` binary remains present.
Syntax/style-guide changes: removed local checker escape hatch in `rsbuild.config.ts` by typing Rsdoctor options structurally instead of `as never`.
Behavior/config changes: removed `bun-types` from frontend type roots/package because no app/tooling source references Bun globals; kept browser app on Rsbuild env types and Node/tooling on Rsbuild + Node types; enabled `skipLibCheck: false` for registry UI declaration generation where vendor declarations pass.
Repo actions before target install: audited TypeScript suppressions/casts, checked current scripts already use `tsgo` not `tsc`, verified `typescript@6.0.3` remains latest stable for peer-tooling package imports.

## Dependency tree
Target: `@typescript/native-preview`. Parents: root `frontend/package.json` devDependency. Children: platform optional packages `@typescript/native-preview-{darwin,linux,win32}-*`. Repo dependents: `type:check`, `type:check:ui`, `postinstall`. Peers: none. Plugins/adapters: none.

## Non-SemVer scale
Release cadence: daily/nightly. Change volume: unknown per nightly. Diff size: package tarball metadata changed, optional platform package integrities changed. API churn: low for CLI use because `tsgo` remains. Effort: low. Danger/blast radius: medium because compiler updates can surface stricter diagnostics.

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| none for `@typescript/native-preview` in this run | `bun audit` | not applicable | not applicable | proceed |
| pre-existing transitive advisories: `js-yaml`, `tmp`, `uuid` | `bun audit` | not introduced by this dependency bump; separate remediation needed | see advisory fixed versions | documented residual risk |

## Risk gate
Decision: apply now.
Reason: user explicitly requested latest native-preview/`tsgo`; package was already on the same nightly preview line; compiler, full tests, doctor, and build pass after hardening changes.
Explicit approval: direct user request in this thread.

## Commands
```bash
bun pm view @typescript/native-preview version
bun pm view @typescript/native-preview versions --json
bun add -d @typescript/native-preview@7.0.0-dev.20260705.1 --ignore-scripts
bun remove bun-types --ignore-scripts
bun run lint:fix
bun run type:check
bun run test:unit -- src/components/onboarding-wizard/hooks/use-setup-execution.unit.test.ts src/features/data-explorer/data-explorer-page-controller.unit.test.ts src/lib/observability/sentry.unit.test.ts src/lib/route-data-prefetch.unit.test.ts src/lib/transport.unit.test.ts src/theme-provider.unit.test.tsx
bun run test:integration -- src/features/data-explorer/data-explorer-page.integration.test.tsx src/lib/download-blob.integration.test.ts
bun run test
bun run doctor:changed
bun run build
RSDOCTOR=1 bun run build:profile
bun audit
```

## Verification
Lint: `bun run lint:fix` passed. Type check: `bun run type:check` passed with `tsgo 7.0.0-dev.20260705.1`. Tests: focused unit/integration tests and full `bun run test` passed. Build/vet/security scan: `bun run doctor:changed`, `bun run build`, and `RSDOCTOR=1 bun run build:profile` passed; `bun audit` completed with pre-existing transitive advisories unrelated to this bump.
