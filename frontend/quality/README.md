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

`quality:gate` runs full lint, full React Doctor, both compilers, the production build and bundle budgets, unit tests, and integration tests. CI also checks draft PRs. `quality:changed` keeps incremental Doctor/tests for local feedback; lint always checks the full frontend.

Generate visual baselines only in the matching Linux Playwright image, review changes, then require the normal PR visual run to pass. Ordinary PR runs never update snapshots. E2E pixel assertions also use the canonical Linux image: `bash scripts/playwright-container.sh bun run test:e2e:ci`. Native macOS/Windows font rendering is not a substitute. Local Playwright refuses to reuse an existing server; set a free `PLAYWRIGHT_PORT` for parallel workspaces instead of testing an unidentified preview.

```text
Owned files -> Biome + typed Oxlint + shadcn + suppression guard
           -> React Doctor + tsrs + TypeScript nightly
           -> production build + tests + browser checks
```

## Tool ownership

Versions are pinned in [package.json](../package.json), its lockfile, and [the inventory](rule-inventory.json).

| Tool | Contract |
| --- | --- |
| Bun | Installation, scripts, lockfile integrity. CI and Docker use the same pin; `bun.lock` is the only maintained lockfile. |
| Biome / Ultracite | Formatting, syntax, accessibility, test discipline, imports, complexity, and browser boundaries. |
| Oxlint / tsrs-lint | All native categories, actual TypeScript unsafe-flow checks, React Compiler rules, and fatal warnings. |
| shadcn lint | Token colors, known utilities, component styling, static classes, and inline-style contracts. |
| React Doctor | Full-project selected security, bugs, accessibility, performance and graph checks. Test/story/design findings block. Retired/capability-gated IDs and fail-open Socket coverage are not counted as complete enforcement. |
| tsrs / TypeScript | Native checking plus the independently pinned 7.1 nightly, including scripts and public JS. |
| React Scan | Existing opt-in development mode: `bun run dev:scan`. Production builds reject Scan; bundle checks reject emitted Scan/bippy instrumentation. |
| Blume | Builds the docs; deployment contains emitted SSR and its checked production dependency closure, not the framework's CLI/deploy tools. |

Build-only Tailwind and the router plugin are devDependencies. Both TanStack devtools and the type-only Standard Schema re-export remain dependencies because the unchanged source-dependency rule requires their application-source imports there. This classification does not include devtools in production or add runtime code for erased types.

Biome's formatting settings are materialized from Ultracite. Its configuration explicitly extends `ultracite/biome/playwright` and restores `noEmptyPattern` for tests instead of accepting the preset's fixture waiver. Oxlint copies preset rules, not preset overrides. Upstream test/declaration waivers and broad generated-file globs cannot silently weaken coverage.

## Reviewed rule policy

The inventory records each installed Biome, native Oxlint, Doctor, shadcn and project-plugin rule. The inventory guard inside `bun run lint` rejects unreviewed catalog changes, duplicates, changed pins, severity drift, and narrowed file-role scopes. Every delegated decision names an enforced owner: another error rule, a compiler option, a Biome assist, or its formatter. Recorded global disabled levels cannot silently change or fall back to inherited defaults. The gate also compares every installed Playwright preset rule with the explicit project errors. Disabled Biome linting and Doctor rule/tag/per-file suppression lists fail the gate. Review new rules individually on upgrade. Keep an error unless another tool owns the same contract, the framework does not apply, or a concrete false positive changes valid behavior.

[Configuration boundaries](../scripts/quality-boundaries.ts) run before tool catalogs. They reject hidden overrides, broadened waiver roles, authored-source exclusions, disabled engines, and unreviewed preset inheritance. The inventory's `overrideExceptions` records only the existing Node, test, route, and primitive-author roles; it adds no new waivers. Biome keeps the explicit Playwright preset, while Oxlint presets remain materialized without inherited overrides.

The gate inspects all six compiler projects through the real `tsc --showConfig`. Both local and inherited include/exclude settings must retain source coverage. Effective strict options, unchecked indexing, exact optional properties, and checked public JavaScript cannot be weakened in a child configuration. This protects the configuration used by both compiler runs, not just the shared base file.

