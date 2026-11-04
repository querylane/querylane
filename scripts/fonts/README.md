# Manual web-font maintenance

Font processing is **never** part of `build`, installation, or CI. Committed WOFF2 files are the deployment inputs. The Blume integration only declares these existing files; Rsbuild only copies/hashes them. Fontsource packages are pinned root **dev** dependencies for manual regeneration, not frontend runtime dependencies.

## Rerun

From the repository root:

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd frontend
uv run --no-project --python 3.12 --with-requirements scripts/fonts/requirements.txt python scripts/fonts/optimize.py
uv run --no-project --python 3.12 --with-requirements scripts/fonts/requirements.txt python scripts/fonts/test-optimize.py
bun run --cwd frontend build
bun run docs:build
uv run --no-project --python 3.12 --with-requirements scripts/fonts/requirements.txt python scripts/fonts/test-build.py
```

Rerun after changing Fontsource versions, upstream docs fonts, content alphabets, weights, inline font settings, OpenType features, font CSS, Blume/Astro, Rsbuild's asset policy, or the fallback stack. Re-audit new styles before reducing any range. Source hashes in `sources.json` reject unreviewed upstream drift; intentionally update them only after auditing the new files and licenses.

`optimize.py` uses no network. The four Google/Geist v5 docs originals are checked into `sources/`; exact upstream URLs and SHA-256 hashes are in `sources.json`. App originals come from Fontsource Variable 5.3.0, locked in root `bun.lock`. OFL notices are retained in font name tables, here, and copied to both sites' public `font-licenses/` directories. Every derivative's family/full/PostScript/unique/prefix names are renamed to Querylane, including variants; original copyright/license records remain intact. No declared Reserved Font Name is used for derivatives.

## Deliberately conservative defaults

- Preserve `font-display: swap`, existing fallback fonts/metrics and synthetic app italics. Docs retain their real italic faces. Preserve original CSS weight matching: app 100–900, docs sans 400–700, docs mono 400–600.
- Preserve full 100–900 `wght` data. Partial instancing changes outlines at used intermediate weights. `--limit-axes` is an **unapproved experiment**, not a recommended rerun command. Artifact tests reject publishing that mode.
- Core includes ASCII, Latin-1, common punctuation, and shaping-sensitive marks/symbols. A smaller ASCII-only core changed accented text's font runs. Extended contains the remaining 12 existing Latin codepoints, with no ASCII overlap.
- All ranges match real cmap entries **except U+2010 on core faces**. Upstream declares but does not contain this hyphen. Removing its declaration changes Chromium's fallback-run segmentation. Keeping the declaration restores exact pixels without adding/substituting a glyph. This explicit zero-font-byte exception is recorded in the manifest and tests.
- Keep existing Latin Extended-A, Cyrillic, Vietnamese and mono-symbol coverage on demand. Database identifiers/values are not a closed content corpus. App families therefore retain their original additional script slices, rather than reducing multilingual data to two Latin-only files. CJK and unsupported characters continue using system fallbacks. Docs do not gain Extended-A glyphs they previously rendered via fallback.
- Retain required/default shaping and tabular numbers: `ccmp`, `locl`, `liga`, `kern`, `mark`, `mkmk`, `tnum` when present. Drop opt-in unused `dnom`, `frac`, `numr`, `pnum`. There is no upstream glyph hint bytecode. Retain the original `prep` (7 bytes) and `gasp` (8 bytes) rasterizer policy: dropping `prep` changes Linux LCD rendering. `--drop-hinting` is an unapproved experiment; release artifact tests reject it. Preserving this policy adds 140 font bytes to the ordinary app page versus the initial candidate.
- Only app sans core is preloaded, as before; mono stays demand-driven. Docs preload only normal sans/mono cores. Italics and extended remain on demand. Never insert a fallback **family** between core and extended faces.
- Disable Rsbuild's automatic font data-URI inlining: otherwise its 4 KiB threshold embeds the tiny extended files in global CSS and defeats conditional downloads. `test-build.py` validates actual emitted hashes, not config tokens.

## Pixel and network proof

See [the paired audit](../../docs/audits/font-optimization/README.md). Preserve the exact same content, browser, OS, viewport, theme, and zoom on baseline/candidate; await layout and `document.fonts.ready`. Do not bless changed screenshots as new baselines.

With baseline and candidate app build directories and docs servers available:

```sh
python scripts/fonts/prepare-proof.py --app-dir /path/to/baseline-app --docs-url http://127.0.0.1:4185
python scripts/fonts/prepare-proof.py --app-dir frontend/dist --docs-url http://127.0.0.1:4184
```

This creates disposable `font-proof-*.html` pages inside the build directories, never shipped source. Serve each app directory normally; also compare real `/get-started`, `/get-started/configure-querylane`, and app startup with identical API responses. Specimens cover both families, 300/400/500/600/700, italics/bold-inside-italics, code, tabular numbers, inline overrides, accents/combining marks, Cyrillic/Vietnamese, CJK, U+2010 and fallback symbols. These exercise font declarations, not an authenticated database workflow.

Capture matched PNGs, then:

```sh
uv run --no-project --with pillow==13.0.0 python scripts/fonts/compare.py before.png after.png --output /tmp/font-proof/diff
```

Even one changed RGB pixel fails. Inspect the diff; treat it as a regression unless separately approved. Inspect network on the ASCII, accented, CJK, and extended probes: only the last needs the Latin extended file. The helper gives probe fonts distinct cache-busting URLs because Chromium can reuse loaded FontFaces across navigations without recording another resource entry. Sum actual font response bodies for cold payloads, not warm-cache transfer zeros. Do not call `FontFace.load()` for every face while measuring demand loading.

After proof, run a normal build to remove disposable pages. Commit fonts, CSS, manifest, licenses, tests, and refreshed evidence together. Core embedding and idle precaching remain deferred.
