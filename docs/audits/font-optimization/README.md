# Web-font optimization audit

Baseline: `33f17083544ba28f7f7a5cef26eb1fffa4e2296c` (2026-11-04). The original macOS comparison used identical content and dependency locks. **Follow-up: [canonical Linux CI repair](ci-repair.md).** The initial macOS captures did not catch a Linux rasterizer regression; the current fonts preserve `prep` and `gasp` and have fresh exact Linux light/dark proof. App and docs are both covered. Intended visible change: **none**.

## Result

- Historical macOS captures at `505f6eac`: **0 changed RGB pixels / 5,120,000 compared**. These apply to that revision, not the current candidate.
- Current Linux proof: **0 changed RGB pixels / 1,306,424 compared** across light/dark component captures against the unchanged canonical baselines. Every before/after PNG SHA-256 is identical, not merely within a tolerance. No subpixel difference was accepted.
- App startup font payload: **52,528 → 46,192 B** (12.1% less). Docs quickstart/configuration: **52,396 → 46,116 B** (12.0% less). Payloads exclude HTTP headers.
- `font-display`, fallback fonts/metrics, CJK fallback, real docs italics and synthetic app italics remain unchanged. No build-time font processing, core embedding, or idle precache.

## Per-face bytes and glyphs

All sources have one `wght` axis, min/default/max **100/400/900**. Shipping subsets retain those axes; CSS matching ranges stay app 100–900, docs sans 400–700, docs mono 400–600. Glyph counts include non-encoded shaping/composite glyphs, not only cmap entries.

| Face | Before bytes / glyphs | Core bytes / glyphs | Extended bytes / glyphs | After total |
|---|---:|---:|---:|---:|
| app-sans | 29,400 / 288 | 25,764 / 249 | 2,084 / 17 | 27,848 |
| app-mono | 23,128 / 264 | 20,428 / 225 | 1,948 / 17 | 22,376 |
| docs-sans-italic | 31,024 / 287 | 27,224 / 248 | 2,180 / 17 | 29,404 |
| docs-sans-normal | 29,288 / 288 | 25,776 / 249 | 2,068 / 17 | 27,844 |
| docs-mono-italic | 25,504 / 264 | 22,596 / 225 | 1,992 / 17 | 24,588 |
| docs-mono-normal | 23,108 / 264 | 20,340 / 225 | 1,864 / 17 | 22,204 |

App multilingual slices are retained, separately demand-loaded. Removing them would change arbitrary database text; their cost on the sampled ordinary pages is **0 B**.

| App slice | Before bytes / glyphs | After bytes / glyphs |
|---|---:|---:|
| geist-cyrillic-ext-wght-normal.woff2 | 7,420 / 53 | 6,716 / 46 |
| geist-cyrillic-wght-normal.woff2 | 15,084 / 138 | 14,300 / 133 |
| geist-vietnamese-wght-normal.woff2 | 8,004 / 141 | 7,436 / 138 |
| geist-latin-ext-wght-normal.woff2 | 16,512 / 233 | 15,072 / 229 |
| geist-mono-cyrillic-ext-wght-normal.woff2 | 6,176 / 52 | 5,732 / 45 |
| geist-mono-cyrillic-wght-normal.woff2 | 12,940 / 137 | 12,372 / 132 |
| geist-mono-symbols2-wght-normal.woff2 | 5,812 / 168 | 4,896 / 161 |
| geist-mono-vietnamese-wght-normal.woff2 | 7,696 / 141 | 7,168 / 138 |
| geist-mono-latin-ext-wght-normal.woff2 | 14,696 / 232 | 13,252 / 227 |

The [committed manifest](../../../frontend/src/fonts/manifest.json) contains each input/output SHA-256, byte size, glyph and character count, exact GSUB/GPOS tags, axes, hint tables, and actual Unicode ranges. [Provenance](../../../scripts/fonts/sources.json) pins every original. Sources have **zero hinted glyphs**; app sources carry `prep`/`gasp`, docs sources `gasp`. Preserve `prep` and `gasp` rasterizer policy: removing the 7-byte `prep` program changes Linux LCD text despite zero glyph hint instructions. Derivative internal names are Querylane names; OFL notices remain intact.

