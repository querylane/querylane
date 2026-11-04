# Web fonts

Fonts are generated **manually**, committed, and copied by normal builds. App and docs font-display, fallback metrics, weight matching, and preload roles stay unchanged.

## Regenerate

From the repository root, after installing both locked Bun dependency sets:

```sh
uv run --no-project --python 3.12 --with-requirements scripts/fonts/requirements.txt python scripts/fonts/optimize.py
bun run --cwd frontend build
bun run docs:build
uv run --no-project --python 3.12 --with-requirements scripts/fonts/requirements.txt python scripts/fonts/test-fonts.py
```

Rerun after changing font versions, supported characters, font styles/features, or font-loading configuration. Source hashes and upstream URLs are pinned in `sources.json`; docs originals are in `sources/`, app originals in the locked Fontsource packages. Re-audit changes before updating source hashes. The generator retains copyright/license records, renames derivative fonts internally, and copies Fontsource's OFL notices to both public sites.

## Rendering constraints

- Keep full variable axes and a Latin-1/shaping-safe core: clipping axes or splitting accented text changed rendering.
- Preserve `prep` and `gasp`. Removing the 7-byte `prep` program changes Linux rasterization despite there being no individual glyph hint instructions.
- Preserve the upstream U+2010 declaration on core faces even though the glyph is absent; removing it changes fallback font runs. Every other declared codepoint exists in its file.
- Keep existing Extended-A, Cyrillic, Vietnamese and mono-symbol slices on demand; database text is not a closed corpus. CJK continues using system fonts.
- Core and extended share one family. Only normal cores are preloaded (sans only in the app); font data-URI inlining is disabled so extended files stay on demand.
- Keep docs italic faces first in the manifest: Astro derives fallback metrics from the first style.

## Verification

| Sample page font payload | Before | After |
|---|---:|---:|
| App startup | 52,528 B | 46,192 B |
| Docs quickstart | 52,396 B | 46,116 B |

Verified before cleanup: 256 Linux visual tests, 124 E2E/accessibility tests, and exact light/dark component comparisons (zero changed pixels). Font files remain byte-identical during cleanup. Historical reports and captures remain available in [the prior verification reports](https://github.com/querylane/querylane/tree/6575c60fc92299e4c598a17ddaa3ddd673949057/docs/audits/font-optimization), not in the runtime source tree.

After regeneration, run the native visual/E2E suites without updating baselines. Compare identical content, browser, OS, viewport and theme; treat changed pixels as regressions. The manual tests additionally check cmap declarations, names/axes, original outlines/rasterizer programs, and real emitted files. Check a fresh browser context: ASCII/Latin-1/CJK need only the 25,764 B sans core; `™`/prime additionally needs the 2,084 B extended file. Do not call `FontFace.load()` on unused faces while measuring.
