# Chart kit

A reusable, app-agnostic charting layer over Recharts 3 for monitoring-style
data: time-series line/area/stacked charts, sparklines, and the axis/tooltip/
legend machinery around them. The goal is that every chart in Querylane —
and eventually charts outside it — renders through this kit rather than
hand-assembled Recharts.

## Modules

| Module | Role |
|---|---|
| `chart-context.ts` | Kit types (`ChartRow`, `ChartSeries`, `ChartThreshold`) + React context feeding tooltip/legend |
| `chart-container.tsx` | Mounting frame: responsive sizing, legend, refresh-dimming, inset-axis halo hook |
| `chart-tooltip.tsx` | Shared tooltip: timestamp header, one row per series, full-precision values |
| `chart-axis-tick.tsx` | Edge-aware x-tick: first/last labels anchor inward so they never clip |
| `metric-time-chart.tsx` | The time-series chart (lazy-loaded; owns axes/grid/cursor/overlays) |
| `sparkline-chart.tsx` | Bare trend glyph for stat tiles (lazy-loaded) |
| `metric-chart.tsx` | Lazy boundaries (`MetricChart`, `MetricSparkline`) — the only eager imports |
| `chart-range-picker.tsx` | Segmented trailing-window control (panel-level, never per-chart) |
| `@/lib/chart-scale.ts` | Y-tick engine: 1-2-5 decimal ladder + binary (1024) ladder, d3-style rounding, domain pinned to top tick |
| `@/lib/chart-time.ts` | X-tick engine: local-calendar-aligned minute/hour/midnight ticks, range-adaptive labels |

Portability rule: nothing in this directory (or the two `chart-*` libs) may
import app modules (`lib/metrics`, protogen, hooks). App code adapts its data
into `ChartRow[]`/`ChartSeries[]` and passes formatters in.

## Invariants (do not regress)

- **Locale**: all chart numbers and time labels pin `en-US` + 24h clock. A
  floating locale renders "48,8" next to "1.2K" on one screen; en-US default
  12h clock triples x-label width.
- **Ticks are generated, never delegated**: Recharts' generators produce
  fractional steps that duplicate after formatting ("0, 1, 2, 2") and overshoot
  domains (105% on a ratio). Byte axes use the binary ladder so labels stay
  whole as the 1024-based formatter rolls through KB/MB/GB.
- **Two formatter grades**: axis = compact (`12.3K`), tooltip = detailed
  (`12,345`). The tick-step and the formatter must agree or labels collide.
- **Dash = context, never measurement**: dashed strokes are reserved for the
  previous-period overlay and threshold/limit lines. The grid is dashed-faint
  chrome; the hover crosshair is dashed foreground at 40%.
- **Gaps stay gaps** (`connectNulls={false}`): probe outages and counter
  resets must be visible, never bridged.
- **Color follows the entity**: series keep their `--chart-N` token across
  filters/refetches; the previous-period overlay uses the SAME hue as its
  live series (translucent + dashed), never gray.
- **Honest empty/loading states**: hold the previous render dimmed on refetch
  (`isRefreshing`); never resurrect an empty chart via its overlay.
- **Axis modes**: `gutter` (default, auto-width right column) or `inset`
  (labels inside the plot on a surface-colored halo — full-bleed plots).
  Edge x-labels anchor inward in both modes.

## Extension points

`MetricTimeChart` props: `variant` (`auto`/`area`/`line`/`stacked`),
`thresholds` (dashed reference lines, optional `extendDomain`), `syncId`
(shared crosshair across charts), `domain` (pin x to a queried window),
`yDomain` (fixed bounded scales like ratios), `yTickBase` (10 | 1024),
`yAxisMode`, `formatDetailedValue`.

## Backlog (researched, not yet built)

Prioritized from the 2026-07 research pass (Grafana/Datadog/Axiom/d3 audits):
1. Soft-min/soft-max axis bounds (fixes all-zero axes + sparkline noise
   magnification).
2. Value-bearing legend (min/max/avg/current per series) + click-to-isolate —
   needed when by-application multi-series charts land.
3. Event/annotation markers (stats_reset discontinuities, deploys).
4. Partial-last-bucket shading (backend knows per-bucket coverage seconds).
5. Time-window permalinks (anchor + range in URL search params).
6. `d3-time` adoption for tick intervals when ranges grow past 7d (month/year
   boundaries can't be faked with fixed-ms strides); it is already in the
   dependency graph via recharts.
7. Bar/histogram/percentile-band and stat-tile (value + muted unit suffix)
   chart types; a Grafana-style parts-model unit formatter
   (`{text, suffix}`) is designed and ready to vendor (Apache-2.0) when these
   land.
8. Grid-mismatch guard in data merging: series with different bucket steps
   currently interleave into disconnected dots; today all merged series share
   a step by construction — assert or resample when that stops holding.
