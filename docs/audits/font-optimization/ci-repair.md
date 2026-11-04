# Linux CI repair

The initial revision (`505f6eac`) passed macOS pixel comparisons but failed Linux CI: 40 visual tests and three screenshot-bearing E2E cases changed text pixels. The fourth E2E failure was a stale assertion for the original `geist-latin-wght-normal` preload filename.

## Cause and fix

The subsetter removed the upstream `prep` table because individual glyphs contain no hint instructions. That table still contains a **7-byte rasterizer policy program**, `SCANCTRL` / `SCANTYPE`. Dropping it changes Linux LCD text rasterization even though outlines, advances, `gasp`, and macOS captures agree.

Preserve upstream rasterizer programs by default. A new artifact regression test compares `prep` and `gasp` byte-for-byte against every source, including supplementary scripts. It failed on the initial candidate and passes after regeneration. `--drop-hinting` is now explicitly experimental; default generation preserves rendering. Keep the preload assertion specific to the new, content-hashed **sans core** file; retain its one-preload and same-consumed-URL checks.

No canonical screenshot, tolerance, retry, skip, workflow, or required check was changed.

## Verification

- Reproduced the failing PostgreSQL error-summary visual in both themes using the repository's pinned `mcr.microsoft.com/playwright:v1.64.1-noble` image.
- After the repair: **256/256 visual tests** (light/dark, including narrow layouts) and **124/124 E2E/accessibility tests** pass in that image. Local runtime: Linux ARM64 via the existing container engine; hosted AMD64 CI is checked separately.
- Additional strict comparisons against the unchanged canonical screenshot files: **0 changed RGB pixels / 1,306,424 pixels**; before/after PNG hashes are identical in both themes. [Light pair](linux-light/diff.json), [dark pair](linux-dark/diff.json), [capture environment](linux-proof-environment.json).
- Fresh cache-busted Linux probes confirm that ASCII, Latin-1 and CJK pages request only the 25,764 B sans core. `™`/prime requests core plus the 2,084 B extended file. [Measurements](network.json). The original macOS measurements are retained separately as historical evidence.
- Full frontend quality gate passes, including 927 unit and 193 integration tests. Docs build and all 10 production-runtime tests pass. All three manual font contracts and the real emitted-file hash check pass.

The ordinary app's two font responses now total **46,192 B**, versus 52,528 B originally: **12.1% less**, and 140 B more than the initial candidate. Docs normal-core payload remains 46,116 B. Per-face costs and the interactive summary were refreshed. The five original macOS pairs remain historical evidence for `505f6eac`, not a substitute for current Linux proof.

Commands, from `frontend`:

```sh
DOCKER_CONTEXT=podman bash scripts/playwright-container.sh \
  'bun run test:visual && bun run test:e2e:ci'
bun run lint:fix
bun run quality:gate
```

Font generation and artifact checks remain manual as documented in [the maintenance guide](../../../scripts/fonts/README.md). No font processing was added to CI or the build.
