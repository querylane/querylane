# Retained-resource diagnostics

Collect bounded lifecycle samples from an independently identified ordinary production build. Results are report-only calibration evidence, not a leak verdict.

## Run controls first

From `frontend/`, install frozen dependencies and the pinned Playwright Chromium. Run:

```sh
bun run test:unit -- scripts/memory-build.unit.test.ts scripts/memory-cli.unit.test.ts scripts/memory-detector.unit.test.ts scripts/memory-options.unit.test.ts
env -u NO_COLOR bunx --no-install playwright test --config=e2e/memory/playwright.config.ts --repeat-each=3
bun run scripts/run-memory-lifecycle.ts --help
```

Controls seed retained and released detached nodes/listeners, observe a real worker, and reject reload, asset drift, unknown RPCs and stalled journeys. They do not establish application memory health.

## Identify and serve immutable bytes

Use a clean, exact source revision and `bun run build`. Keep existing byte checks blocking. Copy accepted ordinary output to an isolated immutable directory before other builds replace `dist`. Serve it on an unused loopback HTTP origin. Do not use development, visual-harness, React profiling or Rsdoctor output.

The build owner supplies a JSON manifest matching [memoryBuildSchema](../../frontend/scripts/memory-build.ts):

- `mode`: `production`.
- `revision`: the actual full 40-character Git SHA, not a requested label.
- `buildId`: a nonempty producer identity.
- `entrySha256`: SHA-256 of the exact served `index.html` bytes.
- `assets`: absolute URL paths mapped to exact SHA-256 hashes for every executed JavaScript and CSS file, including `/theme-init.js`.

Revision and mode are producer attestations. Hash validation cannot prove those attestations. Do not derive a trustworthy revision from an unidentified existing server.

Set `PRODUCTION_URL`, `BUILD_MANIFEST` and `NEW_EVIDENCE_DIR` to your local inputs. The output directory must not exist.

```sh
bun run scripts/run-memory-lifecycle.ts \
  --url "$PRODUCTION_URL" --build-manifest "$BUILD_MANIFEST" \
  --output-dir "$NEW_EVIDENCE_DIR"
```

The CLI starts no build or server. It rejects non-loopback URLs, unknown RPCs/assets and source-byte drift. It uses hermetic canned fixtures, blocks service workers and writes one bounded private report. Inspect errors and source/build identity before interpreting counters. Exit 0 means valid calibration/advisory growth, 1 means invalid collection or failed control, and 2 means invalid arguments.

## Interpret within bounds

Unsupported counters remain unavailable, not zero. Garbage-collection requests do not prove complete reclamation. Repeat comparable application samples and inspect retaining paths before proposing a gate or optimization. Neither seeded controls nor one application run proves a production leak or leak-free behavior. There is no scheduled workflow or hard memory threshold. Keep detailed reports private.
