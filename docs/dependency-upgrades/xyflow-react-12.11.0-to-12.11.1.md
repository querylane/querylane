# Dependency upgrade: @xyflow/react 12.11.0 to 12.11.1

## Summary
- Ecosystem: JavaScript package, Bun workspace under `frontend/`.
- Manifest and lockfiles: `frontend/package.json`, `frontend/bun.lock`.
- Dependency relation: direct dependency.
- Request: user-provided xyflow release links for `@xyflow/react@12.11.0` and `@xyflow/react@12.11.1`.
- Status: Manifest and lockfile were already pinned to `12.11.1`; this pass verified the release path and applied the relevant Querylane canvas accessibility follow-up.

## Version path
Every published stable version from current exclusive to target inclusive; research every row; do not install every version.

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| 1 | 12.11.0 | 12.11.1 | patch | GitHub release, package registry | No migration. Patch fixes include stable edge positions after node deletion, connection-end pane click behavior, connection-state typing, and reduced per-handle store work. `@xyflow/system` moves from `0.0.77` to `0.0.78`. | Keep `frontend/package.json` and `frontend/bun.lock` at `12.11.1`. No code migration required. |

Context reviewed from the immediately preceding minor:

| Step | From | To | SemVer class or non-SemVer scale | Source | Migration/breakage | Action |
|---|---:|---:|---|---|---|---|
| Context | 12.10.2 | 12.11.0 | minor | GitHub release, package registry | No breaking migration noted. Adds `autoPanOnSelection`, improves type coverage, and fixes several drag, resize, and store-updater behaviors. | Confirm installed `12.11.1` already defaults `autoPanOnSelection` to `true`; no repo prop needed. |

## Consolidated upgrade actions
Priority: majors, announcements, migration guides, and codemods; then minors; then patches and security releases.

API changes:
- `autoPanOnSelection` is available on `ReactFlow` and defaults to `true` in installed `@xyflow/react@12.11.1`; Querylane does not need to pass a redundant prop.
- Installed React Flow nodes already carry `ariaLabel` through to the node DOM; Querylane can supply useful labels for better canvas accessibility.

Syntax and style-guide changes:
- None.

Behavior and configuration changes:
- Selection dragging can already pan the canvas near viewport edges by default in `12.11.1`.
- Node labels improve screen-reader and test-visible semantics.

Repository actions before target install:
- None. Target was already installed and locked.

## Dependency tree
Target: `@xyflow/react@12.11.1`
Parents: direct dependency from `frontend/package.json`
Children: `@xyflow/system@0.0.78`, `classcat`, `zustand`
Repository dependents: `frontend/src/features/database-visualization/flow-canvas.tsx`
Peers: `react`, `react-dom`, optional `@types/react`, optional `@types/react-dom`
Plugins and adapters: none

## Non-SemVer scale
Release cadence: normal patch cadence
Change volume: low
Diff size: low
API churn: low
Effort: low
Danger and blast radius: low, limited to React Flow canvas accessibility

## Security notes
| Advisory | Source | Reachability and exploitability | Fixed version | Decision |
|---|---|---|---|---|
| None for `@xyflow/react` in `bun audit` output | `bun audit --cwd frontend --json` | Not applicable | Not applicable | Proceed. Existing audit findings are unrelated packages: `js-yaml`, `tmp`, `uuid`. |

## Risk gate
Decision: apply now
Reason: patch target, clear release notes, peers unchanged, target older than 7 days as of 2026-07-06, and package was already locked.
Explicit approval: user requested the upgrade and UX verification.

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
Tests: RED then GREEN `bun run --cwd frontend test:integration -- flow-canvas.integration.test.tsx` passed
Build, vet, and security scan: `bun run --cwd frontend doctor:changed` passed; `bun audit --cwd frontend --json` found no `@xyflow/react` advisories; unrelated existing advisories remain in `js-yaml`, `tmp`, and `uuid`