Source OpenType features: sans Latin GSUB `ccmp dnom frac liga locl numr pnum tnum`, GPOS `kern mark mkmk`; mono Latin GSUB `ccmp dnom frac locl numr`, GPOS `mark mkmk`. Supplemental features vary and are listed individually in the manifest. Retain required/default shaping (`ccmp locl liga kern mark mkmk`) and used `tnum`; remove unused opt-ins `dnom frac numr pnum`.

## Actual usage audit

- App styles: 400 normal, 500 medium, 600 semibold, 700 bold; header separator in `admin-header.tsx` is 300. Both sans and mono bold occur, including metric cards.
- Inline/component settings: `sql-editor-theme.ts` sets mono content/gutters/popups, sans tooltips, **600** keywords and **italic** comments. `index.css` sets chart tooltips to mono **500**. Do not freeze mono at 400.
- `strong` overrides in role/grant components use 500; onboarding emphasis inherits normal copy and uses bold. App imports only normal faces, so italics remain synthesized. Docs load separate real normal/italic faces. Bold inside docs mono italics retains the existing 400–600 CSS clamp rather than adding a visually different 700.
- Only `tabular-nums` is explicitly enabled; no authored `font-feature-settings`, `font-variation-settings`, `font-optical-sizing`, fractional/swash settings, or `hyphens: auto` were found in the app/docs styles/components. Preserve default shaping anyway. The explicit U+2010 specimen tests the hyphen fallback edge.
- Current fixed UI/docs are predominantly ASCII plus curly quotes, en/em dashes, ellipsis, arrows and bullets. Specimens also cover Latin-1, Extended-A, combining accents, Greek/system fallback, Cyrillic, Vietnamese, CJK, code and inline settings. Database values and identifiers are user-controlled, so observed source strings are **not** a safe complete character allowlist.
- Keep existing coverage, not newly invented glyphs: unsupported Extended-A characters in docs and all CJK still use their original fallback. App keeps the original Latin-Extended, Cyrillic, Vietnamese and mono-symbol slices.

## Per-page cold font payload and preloads

| Page / fixture | Before B | After B | Font preloads after |
|---|---:|---:|---|
| App startup, same HTTP 501 recovery state | 52,528 | 46,192 | Sans core only |
| Docs `/get-started` | 52,396 | 46,116 | Normal sans + normal mono cores |
| Docs `/get-started/configure-querylane` | 52,396 | 46,116 | Normal sans + normal mono cores |
| App multilingual/code/italic specimen | 127,460 | 115,792 | Sans core only |
| Docs four-face specimen | 108,924 | 95,936 | Normal sans + normal mono cores |
| ASCII + common punctuation, sans probe | 29,400 | 25,764 | Sans core only |
| Latin-1 accents, sans probe | 29,400 | 25,764 | Sans core only |
| CJK + ASCII label, sans probe | 29,400 | 25,764 | Sans core only; no CJK web font |
| `™` / prime, sans extended probe | 29,400 | 27,848 | Sans core only; extended requested by text |

Before preloads: app only `geist-latin-wght-normal`; docs normal sans and mono Latin files. After: the same roles, with content-hashed core URLs. Mono and italic demand behavior is unchanged. Extended is never preloaded. The extended probe adds one 2,084 B request; the other three probes make exactly one 25,764 B font request. See the fresh-URL, layout-settled [network measurements](network.json). Warm loaded FontFaces can suppress Resource Timing entries; those preliminary samples were discarded, not treated as cold measurements.

