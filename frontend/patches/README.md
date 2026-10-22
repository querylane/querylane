# Dependency patches

## Ultracite 8.0.0

`ultracite@8.0.0.patch` updates the MIT-licensed upstream
`config/biome/core/biome.jsonc` preset for Biome 2.6. The exact package version
and integrity are pinned in `bun.lock`.

Biome renamed `useSortedClasses` to `useTailwindSortedClasses` and moved class
detection options to the top-level `tailwind` configuration. The new defaults
cover the merge and variant functions used here. The patch also retains Biome's
default unsafe-fix classification: sorting can change `cn()` conflict resolution.

Recreate with `bun patch ultracite@8.0.0`, apply the configuration hunk, then run
`bun patch --commit node_modules/ultracite`. Remove the patch and manifest entry
when upgrading to an Ultracite preset compatible with Biome 2.6. Verify with a
fresh `bun install --frozen-lockfile` and `bun run lint`.
