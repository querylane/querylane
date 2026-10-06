# Chart kit

This reusable, app-agnostic layer builds monitoring charts with TanStack Charts.
It supports time-series line, area, and stacked charts; sparklines; axes;
tooltips; and legends. Every Querylane chart should use this kit instead of
hand-assembled chart-library primitives.

TanStack Charts 1.0.0 is pinned exactly. Its documented APIs follow the
[v1 compatibility contract](https://tanstack.com/charts/latest/docs/compatibility).
Definitions use `@tanstack/charts/scene`, the React SVG host uses
`@tanstack/charts/react`, and marks, scales, and interactions use exact subpaths.
Keep chart behavior and bundle-budget checks green when upgrading.

## Compose, do not replace

Follow the Charts 1.0 announcement's "keep the pieces you already have" approach:

- Monitoring presets compose native marks: an area fill plus a line, stacked
  areas, dashed comparison lines, threshold rules, text labels, and a crosshair.
  Extend these definitions for a new encoding instead of adding a specialized
  wrapper for every combination. Keep shared sizing, themes, and data preparation.
- Preserve typed rows through mark channels and tooltip callbacks. Do not erase
  inference with casts or replace missing values with fabricated zeros.
- Give measurements interaction ownership. Supporting fills, rules, and labels
  use `decorative` so keyboard traversal and tooltips do not duplicate values.
- SVG is the default. Compact `scales/linear` handles our numeric values and
  epoch-ms positions; calendar-aware tick generation remains application-owned.
  Canvas, motion, and D3 scales are optional capabilities, not default imports.
- Keep the lazy boundaries in `metric-chart.tsx`. `bun run build` checks chart
  bytes, rejects eager chart runtime, and rejects unused Canvas, motion, spring,
  or D3-scale modules, including separate shared chunks. React Flow's unrelated
  D3 dependencies remain allowed. A justified new capability needs an explicit
  contract/budget update and browser evidence, not a blanket budget increase.

Use the existing browser and visual harnesses to verify tooltips, keyboard
navigation, gaps, same-colored series, resize, and teardown in both themes.

## Modules

| Module | Role |
|---|---|
| `chart-context.ts` | Kit types (`ChartRow`, `ChartSeries`, `ChartThreshold`) |
| `chart-container.tsx` | Parent-sized mounting frame, app-owned legend, refresh dimming |
| `responsive-chart.tsx` | CSS-sized host; TanStack observes parent-owned width and height |
| `metric-time-chart.tsx` | The time-series chart (lazy-loaded; owns axes/grid/cursor/overlays) |
| `sparkline-chart.tsx` | Bare trend glyph for stat tiles (lazy-loaded) |
| `metric-chart.tsx` | Lazy boundaries (`MetricChart`, `MetricSparkline`), the only eager imports |
| `chart-range-picker.tsx` | Segmented trailing-window control (panel-level, never per-chart) |
| `@/lib/chart-scale.ts` | Y-tick engine: 1-2-5 decimal ladder + binary (1024) ladder, d3-style rounding, domain pinned to top tick |
| `@/lib/chart-time.ts` | X-tick engine: local-calendar-aligned minute/hour/midnight ticks, range-adaptive labels |

Portability rule: nothing in this directory (or the 2 `chart-*` libraries) may
import app modules (`lib/metrics`, protogen, hooks). App code adapts its data
into `ChartRow[]`/`ChartSeries[]` and passes formatters in.

## Invariants (do not regress)

- **Locale**: all chart numbers and time labels pin `en-US` + 24h clock. A
  floating locale renders "48,8" next to "1.2K" on 1 screen; en-US default
  12h clock triples x-label width.
- **Ticks are generated, never delegated**: chart-library generators can produce
  fractional steps that duplicate after formatting ("0, 1, 2, 2") and overshoot
  domains (105% on a ratio). Byte axes use the binary ladder so labels stay
  whole as the 1024-based formatter rolls through KB/MB/GB.
- **2 formatter grades**: axis = compact (`12.3K`), tooltip = detailed
  (`12,345`). The tick-step and the formatter must agree or labels collide.
- **Dash = context, never measurement**: dashed strokes are reserved for the
  previous-period overlay and threshold/limit lines. The grid is solid
  border-token chrome (explicit opacity 1; the library default 0.11 makes it
  invisible) with no axis rules; the hover crosshair is dashed
  foreground at 40%.
- **Gaps stay gaps** (`null` remains in each mark's value channel): probe outages and counter
  resets must be visible, never bridged.
- **Color follows the entity**: series keep their `--chart-N` token across
  filters/refetches; the previous-period overlay uses the SAME hue as its
  live series (translucent + dashed), never gray.
- **Honest empty/loading states**: hold the previous render dimmed on refetch
  (`isRefreshing`); never resurrect an empty chart from its overlay.
- **Axis modes**: `gutter` (default, auto-sized guide) or `inset`
  (labels inside the plot on a surface-colored halo for full-bleed plots).
  Edge x-labels anchor inward in both modes.

## Extension points

`MetricTimeChart` props: `variant` (`auto`/`area`/`line`/`stacked`),
`thresholds` (dashed reference lines, optional `extendDomain`), `domain` (pin x
to a queried window), `yDomain` (fixed bounded scales like ratios),
`yTickBase` (10 | 1024), `yAxisMode`, `formatDetailedValue`.

## Backlog (researched, not yet built)

Prioritized from the 2026-07 research pass (Grafana/Datadog/Axiom/d3 audits):
1. Soft-min/soft-max axis bounds (fixes axes that stay at 0 and sparkline noise
   magnification).
2. Value-bearing legend (min/max/avg/current per series) and click-to-isolate,
   needed when by-application multi-series charts land.
3. Event/annotation markers (stats_reset discontinuities, deploys).
4. Partial-last-bucket shading (backend knows per-bucket coverage seconds).
5. Time-window permalinks (anchor + range in URL search params).
6. `d3-time` adoption for tick intervals when ranges grow past 7d (month/year
   boundaries can't be faked with fixed-ms strides); it is already in the
   dependency graph through TanStack Charts.
7. Bar/histogram/percentile-band and stat-tile (value + muted unit suffix)
   chart types; a Grafana-style parts-model unit formatter
   (`{text, suffix}`) is designed and ready to vendor (Apache-2.0) when these
   land.
8. Grid-mismatch guard in data merging: series with different bucket steps
   currently interleave into disconnected dots; today all merged series share
   a step by construction. Assert or resample when that stops holding.
