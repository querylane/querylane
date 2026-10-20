# Strict UI checks

Owned UI code, tooling, public JavaScript, tests, and E2E fixtures share fatal lint and compiler checks. Fix violations rather than hiding files or adding directives. Conflicting, inaccurate, and framework-inapplicable rules have explicit decisions in [the rule inventory](rule-inventory.json).

## Run before delivery

```sh
cd frontend
bun install --frozen-lockfile
bun run lint:fix
bun run quality:gate
bun run test:browser
bun run test:e2e
```

`quality:gate` runs full lint, full React Doctor, both compilers, the production build and bundle budgets, unit tests, and integration tests. CI also checks draft PRs. Changed-only commands remain local feedback tools, not the final gate.

Generate visual baselines only in the matching Linux Playwright image, review changes, then require the normal PR visual run to pass. Ordinary PR runs never update snapshots.

```text
Owned files -> Biome + typed Oxlint + shadcn + suppression guard
           -> React Doctor + tsrs + TypeScript nightly
           -> production build + tests + browser checks
```

## Tool ownership

Versions are pinned in [package.json](../package.json), its lockfile, and [the inventory](rule-inventory.json).

| Tool | Contract |
| --- | --- |
| Bun | Installation, scripts, lockfile integrity. CI and Docker use the same pin. |
| Biome / Ultracite | Formatting, syntax, accessibility, test discipline, imports, complexity, and browser boundaries. |
| Oxlint / tsgolint | All native categories, actual TypeScript unsafe-flow checks, React Compiler rules, and fatal warnings. |
| shadcn lint | Token colors, known utilities, component styling, static classes, and inline-style contracts. |
| React Doctor | Full-project security, bugs, accessibility, performance, maintainability, and supply-chain checks. |
| tsrs / TypeScript | Native checking plus the independently pinned 7.1 nightly, including scripts and public JS. |
| React Scan | Existing opt-in development mode: `bun run dev:scan`. Production builds reject Scan. |
| Blume | Root documentation-tool dependency, upgraded without changing UI runtime behavior. |

Biome's formatting settings are materialized from Ultracite. Oxlint copies preset rules, not preset overrides. This prevents upstream test/declaration waivers and broad generated-file globs from silently weakening coverage.

## Reviewed rule policy

The inventory records each installed Biome, native Oxlint, Doctor, and shadcn rule. `bun run quality:rules` rejects an unreviewed catalog addition/removal, duplicate entries, a changed tool pin, or a native rule recorded as an error but disabled in the effective configuration. Review new rules individually on upgrade. Keep an error unless another tool owns the same contract, the framework does not apply, or a concrete false positive changes valid behavior.

Some deliberate decisions:

- React Compiler owns memoization. Do not introduce manual memoization solely to satisfy duplicate allocation heuristics.
- Type-aware Oxlint owns unsafe assertions. Biome's duplicate has less compiler context.
- Strict inference preserves generic/literal contracts. Redundant annotations are not a substitute for checked boundaries.
- PostgreSQL `UTF8` identifiers are not Node encoding aliases. The generic encoding fixer changes valid values.
- DOM capability probes remain valid even when ambient types declare an API as always present.
- Router redirects are documented control-flow sentinels, not application errors.
- The native void rule rejects valid generic calls. Biome still checks confusing void types.
- Biome's leaked-render rule rejects safe string-valued ternaries. Typed boolean checks still reject unsafe conditions.
- Biome's Tailwind shorthand fixer produces invalid `divide` from valid `divide-y`. Shadcn still validates utilities.
- Secret patterns remain enabled. The global entropy threshold is 50 because long selectors and Tailwind variants are not credentials. Deliberate test credentials are fixture data, not shipped secrets. See [Biome's documented entropy tuning](https://biomejs.dev/linter/rules/no-secrets/javascript/#entropythreshold).

The exact thresholds and options live in the configurations, not this document. Syntax bans that contradict supported JavaScript, React composition, or externally defined callback signatures are not enabled merely to increase the count.

## Coverage boundaries

- No app, protobuf-form implementation, test, script, or E2E directory has a blanket quality exclusion.
- Generated protobuf/route files are generator-owned. Do not edit them manually.
- `src/components/ui` is vendored registry output. Its source is strictly typechecked and CI verifies registry sync. Put owned variants in `src/components/querylane-ui`, not the registry directory.
- Owned primitives define appearance. Their consumers cannot restyle them. Primitives still get raw-color, utility, inline-style, type, and correctness checks.
- Node tooling can use Node APIs and CLI output. Browser source cannot. Test fixtures can contain representative numeric values and test credentials. These are file-role contracts, not one-off file waivers.
- Artifact/dependency directories are not source. The suppression guard rejects reserved artifact directories nested inside authored paths, source symlinks, nested quality configurations, ignore files, and generated-looking authored filenames.
- The guard rejects type-checker, linter, formatter, coverage, and compiler opt-out directives. Generated protobuf directives are generator-owned.

No repository can make its own configuration immutable. A contributor can edit a gate or its inventory. Protect required CI checks and policy changes with repository-admin branch rules and review. Local flags and hooks are not security boundaries.

## Compatibility and security

The compatible transitive refresh removed reported production advisories. `bun audit --production --json` returned an empty report during verification. The refresh exposed duplicate CodeMirror singleton packages and mismatched Connect Query transport-key identities. The direct CodeMirror/Lezer and Connect Query/core pins were aligned and verified with a clean frozen install, mutation-cache integration tests, and real browser tests.

Bun's audit request to the Buf package registry returned 404, so the generated Google APIs package was not audited. An empty report is not complete vulnerability coverage.

Development-only advisories remain in Lighthouse/Changesets dependency chains. Do not treat a clean production audit or Doctor scan as a clean development audit. Reproduce with `bun audit --json` and inspect parents with `bun why <package>`.

| Dependency | Remaining constraint |
| --- | --- |
| `basic-ftp` | Lighthouse's proxy chain requires the older major. |
| `braces` | The installed/current 3.x release still has a reported advisory. |
| `extract-zip` | The current release still has reported archive-extraction advisories. |
| `sprintf-js` | Legacy YAML tooling constrains an older minor. |
| `tmp` | Lighthouse and its editor integration constrain older minors. |
| `uuid` | Lighthouse constrains an older major. |

These tools must not process untrusted archives, proxy configuration, or project input. Cross-major overrides without parent compatibility evidence are not a safe fix. No advisory is suppressed in the audit command.

The core/SQL bundle caps include the measured cost of boundary validation and the compatible editor refresh. Initial payload and largest-async limits are unchanged. See the measured rationale beside the constants in [check-bundle-budget.ts](../scripts/check-bundle-budget.ts).

Compiler regressions exercise both real binaries: valid CSS variables pass, invalid CSS properties fail, and unchecked indexing/exact optional violations fail. Guard tests exercise actual filesystem bypasses. Rule-inventory tests prove a newly introduced rule cannot silently pass the review gate.

## Required CI check

`Frontend Quality Gate` always reports on PRs to main, including drafts. Change detection uses the full NUL-delimited Git diff, not GitHub's path-filter file limit. UI or shared quality-policy changes require every frontend job (including every visual shard) to succeed. Non-UI changes skip those jobs but must still pass change detection and the aggregate gate. Missing, cancelled, failed, or malformed results cannot pass.

The gate is safe to require repository-wide **after this workflow reaches main**. Requiring the new name while it exists only in this draft would strand unrelated PRs running the old workflow. Keep the existing zero-approval policy; do not invent human reviewers. Enforce resolved conversations, no administrator bypass, no force pushes, and no branch deletion with repository rules. A draft is not approval or merge authorization.

GitHub's documented dependency-graph ecosystems do not include Bun lockfiles. The authenticated graph-comparison endpoint returned 403 during delivery, despite enabled vulnerability alerts. No dependency-review job is installed that could report success without inspecting the Bun graph. Bun audit and its Buf-registry coverage limitation above remain explicit; full dependency-review coverage is not claimed. See [GitHub's supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/dependency-graph-supported-package-ecosystems).
