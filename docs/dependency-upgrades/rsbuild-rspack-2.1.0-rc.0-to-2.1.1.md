# Dependency upgrade: Rsbuild/Rspack 2.1.0-rc.0 -> 2.1.1

## Summary
- Ecosystem: npm/Bun frontend build tooling.
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`.
- Direct dep, parent dep, or transitive: direct `@rsbuild/core` and `@rspack/core`; related direct `@rsbuild/plugin-react`, `@rsbuild/plugin-tailwindcss`, and `@rsdoctor/rspack-plugin`.
- Requested by: move to Rsbuild 2.1/Rspack 2.1 and keep the Rsbuild Tailwind CSS plugin path. Follow-up removed the Rsdoctor GitHub Action because bundle-size CI was too expensive.

## Version path
Every published stable version from current exclusive to target inclusive; research every row; do not install every version.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | `@rsbuild/core` `2.1.0-rc.0` | `2.1.0` | prerelease -> stable minor | Rsbuild 2.1 release notes and announcement | Rsbuild 2.1 is powered by Rspack 2.1, exposes Rust React Compiler through `@rsbuild/plugin-react`, and documents Tailwind CSS v4 integration through `@rsbuild/plugin-tailwindcss`. Querylane already had the React Compiler and Tailwind plugin config from the rc line. | Keep existing React Compiler config and Tailwind plugin config; update direct package. |
| 2 | `@rsbuild/core` `2.1.0` | `2.1.1` | patch | Rsbuild v2.1.1 release notes | Patch updates `@rspack/core` to `2.1.1`. | Update direct package. |
| 3 | `@rspack/core` `2.1.0-rc.0` | `2.1.0` | prerelease -> stable minor | Rspack 2.1 release notes and announcement | Adds Rust React Compiler support, build-performance work, CSS improvements, persistent-cache cleanup, pureFunctions stabilization, branch-aware pruning, and RISC-V bindings. Querylane already uses relevant experiments and React Compiler path from the rc. | Update direct package and lockfile bindings. |
| 4 | `@rspack/core` `2.1.0` | `2.1.1` | patch | Rspack v2.1.1 release notes | Fixes CSS runtime guard and reverts CJS export assignment side-effect optimization; adds Rsdoctor export usage edge metadata. | Update direct package and lockfile bindings. |
| 5 | `@rsbuild/plugin-tailwindcss` `2.0.3` | `2.0.3` | no newer stable | npm dist-tags and Rsbuild 2.1 announcement | The plugin is already present and wired in `frontend/rsbuild.config.ts`. No `2.1.x` stable exists. Vitest browser mode still needs `@tailwindcss/postcss` via Vite. | Keep `pluginTailwindcss()` and keep `frontend/postcss.config.mjs`. |
| 6 | `@rsdoctor/rspack-plugin` `2.0.0-alpha.0` | `2.0.0-alpha.0` | unchanged prerelease | npm dist-tags, PR review feedback | `2.0.0-alpha.0` was already installed. Moving to stable `1.5.16` pulled a socket.io subtree, so this follow-up keeps the existing alpha rather than changing Rsdoctor plugin footprint in the Rsbuild upgrade. | Leave unchanged; local `RSDOCTOR=1` profile build still works. |

## Consolidated upgrade actions

API changes:
- Keep `pluginReact({ reactCompiler: { target: "19" } })`; Rsbuild 2.1 documents the Rust React Compiler path through `@rsbuild/plugin-react`.
- Keep `pluginTailwindcss()`; Rsbuild 2.1 documents this as the Tailwind CSS v4 integration.
- Keep `@tailwindcss/postcss`; Querylane browser tests run through Vite, not Rsbuild.

Syntax/style-guide changes:
- Remove duplicate `bundle:analyze` script. `build:profile` is the single Rsdoctor profile build entrypoint.

Behavior/config changes:
- Build tooling moves from Rsbuild/Rspack `2.1.0-rc.0` to stable `2.1.1`.
- No GitHub Action bundle-size workflow is added; the attempted Rsdoctor Action workflow was removed to avoid CI cost.
- The lockfile change makes changed-browser CI run a broad browser set, so stale assertions found on `origin/main` were aligned with the current faceted-filter button UI and schema-qualified catalog object labels.

## Dependency tree
Target: `@rsbuild/core`, `@rspack/core`.
Parents: direct dev dependencies.
Children: `@rsbuild/core` depends on `@rspack/core`; `@rspack/core` depends on platform `@rspack/binding-*` packages.
Repo dependents: `frontend/rsbuild.config.ts`, `frontend/package.json`, `frontend/bun.lock`.
Peers: `@rsbuild/plugin-react` peers with Rsbuild; `@rsbuild/plugin-tailwindcss` peers with Rsbuild and Tailwind; `@rsdoctor/rspack-plugin@2.0.0-alpha.0` peers with Rspack (`*`).
Plugins/adapters: TanStack Router Rspack plugin, Sentry webpack plugin, Rsdoctor Rspack plugin, Rsbuild Tailwind plugin.

## Non-SemVer scale
Release cadence: high around 2.1 release week.
Change volume: medium from rc to stable; low patch from `2.1.0` to `2.1.1`.
Diff size: manifest and lockfile only after removing the bundle-analysis workflow.
API churn: low in Querylane because rc config already had React Compiler, Tailwind plugin, Rsdoctor integration, and Rspack experiments.
Effort: low.
Danger/blast radius: frontend build tooling.

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| none for `@rsbuild/core` | GitHub Advisory Database query | no advisory returned | not applicable | proceed |
| `GHSA-84jw-g43v-8gjm` for old `@rspack/core` | GitHub Advisory Database query | affects `< 1.0.0-rc.1`; Querylane is on `2.1.x`, not affected | `1.0.0-rc.1` | proceed |
| none for `@rsbuild/plugin-tailwindcss` | GitHub Advisory Database query | no advisory returned | not applicable | proceed |
| none for `@rsdoctor/rspack-plugin` | GitHub Advisory Database query | no advisory returned | not applicable | proceed |
| `bun audit` residuals | local audit | reports pre-existing transitive advisories via `@lhci/cli`, `shadcn`, `@changesets/cli`, `@vitest/browser`, `happy-dom`, and the existing Rsdoctor alpha `ws` path | not fixed by this focused upgrade | document residual risk |

## Risk gate
Decision: apply now.
Reason: user explicitly requested the release-day move to Rsbuild 2.1; Querylane was already on `2.1.0-rc.0`, so the package move is rc-to-stable plus patch, not a new major migration. Residual risk is release age: `@rsbuild/core`/`@rspack/core` `2.1.1` were published on 2026-06-27, under the normal 7-day supply-chain soak.
Explicit approval: user request in this thread.

## Commands
```bash
git fetch origin main --prune
git switch -c ben-malinski/no-ticket/rsbuild-2-1 origin/main
cd frontend
bun pm view @rsbuild/core versions --json
bun pm view @rspack/core versions --json
bun pm view @rsbuild/plugin-tailwindcss versions --json
bun update @rsbuild/core@2.1.1 @rspack/core@2.1.1 @rsbuild/plugin-react@2.1.0 @rsbuild/plugin-tailwindcss@2.0.3
bun install --frozen-lockfile
bun audit
bun run lint:fix
bun run type:check
bun run build
bun run test
QUALITY_BASE_REF=origin/main bun run doctor:ci
QUALITY_BASE_REF=origin/main bun run test:browser:changed -- --reporter=verbose
RSDOCTOR=1 bun run build:profile
```

## Verification
Lint: `bun run lint:fix` passed.
Type check: `bun run type:check` passed.
Tests: `bun run test` passed (103 unit files, 889 unit tests; 52 integration files, 256 integration tests); `QUALITY_BASE_REF=origin/main bun run test:browser:changed -- --reporter=verbose` passed (32 browser files, 190 browser tests).
Build/vet/security scan: `bun run build` passed; `QUALITY_BASE_REF=origin/main bun run doctor:ci` passed; `RSDOCTOR=1 bun run build:profile` passed; `bun audit` still reports residual transitive advisories documented above.
