# React performance audit — 2026-07-16

## Result

React Compiler was already enabled globally through Rsbuild. Its unspecified
`compilationMode` defaulted to `infer`; the configuration now makes that default
explicit for every development and production build. An annotation-only mode
exists solely as a local measurement control.

The measured `infer` build reduced React work in all three representative
journeys without changing their relevant RPC counts:

| Journey | Component renders | React render time | Interaction duration | Long-task time | Relevant RPCs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Roles search | 700 → 292 (**-58.3%**) | 45.3 ms → 13.7 ms (**-69.8%**) | 116.1 ms → 65.9 ms (**-43.2%**) | 57 ms → 0 ms | 0 → 0 |
| Data Explorer filter and select | 2,514 → 1,358 (**-46.0%**) | 145.3 ms → 90.6 ms (**-37.6%**) | 490.3 ms → 411.5 ms (**-16.1%**) | 144 ms → 82 ms (**-43.1%**) | 2 → 2 |
| Proto form edit and connection test | 306 → 55 (**-82.0%**) | 19.1 ms → 4.1 ms (**-78.5%**) | 178.4 ms → 181.1 ms (**+1.5%**) | 0 ms → 0 ms | 1 → 1 |

Summing the three medians for orientation gives **51.6% fewer component
renders**, **48.3% less React render time**, **16.1% lower interaction
duration**, and **59.2% less long-task time**. This is not a whole-application
estimate or production telemetry.

No compiler-specific correctness defect was reproduced. Every measured journey
completed five times in the annotation control and five times in infer mode.

## Compatibility audit

- React Doctor full scan: no findings.
- React Hook Form render-time `watch()` calls: none.
- React Hook Form subscriptions: `useWatch()` is used in both proto-form
  consumers. The whole-form subscription in `UiConfiguredPhase` remained
  reactive under infer and the connection-test request count stayed at one.
- Protobuf form bridge: its five infer runs validated the edited form, sent the
  expected connection-test RPC, rendered the success state, and enabled the
  continuation action.
- TanStack Table: v9 is installed; the measured roles search remained reactive
  under infer with no refetch.
- Router, query, and data grid: the Data Explorer selection reached the expected
  route and row result in every run with two relevant requests in both modes.
- Compiler directives: no `"use memo"` or `"use no memo"` escape hatches exist
  in application source.

The broad local E2E run against the unchanged application and test source was
not clean: infer passed 61/82 and the annotation control passed 62/82. Twenty
failures were shared, so the differential run does not attribute them to React
Compiler; this branch does not change those tests. Infer's only additional
failure was one cold-route hard-budget sample at
1,529 ms. The controlled five-run Data Explorer comparison moved the opposite
direction, with a 490.3 ms → 411.5 ms median, so the isolated miss is not treated
as a compiler correctness regression.

## Method

- Base commit: `05ff4531ef4cdb33a7419f8b4623aef21df1c8d2`
- Host: macOS 26.5.2, Apple Silicon (`arm64`)
- Node: 26.5.0; Bun: 1.3.14
- Playwright: 1.62.0-alpha-2026-07-14
- Chromium: 151.0.7922.19
- React Scan: 0.5.7, exact local package asset loaded before React
- Control: `compilationMode: "annotation"`, `target: "19"`
- Candidate/default: `compilationMode: "infer"`, `target: "19"`
- Dataset: deterministic Playwright RPC mocks
- Samples: five sequential runs per mode and journey; median reported
- Viewport and locale: 1280 × 900, UTC, en-US

The recorder attached React Scan after each page reached its usable initial
state. It then reset counters, performed one interaction, waited for the
expected UI state and two animation frames, and captured:

- component render count and render self-time,
- commit count and compiler memo-cache markers,
- interaction duration and long-task duration,
- journey-relevant RPC count,
- top component hotspots.

Unnecessary-render tracking was disabled because it adds measurement overhead;
no unnecessary-render claim is made.

## Raw five-run samples

Values are in run order. Times are milliseconds.

### Roles search

| Mode | Renders | Render time | Interaction | Long tasks | Commits | Compiled renders | RPCs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Annotation | 700, 700, 700, 700, 700 | 44.6, 45.3, 46.6, 47.1, 44.6 | 116.1, 132.8, 107.6, 131.6, 105.1 | 57, 57, 60, 60, 56 | 7, 7, 7, 7, 7 | 0, 0, 0, 0, 0 | 0, 0, 0, 0, 0 |
| Infer | 292, 292, 292, 292, 292 | 14.9, 13.5, 14.5, 12.6, 13.7 | 75.4, 63.3, 65.9, 58.2, 71.2 | 0, 0, 0, 0, 0 | 6, 6, 6, 6, 6 | 136, 136, 136, 136, 136 | 0, 0, 0, 0, 0 |

### Data Explorer filter and select

| Mode | Renders | Render time | Interaction | Long tasks | Commits | Compiled renders | RPCs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Annotation | 2,296, 3,824, 2,148, 2,514, 2,661 | 132.9, 175.1, 145.3, 136.6, 194.8 | 449.9, 627.7, 753.0, 470.1, 490.3 | 139, 178, 131, 144, 229 | 21, 29, 24, 23, 21 | 0, 0, 0, 0, 0 | 2, 2, 2, 2, 2 |
| Infer | 1,358, 1,324, 1,601, 1,468, 1,322 | 90.0, 85.6, 101.3, 92.7, 90.6 | 577.9, 363.8, 411.5, 394.2, 553.6 | 53, 82, 86, 82, 0 | 25, 19, 22, 21, 26 | 677, 648, 783, 719, 644 | 2, 2, 2, 2, 2 |

### Proto form edit and connection test

| Mode | Renders | Render time | Interaction | Long tasks | Commits | Compiled renders | RPCs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Annotation | 306, 313, 306, 306, 306 | 19.2, 19.1, 17.9, 19.0, 19.1 | 159.9, 305.3, 186.7, 178.4, 163.3 | 0, 50, 0, 0, 0 | 5, 7, 5, 5, 5 | 0, 0, 0, 0, 0 | 1, 1, 1, 1, 1 |
| Infer | 55, 55, 55, 55, 55 | 4.3, 4.1, 3.2, 4.3, 4.1 | 145.5, 203.7, 128.7, 181.1, 228.9 | 0, 0, 0, 0, 50 | 4, 4, 4, 4, 4 | 32, 32, 32, 32, 32 | 1, 1, 1, 1, 1 |

## Hotspots and next checks

- Data Explorer remains the largest measured interaction. In infer mode,
  `DataGrid`, `TableDataGrid`, and `DataExplorerPage` were the top named render
  costs. Profile those boundaries before adding any manual memoization.
- `UiConfiguredPhase` remained the largest named proto-form cost, but its median
  React time was only 1.3 ms under infer and the end-to-end interaction did not
  materially improve. No form refactor is justified by this baseline.
- Repeat the same five-run protocol after material table, router, form, or
  provider changes. Keep RPC counts and correctness states as acceptance gates.

## References

- [React Compiler installation](https://react.dev/learn/react-compiler/installation)
- [React Compiler compilation mode](https://react.dev/reference/react-compiler/compilationMode)
- [React incompatible-library lint](https://react.dev/reference/eslint-plugin-react-hooks/lints/incompatible-library)
- [Rsbuild React Compiler option](https://rsbuild.rs/plugins/list/plugin-react#reactcompiler)
- [React Scan Rsbuild installation](https://github.com/aidenybai/react-scan/blob/main/docs/installation/rsbuild.md)
