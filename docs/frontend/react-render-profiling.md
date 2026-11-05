# Opt-in React render profiling

Collect matched render-work journeys without shipping diagnostic modules in normal production output. This toolkit does not provide a genuine paired application baseline by itself.

## Run capability and negative controls

From `frontend/`, use a new absolute output directory outside the checkout:

```sh
bun run test:unit -- scripts/react-performance-mode.unit.test.ts scripts/react-profile-cli.unit.test.ts scripts/react-profile-comparison.unit.test.ts scripts/react-profile-sequence.unit.test.ts scripts/metric-response-readiness.unit.test.ts src/lib/react-profile-recorder.unit.test.ts src/lib/react-root-errors.unit.test.ts
bun scripts/verify-react-profile-runtime.ts "$NEW_CONTROLS_DIR"
bun run build
```

The runtime controls build synthetic profiled and normal applications. They reject seeded diagnostic modules in normal output and test real Chromium callbacks. They are not an application base/head comparison. Normal application builds keep their native root/error/bootstrap behavior. The chart's busy state marks retained samples as pending until refresh settles.

## Produce genuine matched artifacts before collecting

First prove composed router generation and other build-plugin isolation. Use the same instrumentation-only overlay on genuine base/head source, preserving all upstream content. Record the real resulting source revisions. Never label a head calibration build as the baseline.

Each independent production profiling build requires:

```sh
QUERYLANE_REACT_PROFILE=1 \
QUERYLANE_REACT_PROFILE_ROOT="$ISOLATED_ABSOLUTE_ROOT" \
QUERYLANE_REACT_PROFILE_REVISION="$ACTUAL_FULL_SHA" \
QUERYLANE_REACT_PROFILE_SOURCE_DIGEST="$SOURCE_SHA256" \
QUERYLANE_REACT_PROFILE_CONFIG_DIGEST="$COMMON_CONFIG_SHA256" \
bunx --no-install rsbuild build
```

Roots must be outside `frontend/`, not filesystem roots. Do not combine profiling with Scan, visual harness or Rsdoctor modes. Output and cache are isolated from ordinary `dist`. Keep toolchain, fixture, machine and build settings comparable. Independently hash and serve each immutable artifact on loopback HTTP.

Create a manifest using [the build schema](../../frontend/scripts/react-profile-comparison.ts): `base` and `head` each contain actual `revision`, `sourceDigest`, `artifactDigest`, `url` and `mode: react-profile`. Add `machine` and the common `configDigest` at the top level. Digests are SHA-256; revisions are full Git SHAs. Missing baseline means unavailable, not zero work.

```sh
bun scripts/react-profile.ts collect "$PAIRED_MANIFEST" "$NEW_EVIDENCE_DIR"
bun scripts/react-profile.ts compare "$ORDERED_REPORTS" "$NEW_COMPARISON_DIR"
```

The collector runs three journeys on each side of five alternating pairs and retains raw callbacks. Both current and previous metric request bodies must finish before idle rendered charts and comparison legends establish readiness. Held-body negative controls reject premature readiness. Missing, stale, no-op, overflowed or mismatched evidence fails. Unavailable/inconclusive evidence exits 2, never passes.

## Interpret render work only

`actualDuration` measures render work. `commitTime` is a timestamp, not commit-phase duration. Neither measures FCP or INP. A synthetic control pass does not prove instrumented application build isolation, a genuine paired baseline or a performance improvement. No workflow or schedule is installed. Keep detailed evidence private until an appropriate publication review.