Rsbuild initially inlined the sub-4 KiB extended fonts as data URIs, defeating conditional loading. The real-output test reproduced this failure. `output.dataUriLimit.font = 0` fixes it without adding a processing step. The final emission test verifies every committed subset hash exists as an independent built WOFF2 file. [Rsbuild reference](https://rsbuild.rs/config/output/data-uri-limit).

## Pixel proof

The five macOS pairs below are historical evidence from `505f6eac`. Current Linux light/dark pairs use the pinned Playwright image and unchanged canonical baselines; see [CI repair](ci-repair.md). Same browser session, viewport and theme within each pair. Saved captures are 1280×800 (preview capture format); runtime environment is recorded separately. Real app recovery was served through identical static servers on both sides so the API response/content stayed HTTP 501 on both. Real docs capture code blocks, navigation and components. Specimens separately exercise inline overrides, true/synthetic italics, bold within italics, accents, code and CJK. This is not a claim of an authenticated database workflow or exhaustive cross-platform proof.

| Scenario | Before | After | Strict diff |
|---|---|---|---|
| app-startup | [PNG](app-startup/before.png) | [PNG](app-startup/after.png) | [0 pixels](app-startup/diff.json), [mask](app-startup/diff.png) |
| docs-quickstart | [PNG](docs-quickstart/before.png) | [PNG](docs-quickstart/after.png) | [0 pixels](docs-quickstart/diff.json), [mask](docs-quickstart/diff.png) |
| docs-configure | [PNG](docs-configure/before.png) | [PNG](docs-configure/after.png) | [0 pixels](docs-configure/diff.json), [mask](docs-configure/diff.png) |
| app-specimen | [PNG](app-specimen/before.png) | [PNG](app-specimen/after.png) | [0 pixels](app-specimen/diff.json), [mask](app-specimen/diff.png) |
| docs-specimen | [PNG](docs-specimen/before.png) | [PNG](docs-specimen/after.png) | [0 pixels](docs-specimen/diff.json), [mask](docs-specimen/diff.png) |

No content changes were made and no visible difference remains in these captures. The initial proof helper lacked UTF-8 metadata and produced mojibake; those captures were discarded and both sides recaptured correctly. No generated or missing screenshot baseline was blessed.

## Deviations required for rendering parity

1. **Larger core, not ASCII-only.** Splitting accents/marks into a separate face changed shaping. Keep Latin-1 and shaping-sensitive common characters together. A minimal core would save an additional **16,724 B** on the app two-face page or **16,704 B** on the docs normal two-face page, but changed accented-text pixels. It also increases total font bytes when both small subsets load. Rejected by default.
2. **Retain full axes.** Partial instancing changes outlines at used non-default weights (202–205 core characters per face at 500 in the measured candidates). It would save another **3,452 B** on app normal cores or **13,408 B** on docs normal cores; not shipped. [Per-face option costs](rejected-options.json), [outline changes](axis-outline-changes.json). `--limit-axes` is explicitly experimental; tests reject it as a release candidate.
3. **One exact-range exception: U+2010.** None of these original Latin files contains this glyph, although upstream CSS declares it. Tightening that declaration changed fallback-run segmentation: 2,367 app-specimen pixels / 1,443 docs-specimen pixels differed. Retaining the original declaration restores exact PNG hashes without adding or changing a glyph. Font cost **0 B**, about 7 raw CSS characters per core face. Every other declared codepoint exists in the corresponding file; core/extended actual cmaps are disjoint.
4. **Keep non-Latin app slices.** Two files per Latin face, not only two files for the whole multilingual family. Discarding additional scripts would save their bytes only on multilingual pages, by visibly replacing existing glyphs with system fonts. Ordinary-page cost of keeping them: **0 B**.
5. **Keep `prep`, `gasp` and existing preloaded roles.** Preserve proven Linux and unverified Windows rasterizer policy or preload unused app mono/italic cores. No upstream glyph instruction bytecode exists to remove. Full Latin-1 is retained in core; docs do not acquire new Extended-A glyphs that would replace current fallback rendering.

None of these rendering-changing options is enabled by default. Future core embedding and idle precaching were deliberately not implemented.

## Checks and rerun

- Frontend `lint:fix` and `quality:gate`: formatter, lint/rule inventory/type-aware lint/suppression scan, React Doctor, native TS + TS canary, production build/budgets, **927 unit + 193 integration tests**.
- Docs: build, `docs:check` (0 errors/warnings/hints), **45 content tests**, **10 production-runtime tests** (including unchanged fallback metric values and core-only preloads).
- Font contracts: exact cmap/range policy, renamed identities, sizes/axes, unchanged outlines and advances at used weights; real emitted file hashes. Missing source is rejected before touching output; restoring it and rerunning recovers. Repeated generation is deterministic.
- Original limits: one macOS/light capture environment. The CI repair adds canonical Linux light/dark exact captures and the full native visual/E2E suites. No Safari/Firefox/Windows rendering pass or live authenticated database journey was performed. Larger core/full axes/original gasp/fallbacks deliberately reduce those unverified risks.

Run the manual commands and paired proof procedure in [scripts/fonts/README.md](../../../scripts/fonts/README.md). Rerun after font/dependency/style/feature/character changes. Fonts are generated by hand and committed, never processed during the app/docs build. Revert this change as a unit to roll back.

Before app entry CSS: 234,974 raw B / 34,514 gzip B (reported separately from font payload).

After app entry CSS: 235,889 raw B / 34,694 gzip B (reported separately from font payload).
