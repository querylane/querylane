# Dependency patches

## turbo-dom 0.8.6

`@miaskiewicz%2Fturbo-dom@0.8.6.patch` changes the MIT-licensed upstream
`src/runtime/dom.mjs` from
[`@miaskiewicz/turbo-dom` 0.8.6](https://github.com/miaskiewicz/turbo-dom/tree/v0.8.6).
The package version and integrity are pinned in `bun.lock`, which also records
the checked-in patch path.
This development-only dependency does not ship in Querylane's browser bundle.

- Keep `getAttributeNode()` handles stable for each underlying attribute record,
  including live values, detachment and independent clones. Fresh handles make
  the accessible-name algorithm recurse on checkboxes inside their referenced
  labels. The [DOM contract](https://dom.spec.whatwg.org/#dom-element-getattributenode)
  returns the existing attribute, not a fresh wrapper.
- Emit an untrusted synthetic `PointerEvent` from `.click()`, with zero detail,
  no pointer type and the document's view. This matches
  [HTML's synthetic click contract](https://html.spec.whatwg.org/multipage/webappapis.html#fire-a-synthetic-pointer-event)
  and Chromium. Base UI must recognize SDK-triggered clicks as virtual activation.

Recreate with `bun patch @miaskiewicz/turbo-dom@0.8.6`, apply the two source
hunks, then run `bun patch --commit node_modules/@miaskiewicz/turbo-dom`.
Normalize whitespace-only patch context lines to empty lines for `git diff --check`.
Keep the upstream license in the installed package. Remove the patch and manifest
entry once an upstream release passes
`src/__tests__/turbo-dom-environment.unit.test.ts` unpatched, then verify a fresh
`bun install --frozen-lockfile`, `bun run quality:gate` and the WASM-backed suites
(`TURBO_DOM_PARSER=wasm bun run test`).

## Ultracite 8.0.2

`ultracite@8.0.2.patch` updates the MIT-licensed upstream
`config/biome/core/biome.jsonc` preset for Biome 2.6. The exact package version
and integrity are pinned in `bun.lock`.

Biome renamed `useSortedClasses` to `useTailwindSortedClasses` and moved class
detection options to the top-level `tailwind` configuration. The new defaults
cover the merge and variant functions used here. The patch also retains Biome's
default unsafe-fix classification: sorting can change `cn()` conflict resolution.

Recreate with `bun patch ultracite@8.0.2`, apply the configuration hunk, then run
`bun patch --commit node_modules/ultracite`. Remove the patch and manifest entry
when upgrading to an Ultracite preset compatible with Biome 2.6. Verify with a
fresh `bun install --frozen-lockfile` and `bun run lint`.
