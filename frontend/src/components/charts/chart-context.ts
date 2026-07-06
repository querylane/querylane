import { createContext, useContext } from "react";

/**
 * A charting row: a timestamp (epoch ms) plus one value per series key; null
 * marks a gap the chart must not bridge.
 */
export type ChartRow = { time: number } & Record<string, number | null>;

/**
 * One drawn series: `color` paints SVG marks (stroke/fill/gradients) and
 * `dotClassName` paints HTML swatches (legend keys, tooltip indicators), both
 * from the same `--chart-N` token so light/dark stays automatic. Colors follow
 * the entity across filters and refetches — never reassign by rank.
 */
export interface ChartSeries {
  /** CSS color for SVG marks, e.g. `var(--color-chart-1)`. */
  color: string;
  /**
   * Draws this series as a dashed reference line with no fill — for context
   * series like a previous-period overlay. Dashed series don't count toward
   * the area-vs-line variant choice, so a lone real series keeps its fill.
   */
  dashed?: boolean;
  /** Tailwind background utility for swatches, e.g. `bg-chart-1`. */
  dotClassName: string;
  /** dataKey into each chart row. */
  key: string;
  label: string;
}

export interface ChartContextValue {
  /**
   * Tooltip-grade formatter: full precision, because the reader hovering a
   * point wants the exact number. Falls back to `formatValue`.
   */
  formatDetailedValue: (value: number) => string;
  /** Axis-grade formatter: compact, may abbreviate ("12.3K"). */
  formatValue: (value: number) => string;
  series: ChartSeries[];
}

/**
 * How a time chart draws its series. `auto` picks the honest default: a
 * gradient area for a single series, overlaid lines for several (overlapping
 * fills hide each other), and `stacked` is opt-in for part-to-whole breakdowns.
 */
export type MetricTimeChartVariant = "area" | "auto" | "line" | "stacked";

/** A horizontal reference drawn behind the series, e.g. a configured limit. */
export interface ChartThreshold {
  /**
   * Stretch the y-domain so the threshold is always visible. Off by default:
   * a far-away limit (e.g. max_connections at 100 over a series near 6) would
   * flatten the data; without it the line simply appears once values approach.
   */
  extendDomain?: boolean;
  label?: string;
  /** `critical` draws in the destructive color; `neutral` in muted ink. */
  tone?: "critical" | "neutral";
  value: number;
}

export const ChartContext = createContext<ChartContextValue | null>(null);

/** Series config + value formatter for tooltip/legend content components. */
export function useChartContext(): ChartContextValue {
  const context = useContext(ChartContext);
  if (!context) {
    throw new Error("useChartContext must be used within a <ChartContainer>");
  }

  return context;
}
