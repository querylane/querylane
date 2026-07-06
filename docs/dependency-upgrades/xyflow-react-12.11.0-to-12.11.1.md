# Dependency upgrade: @xyflow/react 12.11.0 -> 12.11.1

## Summary
- Ecosystem: JavaScript package, Bun workspace under `frontend/`.
- Manifest/lockfiles: `frontend/package.json`, `frontend/bun.lock`.
- Direct dep, parent dep, or transitive: Direct dependency.
- Requested by: User-provided xyflow release links for `@xyflow/react@12.11.0` and `@xyflow/react@12.11.1`.
- Status: Manifest and lockfile were already pinned to `12.11.1`; this pass verified the release path and applied the relevant Querylane canvas UX follow-up.

## Version path
Every published stable version from current exclusive to target inclusive; research every row; do not install every version.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 12.11.0 | 12.11.1 | Patch | GitHub release, package registry | No migration. Patch fixes include stable edge positions after node deletion, connection-end pane click behavior, connection-state typing, and reduced per-handle store work. `@xyflow/system` moves from `0.0.77` to `0.0.78`. | Keep `frontend/package.json` and `frontend/bun.lock` at `12.11.1`. No code migration required. |

Context reviewed from the immediately preceding minor:

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| Context | 12.10.2 | 12.11.0 | Minor | GitHub release, package registry | No breaking migration noted. Adds `autoPanOnSelection`, improves type coverage, and fixes several drag, resize, and store-updater behaviors. | Make Querylane's intended selection auto-pan behavior explicit in `FlowCanvas`. |

## Consolidated upgrade actions
Priority: majors + announcements/blogs/migrations/codemods, then minors, then patches/security.

API changes:
- `autoPanOnSelection` is available on `ReactFlow`.
- Installed React Flow nodes already carry `ariaLabel` through to the node DOM; Querylane can supply useful labels for better canvas accessibility.

Syntax/style-guide changes:
- None.

Behavior/config changes:
- Selection dragging can pan the canvas near viewport edges.
- Node labels improve screen-reader and test-visible semantics.

Repo actions before target install:
- None. Target was already installed and locked.

## Dependency tree
Target: `@xyflow/react@12.11.1`
Parents: direct dependency from `frontend/package.json`
Children: `@xyflow/system@0.0.78`, `classcat`, `zustand`
Repo dependents: `frontend/src/features/database-visualization/flow-canvas.tsx`
Peers: `react`, `react-dom`, optional `@types/react`, optional `@types/react-dom`
Plugins/adapters: none

## Non-SemVer scale
Release cadence: normal patch cadence
Change volume: low
Diff size: low
API churn: low
Effort: low
Danger/blast radius: low, limited to React Flow canvas behavior

## Security notes
| Advisory | Source | Reachability/exploitability | Fixed version | Decision |
|---|---|---|---|---|
| None for `@xyflow/react` in `bun audit` output | `bun audit --cwd frontend --json` | Not applicable | Not applicable | Proceed. Existing audit findings are unrelated packages: `js-yaml`, `tmp`, `uuid`. |

## Risk gate
Decision: apply now
Reason: Patch target, clear release notes, peers unchanged, target older than seven days as of 2026-07-06, and package was already locked.
Explicit approval: User requested the upgrade and UX verification.

## Commands
```bash
# research
python3 - <<'PY'
import json, urllib.request
with urllib.request.urlopen('https://registry.npmjs.org/@xyflow%2freact', timeout=20) as r:
    d = json.load(r)
for v in ['12.11.0', '12.11.1']:
    print(v, d['time'][v], d['versions'][v].get('dependencies'), d['versions'][v].get('peerDependencies'))
PY

# target already present
jq -r '.dependencies["@xyflow/react"]' frontend/package.json
grep -n '@xyflow/react' frontend/bun.lock

# focused verification
bun run --cwd frontend test:integration -- flow-canvas.integration.test.tsx
```

## Verification
Lint: `bun run --cwd frontend lint:fix` and `bun run --cwd frontend lint` passed
Type check: `bun run --cwd frontend type:check` passed
Tests: `bun run --cwd frontend test:integration -- flow-canvas.integration.test.tsx` passed
Build/vet/security scan: `bun run --cwd frontend doctor:changed` passed; `bun audit --cwd frontend --json` found no `@xyflow/react` advisories; unrelated existing advisories remain in `js-yaml`, `tmp`, and `uuid`