[Reviewed rule options and entrypoints](rule-options.json) are compared by the executable inventory gate. To review a change, run `bun scripts/quality-options.ts` from `frontend`, compare its JSON with the snapshot, and update both policy and regressions deliberately. This includes script bodies, not just labels. Installed versions and real plugin identity are checked. Biome warnings, including file-size skips, are fatal. YAML/SCSS/GraphQL suppressions are also rejected.

Authored declaration roots have a separate `skipLibCheck:false` role, including `env.d.ts` which same-stem `env.ts` shadows during normal discovery. The live guard rejects new authored declaration files absent from that role, preventing the same coverage hole from returning. Global dependency declarations still need `skipLibCheck:true` because the pinned third-party graph has reproducible errors. Typed lint uses the root project; six independent compiler roles retain their own environment contracts. Doctor does not adopt this TypeScript Oxlint config or detect the Rsbuild compiler; the standalone typed invocation is mandatory. The retired Doctor memoization rule is replaced by the scope-aware project plugin.

The canonical Playwright container owns its dependency and `dist` volumes. A concurrent host build cannot replace its visual harness or lazy chunks. Reports and source snapshots still reach the host checkout; ordinary verification never regenerates baselines.

[Ultracite 8.1](https://github.com/haydenbleasel/ultracite/pull/857) and [Biome 2.6.3](https://biomejs.dev/internals/changelog/version/2-6-3/) replace the temporary Tailwind compatibility patch. The inventory reviews all 33 new Biome rules: 18 are errors, one unsafe-return check belongs to typed Oxlint, and 14 are framework-inapplicable or reject valid project contracts. Oxlint 1.90 adds the fatal `no-unsafe-enum-assignment` check; protobuf defaults and fixtures use named enum members rather than numeric literals.

[Biome 2.6.4](https://github.com/biomejs/biome/releases/tag/%40biomejs%2Fbiome%402.6.4) adds 30 more rules. Seven are explicit errors: `noConsoleSpaces`, `noMagicArrayFlatDepth`, `noReturnArrayPush`, `noUnreadableIife`, `noUselessRecursion`, `noYamlBooleanKeys`, and `useWhileLoopCondition`. They reject ambiguous mutation results, avoidable tail-recursion stack growth, hidden loop conditions, unexplained flattening depths, unreadable immediate expressions, duplicate console spacing, and boolean YAML keys. CLI regressions pair rejected examples with valid alternatives; deliberate flattening depths and quoted YAML keys remain supported.

The other 23 additions stay off: 22 require unused Vue or Svelte frameworks, and `noNull` would replace valid DOM, React-ref, and external JSON/RPC sentinels with a different value. A positive nullable-contract probe protects that decision. This patch does not change Markdown ownership or re-enable its formatter. No rule waivers, authored-source exclusions, or production bundle-cap increases accompany the patch.

Tailwind sorting reads the project stylesheet and recognizes merge functions plus `cva`/`tv` variant objects. Sorting classes requires an explicit unsafe fix. YAML and SCSS use Biome's formatter when present. Markdown formatting remains disabled because Biome 2.6.3 can change whitespace around inline code; Blume owns documentation. Querylane does not use Astro, React Native, Drizzle, or GraphQL, so their presets and GraphQL selection-set sorting are not enabled.

The CLI regression tests exercise `ultracite fix --hook` with missing, malformed, empty, and valid path payloads. Invalid payloads leave all files unchanged; a valid payload formats only its named file. The tests also exercise Tailwind variant sorting through the actual Biome binary.

The frontend requires Node 26.13 or later. Development, frontend CI, release CI, and the canonical Playwright runner use Node 26.13.0 LTS; Bun remains pinned to 1.4.4. Axe 4.14 checks visible labels against accessible names; text buttons use their visible content instead of conflicting overrides, and action hints use descriptions. Generated browser reports are excluded from Doctor scans, not authored source. Changesets 3 uses `changeset git-tag`; private-package versioning and tagging stay explicit. Rsdoctor 2 consolidates the plugin into `@rsdoctor/core` and the shared types into `@rsdoctor/shared/types`. React Flow attribution remains visible, avoiding the new upstream warning about unlicensed attribution removal.

[Ultracite 8.1.1](https://www.ultracite.ai/changelog/ultracite-8-1-1) and [Oxlint 1.91](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.91.0) retain the reviewed Biome and native rule catalogs. React Doctor 0.9.22 adds the reviewed `forwarded-set-state-in-effect` bridge to its React Compiler checks. Doctor still does not detect this project's Rsbuild compiler configuration, as in 0.9.18, so that bridge remains capability-gated; Oxlint continues to enforce compiler rules. Shadcn lint 0.2.5 fixes resolution without adding rules. The native compiler moves to tsrs 0.21 while retaining its TypeScript 7.1 beta source; the independent TypeScript nightly remains on the 7.1 channel. Rstest 0.12.6 retains happy-dom 21, and Rsbuild/Rspack move together to 2.3.1. No quality waivers accompany this refresh. The approved core gzip cap is 1045 KiB; every other bundle and latency cap is unchanged.

[Oxlint 1.94](https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.94.0) retains the reviewed native rule catalog. All recommended `oxc` rules remain errors, with the newly recommended `misrefactored-assign-op` and `no-this-in-exported-function` made explicit. Typed lint now uses the existing `tsrs` package's `tsrs-lint` launcher through Oxlint's native discovery; the separate `oxlint-tsgolint` dependency is removed. Both compiler entrypoints and the TypeScript nightly canary are unchanged. SQL validation uses a separate rejection handler to satisfy the improved `promise/prefer-catch` check while retaining unknown results on failed checks.

[React Doctor 0.9.23](https://github.com/millionco/react-doctor/releases/tag/react-doctor%400.9.23) updates both the CLI and its bundled `oxlint-plugin-react-doctor` to 0.9.23 without changing the reviewed rule catalog. It improves async timer cleanup detection, compiler-aware Table v9 analysis, explicit opt-in security scans, and false-positive handling. Existing full-project scans, fatal warnings, rule decisions, and coverage boundaries stay intact. Biome remains the sole formatter; no formatting tool is added.

[Ultracite 8.2.1](https://github.com/haydenbleasel/ultracite/releases/tag/ultracite%408.2.1) fixes CLI initialization and configuration validation without a package patch. Explicit Oxlint settings preserve the reviewed unused-variable, warning-comment and custom-component ARIA checks instead of inheriting new preset exceptions. The rule-option snapshot, severities and source coverage remain unchanged. Its published `deepmerge` dependency still uses the scoped hardening adapter; a parent upgrade alone does not retire that exception.

Some deliberate decisions:

- React Compiler owns memoization. Do not introduce manual memoization solely to satisfy duplicate allocation heuristics.
- Type-aware Oxlint owns unsafe assertions. Biome's duplicate has less compiler context.
- Strict inference preserves generic/literal contracts. Redundant annotations are not a substitute for checked boundaries.
- PostgreSQL `UTF8` identifiers are not Node encoding aliases. The generic encoding fixer changes valid values.
- DOM capability probes remain valid even when ambient types declare an API as always present.
- Router redirects are documented control-flow sentinels, not application errors.
- The native void rule rejects valid generic calls. Biome still checks confusing void types.
- Biome's leaked-render rule rejects safe string-valued ternaries. Typed boolean checks still reject unsafe conditions.
- Biome 2.6.5 fixes the old shorthand `divide-y` regression; shorthand enforcement is enabled and protects valid `divide-y`.
- Explicit undefined returns preserve typed optional-value and Promise callback contracts. The conflicting undefined-return style fixer remains off.
- Secret patterns remain enabled. The global entropy threshold is 50 because long selectors and Tailwind variants are not credentials. Deliberate test credentials are fixture data, not shipped secrets. See [Biome's documented entropy tuning](https://biomejs.dev/linter/rules/no-secrets/javascript/#entropythreshold).

The exact thresholds and options live in the configurations, not this document. Syntax bans that contradict supported JavaScript, React composition, or externally defined callback signatures are not enabled merely to increase the count.

### Pure value contracts

Pure transformations in `src/lib/domain/**/*.ts` enforce three additional Oxlint errors: `prefer-readonly-parameter-types`, `explicit-module-boundary-types`, and `no-unnecessary-condition`. The selection and AIP filter helpers live there with their tests. The existing `src/lib/pagination.ts` API receives the same checks without changing vendored UI imports. Inputs are readonly; generic resource results retain their inferred caller types. Exported functions declare return contracts, while implementation-local inference stays available.

Browser, persistence, and RPC adapters stay outside that pure role. They retain runtime capability checks and mutable resource handles. This scope adds checks; it does not exclude adapters from the existing strict toolchain.

The pure role also rejects static imports from stateful application modules and UI/state frameworks, relative parent escapes, and ambient browser/resource globals, including namespace aliases. Direct domain imports, shared value guards, and erased adapter type imports remain valid. These are dependency rules, not a proof of mathematical purity.

Biome's `noComponentHookFactories` is a global error. Component mocks now have module-level identities. Hook tests use a module-level provider component with per-test render callbacks and query clients, preserving isolation and cleanup.

Real CLI regressions reject mutable pure inputs, missing exported return contracts, impossible conditions, nested component definitions, missing Playwright awaits, brittle waits, and empty fixture patterns. Valid transformations, condition-based assertions, and runtime capability guards pass. Repeated Biome and Oxlint fixes converge on the same source.

Hook regressions also cover non-string paths, missing files, the repository root, symlinks escaping the project, non-edit tools, and Codex patch payloads. Valid edits format only the named file; unrelated and external files remain unchanged.

`bun run test:integration:leaks` stays diagnostic-only, as [Rstest recommends](https://rstest.rs/config/test/detect-async-leaks). A local diagnostic run reports active `MESSAGEPORT` resources after some tests; their origin is not established. Do not suppress those reports or describe that diagnostic run as passing. Normal integration assertions and cleanup checks remain required.

## Coverage boundaries

- No app, protobuf-form implementation, test, script, or E2E directory has a blanket quality exclusion.
- Generated protobuf/route files are generator-owned. Do not edit them manually.
- shadcn/ui (`base-vega`) and Tailwind supply the design-system starting point. `components.json` configures the pinned development CLI and Protoform registry; use `bun run registry:preview <item>` before importing. Review and merge upstream changes instead of overwriting existing components. The app keeps its Tailwind tokens and UI SDK-compatible variants in `src/index.css`.
- `src/components/ui` and `src/components/querylane-ui` are locally maintained. Base UI owns standard control interaction, and UI SDK adds agent adapters and specialized behaviors. Both directories receive full lint, Doctor, and compiler checks. CI checks the Base UI foundation and SDK pins without requiring byte-for-byte registry sync.
- Owned primitives define appearance. Their consumers cannot restyle them. Primitives still get raw-color, utility, inline-style, type, and correctness checks.
- Node tooling can use Node APIs and CLI output. Browser source cannot. Test fixtures can contain representative numeric values and test credentials. These are file-role contracts, not one-off file waivers.
- Artifact/dependency directories are not source. The suppression guard rejects reserved artifact directories nested inside authored paths, source symlinks, nested quality configurations, ignore files, and generated-looking authored filenames.
- The guard rejects type-checker, linter, formatter, coverage, and compiler opt-out directives. Generated protobuf directives are generator-owned.

No repository can make its own configuration immutable. A contributor can edit a gate or its inventory. Protect required CI checks and policy changes with repository-admin branch rules and review. Local flags and hooks are not security boundaries.

## Compatibility and security

The current frontend refresh aligns direct runtime dependencies and their coupled packages. It retains the separately pinned TypeScript canary rather than downgrading it to the stable compiler tag. Run `bun outdated` to inspect remaining direct updates.

`bun audit --production --json` returns an empty report for the frontend graph. Google RPC details and field-behavior annotations now use the existing local generated schemas; the unaudited remote Google APIs package and its Buf npm registry configuration are removed. Package advisory coverage is not a complete source-security review.

The full frontend development audit is also clean. Supported Sentry/ESLint graph updates remove affected glob/minimatch versions. Version-qualified overrides move get-uri's FTP consumer to basic-ftp 6.2.6 and ts-morph's matcher to minimatch 11.0.8 after real-consumer compatibility and adverse-input tests. Three pinned shadcn/Ultracite consumers use the bounded, Fastify-backed [configuration-merge adapter](../scripts/config-merge) for returned-prototype hardening. The [CNA rejected CVE-2026-93753](https://github.com/CVEProject/cvelistV5/blob/main/cves/2026/93xxx/CVE-2026-93753.json), but npm and GitHub still report its advisory; do not describe it as an undisputed vulnerability. `scripts/dependency-consumers.unit.test.ts` exercises the real CLI/registry, matching, prototype protection and loopback FTP paths. No audit suppressions are added.

The frontend uses no package patch files. Upgrade supported parents first and remove an exception when their published dependencies satisfy the tested contract; do not substitute install-time source rewriting. The merge adapter supports the pinned consumers' merge, `all` and array-replacement calls, cloning and enumerable symbols, rejects prototype keys, and fails closed for unsupported options. Copy it before Docker dependency installation; after editing it, refresh installed copies with `bun install --frozen-lockfile --force` and replay the consumer tests. Basic-ftp 6 rejects separate passive-transfer hosts; normal same-host FTP/PAC remains supported.

Rstest 0.12.6 still declares optional happy-dom `^20.8.3`; the tested 21.0.4 remains installed rather than downgrading the DOM implementation to satisfy that stale range. Deprecated transitive packages retained by current parents are not replaced through incompatible API aliases. Reproduce audits with `bun audit --json` and inspect ownership with `bun why <package>`.

Run the root full audit separately for the docs build graph; its direct dependencies are dev-classified, so a production-only audit omits those tools. The supported Vercel adapter refresh removes nested vulnerable Zod. Version-qualified parent overrides select patched `path-to-regexp` 6.3.0 and `postcss-selector-parser` 6.1.5; real route/typography consumers and adverse inputs are covered by `scripts/docs-dependencies.test.ts`. The full root audit is clean. Custom routing regular expressions still require their own safety review.

`bun run docs:package` assembles a fresh `.build/docs-runtime` from emitted server imports and their production dependencies, including installed optional dependencies, assets and license notices. An explicit output argument selects another fresh directory. Unselected optional peer integrations are excluded; selecting a new provider requires replaying the packaged runtime checks. `Dockerfile.docs` builds for the target platform and verifies Node 24 from `/runtime`, outside the build install, before copying only that closure to the nonroot final image. `DOCS_RUNTIME_ROOT` selects an isolated artifact for `docs:test:runtime`; use a directory without ancestor `node_modules` when verifying locally.

The Bun patch for MIT-licensed Blume 2.2.7 synchronizes native form values when its lazy playground client initializes, preserving edits made before the download finishes. `frontend/e2e/docs/reader.spec.ts` delays that download to verify recovery. The docs builder consumes the pinned patch; the packaged artifact retains the modified output and notices. Remove it when an upstream release passes that regression; use `bun patch blume` and `bun patch --commit node_modules/blume` to regenerate it rather than editing installed cache files.

Keep untrusted archives, proxy configuration and project input outside these build tools' trust boundary. Scoped security migrations require real-consumer compatibility and adverse-input evidence; a clean advisory report alone does not establish source security. No advisory is suppressed in the audit command.

The approved dependency refresh raises the core gzip cap from 1027 to 1043 KiB, the lazy SQL editor cap from 203 to 205 KiB, and the deferred explorer-click payload cap from 160 to 164 KiB. Paired Bun 1.4.4 builds measured core at 1025.9 → 1040.7 KiB and the SQL editor at 199.3 → 203.5 KiB. On current main, the subsequent refresh measures 1043.3 KiB core gzip on macOS and Linux CI with Bun 1.4.4; its approved core cap is 1045 KiB. Initial-load, largest-async, and latency limits are unchanged. See the measured rationale beside the constants in [check-bundle-budget.ts](../scripts/check-bundle-budget.ts).

### Approved Base UI + UI SDK allowance

PR #417 keeps Base UI 1.9.0 as the standard-control foundation and UI SDK as its enhancement layer. The user approved retaining both libraries and documenting their cost. With Bun 1.4.4, the SDK-only head measured **1046.6 KiB core / 348.3 KiB initial gzip**; the restored, deduplicated architecture with SDK beta.5 measured **1086.5 KiB core / 368.9 KiB initial gzip**. Grouping Base UI into the existing UI-vendor chunk reduced the first restored build's core size from **1104.0 to 1086.4 KiB**; subsequent adapter safety/provenance coverage brought the beta.5 build to 1086.5 KiB. These are bundle measurements, not a runtime-speed claim.

The approved core cap is **1100 KiB**, up from 1090, to account for the SDK Token Input used by Data Explorer list filters. The paired Bun 1.4.4 builds measured **1089.3 → 1099.1 KiB core gzip**. Deferred agent tools remain 15.6 KiB gzip. Initial-load, individual async, SQL editor, optional agent-tools, Data Explorer payload, and latency caps are unchanged. Eager adapters are still core; no modules were reclassified as optional to pass the cap. Deterministic multi-chunk fixtures target measured gzip bytes rather than platform-sensitive raw lengths and exercise the real checker: a core payload inside the new allowance passes, while a payload beyond it still fails. The optional agent-tools boundary and its separate 20 KiB cap remain independently tested.

Compiler regressions exercise both real binaries: valid CSS variables pass, invalid CSS properties fail, and unchecked indexing/exact optional violations fail. Guard tests exercise actual filesystem bypasses. Rule-inventory tests invoke the actual CLI with downgraded configurations: turning a recorded error off or into a warning, disabling Biome, or adding a Doctor ignore cannot silently pass the review gate.

Use the `checkAccessibility` Playwright fixture for startup, onboarding, explorer, workbench, and mobile-navigation journeys. It owns the full-page scan, fatal assertions for every impact, and full JSON attachments. It does not expose builder methods for filtering rules, excluding nodes, or limiting scans to a component. The scans include WCAG 2.0/2.1/2.2 A/AA and axe's stable best-practice rules. Reports retain passes, inapplicable checks, and incomplete items for review. A passing automated scan is not a claim of complete accessibility or manual assistive-technology coverage. See [Playwright's accessibility guidance](https://playwright.dev/docs/accessibility-testing) and [axe's rule/result semantics](https://www.deque.com/axe/core-documentation/api-documentation/).

E2E's unmocked-request guard recognizes Connect POSTs by their protocol header, including same-origin proxies and protobuf requests. It does not rely only on a separate backend origin. Missing RPC fixtures fail the test instead of silently reaching the preview server. See [Connect's request-header contract](https://connectrpc.com/docs/protocol/#unary-request).

## Required CI check

`Frontend Quality Gate` always reports on PRs to main, including drafts. Change detection uses the full NUL-delimited Git diff, not GitHub's path-filter file limit. UI, root-file, or shared quality-policy changes require every frontend job (including every visual shard) to succeed. Every UI run uses the full unit, integration, browser, and E2E suites. E2E runs serially in the pinned Playwright image so latency budgets do not measure worker contention and screenshots use canonical fonts; changed-only aliases are local feedback tools. Non-UI changes skip those jobs but must still pass change detection and the aggregate gate. Missing, cancelled, failed, or malformed results cannot pass.

The gate is safe to require repository-wide **after this workflow reaches main**. Requiring the new name while it exists only in this draft would strand unrelated PRs running the old workflow. Keep the existing zero-approval policy; do not invent human reviewers. Enforce resolved conversations, no administrator bypass, no force pushes, and no branch deletion with repository rules. A draft is not approval or merge authorization.

GitHub's documented dependency-graph ecosystems do not include Bun lockfiles. The authenticated graph-comparison endpoint returned 403 during delivery, despite enabled vulnerability alerts. No dependency-review job is installed that could report success without inspecting the Bun graph. Bun audit remains the package-advisory check; full dependency-review coverage is not claimed. See [GitHub's supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/dependency-graph-supported-package-ecosystems).

### Biome 2.6.5

The installed schema exposes 755 rules: 85 additions relative to our 2.6.4 inventory (the release announcement lists 84). All additions have explicit decisions: 22 errors, three delegated checks, and 60 inapplicable rules. The disabled additions comprise 58 Vue/Svelte checks, `noMapSpread` (immutable copies remain intentional), and `noSyncMethods` (one-shot tooling intentionally uses synchronous setup). Existing Biome/Oxlint errors own array iteration, computed deletion, and redundant assertions.

New errors cover promise concurrency, event cancellation and cleanup, map keys, missing throws, reference comparisons, unnecessary await/length/trim operations, accessor pairs, object construction, set sizes, invalid CSS/SCSS, Tailwind variable shorthand, and TanStack Query data, client lifetime and inference-sensitive option order. Query callbacks precede pagination callbacks; shorthand classes generate the same CSS.

### Biome 2.6.6

[Biome 2.6.6](https://github.com/biomejs/biome/releases/tag/%40biomejs/biome%402.6.6) fixes rule-index overflow in groups exceeding 256 rules. Normal Biome selection now passes the existing CLI rejection/acceptance probes without the supplemental `--only` pass, so that workaround is removed. The probes intentionally exercise the ordinary lint entrypoint to catch selection regressions.

All 12 additions have explicit decisions in the inventory (767 rules total). Nine are errors: `noArrayMethodsOnArguments`, `noConstantComparisons`, `noErasingOperation`, `noNegatedArrayPredicate`, `noNumberArgumentOutOfRange`, `noSharedBranchCode`, `noSubtractionComparison`, `noUninvokedArrayCallback`, and `usePackageJsonEngines`. The Svelte and Next.js checks do not apply; `usePackageJsonCpu` stays off because the private frontend has no CPU restriction. Real CLI probes reject violations and accept valid alternatives, including an engines-bearing manifest without CPU restrictions. No new file exclusions, per-file waivers, or bundle-cap changes accompany this patch. `noBaseToString` continues to delegate to typed Oxlint because Biome reports a correctly narrowed clipboard string as an object.

Tailwind shorthand enforcement from main remains enabled; the actual unsafe-fix regression also preserves `divide-y` byte-for-byte. The full lint checks authored files regardless of their Git status. The suppression guard includes `.yaml` and `.yml`, preventing YAML directives from silently disabling the reviewed rules. Real Git and filesystem regressions protect these local enforcement paths; the full quality gate remains the delivery check.

### Biome 2.6.7 and full-catalog review

[Biome 2.6.7](https://biomejs.dev/internals/changelog/version/2-6-7/) has 791 reviewed rules. Review covers the entire catalog, not only the 24 additions. Applicable rules are fatal; unused frameworks, unsupported browser APIs, contract-changing style bans, and reproduced false positives remain explicit inventory decisions. Duplicate type-sensitive rules delegate to the already-fatal typed Oxlint checks, rather than asking two inference engines to disagree about imported/RPC types. Shadcn owns Tailwind utility validation.

There are only two lint commands: `bun run lint` checks inventory, Biome, typed Oxlint/shadcn, and suppressions; `bun run lint:fix` applies safe fixes and runs that same full check. Separate engine/import/changed lint aliases and duplicate formatting aliases are removed. `quality:gate` remains the delivery command, including Doctor, types, build, and tests.

The frontend is now the Biome project root. The former repository-level wrapper and nested `root: false` config prevented project/type rules from activating normally. Ordinary Biome now checks default imports and the rest of the applicable catalog in one pass—no `--only` import workaround. Root configuration and JavaScript import-validation scope are guarded against drift. Existing authored-file coverage, compiler flags, and bundle limits are unchanged.

The review also enables the older `noUnreadableForOfExpression` rule; compound iterable expressions get descriptive locals. Explicit known switch cases remain because removing them conflicts with typed exhaustiveness enforcement, even when they share a default fallback for unknown protobuf values. Existing Tailwind class sorting is applied consistently now that its project scan runs. CLI probes reject violations and accept supported alternatives.

Native disabled controls, nullable DOM/RPC values, external callback vocabulary, and independent post-await lifecycle writes remain valid. TypeScript Bundler resolution intentionally permits extensionless imports. Runtime CSS variables and generated/dynamic CSS classes are not constrained by a closed stylesheet-declaration graph. No new source exclusions, per-file waivers, or custom plugins accompany this Biome update.

### Cloudflare Oxlint preset (initial adoption)

[Cloudflare's Oxlint preset](https://github.com/cloudflare/oxlint-config) provides the
`quality` plugin from nkzw. Querylane enables four reviewed errors: chained type
assertions, widening a known value and then casting it back, aliases that hide
`unknown`, and per-iteration copies of a growing reducer accumulator. Explicit
`unknown` at external input boundaries is still allowed. The real Oxlint CLI
regressions exercise each rule with rejected and accepted examples.

The preset's categories, native rule options, other plugins, overrides, and ignores
are not inherited. A trial of all preset rules flagged valid Querylane contracts such as
unparsed RPC/JSON boundary values, runtime guards, and optional property construction.
The existing checks and file coverage still apply. Oxlint stays on 1.94; tsrs moves
to 0.25.0-ts7.1.0-beta to satisfy the preset's peer minimum. The separate TypeScript
nightly cross-check is unchanged.
