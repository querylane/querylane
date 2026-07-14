import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EdgeAwareTimeTick,
  InsetValueTick,
} from "@/components/charts/chart-axis-tick";
import { ChartContainer } from "@/components/charts/chart-container";
import type {
  ChartRow,
  ChartSeries,
  ChartThreshold,
  MetricTimeChartVariant,
} from "@/components/charts/chart-context";
import { ChartTooltipContent } from "@/components/charts/chart-tooltip";
import { type ChartTickBase, niceAxisTicks } from "@/lib/chart-scale";
import { buildTimeTicks, formatTimeTick } from "@/lib/chart-time";

interface MetricTimeChartProps {
  data: ChartRow[];
  /**
   * Pins the x-axis to a fixed window (epoch ms) so sparse data reads
   * honestly and side-by-side charts align. Defaults to the data extent.
   */
  domain?: [number, number] | undefined;
  /** Full-precision tooltip formatter; defaults to `formatValue`. */
  formatDetailedValue?: ((value: number) => string) | undefined;
  /** Formats a raw value for the y-axis and legend (compact). */
  formatValue: (value: number) => string;
  isRefreshing?: boolean | undefined;
  series: ChartSeries[];
  showLegend?: boolean | undefined;
  /** Charts sharing a syncId share crosshair + tooltip position by time. */
  syncId?: string | undefined;
  thresholds?: ChartThreshold[] | undefined;
  variant?: MetricTimeChartVariant | undefined;
  /**
   * `gutter` (default) reserves a right-side column for y-labels; `inset`
   * draws them INSIDE the plot on a surface-colored halo, so the plot spans
   * the full container width (dashboard-dense look). Inset labels sit just
   * above their gridline and stay legible over data via the halo.
   */
  yAxisMode?: "gutter" | "inset" | undefined;
  /**
   * Fixed y-axis bounds with evenly divided ticks, for metrics on a naturally
   * bounded scale (a ratio is `[0, 1]`). Without it Recharts "nices" the auto
   * domain past the data — a 105% tick on a hit ratio that cannot exceed 100%.
   */
  yDomain?: [number, number] | undefined;
  /**
   * Pass 1024 for byte-based units so auto ticks land on binary boundaries
   * (0 / 50 KB / 100 KB / 150 KB) instead of decimal steps the 1024-based
   * formatter would render as "48,8 KB". Defaults to decimal steps.
   */
  yTickBase?: ChartTickBase | undefined;
}

const CHART_MARGIN = { bottom: 4, left: 8, right: 8, top: 8 };
// Inset labels render above the top gridline, so the plot needs headroom.
const INSET_CHART_MARGIN = { bottom: 4, left: 0, right: 4, top: 18 };
const Y_AXIS_TICK_COUNT = 4;
const AREA_FILL_TOP_OPACITY = 0.16;
const STACKED_FILL_OPACITY = 0.3;
const ACTIVE_DOT = { r: 4, stroke: "var(--color-card)", strokeWidth: 2 };
const GRID_DASH = "3 3";
/**
 * The hover crosshair: a dashed hairline in half-strength foreground ink —
 * strong enough to read as a crosshair (a border-colored line disappears),
 * dashed so it never impersonates a data series (Grafana/Axiom convention).
 */
const CURSOR = {
  stroke: "var(--color-foreground)",
  strokeDasharray: "4 4",
  strokeOpacity: 0.4,
};
const DASHED_STROKE = "4 4";
const SOLID_STROKE_WIDTH = 2;
const DASHED_STROKE_WIDTH = 1.5;
/** Dashed context series render translucent so the live series stays primary. */
const DASHED_STROKE_OPACITY = 0.55;
/** Fixed-yDomain axes divide into quarters: 0 / 25 / 50 / 75 / 100%. */
const Y_DOMAIN_SEGMENTS = 4;

function extentOf(data: ChartRow[]): [number, number] {
  const first = data[0]?.time ?? 0;
  const last = data.at(-1)?.time ?? first;
  return [first, last];
}

/** A row's largest y-value: the stack sum in stacked mode, else the max. */
function rowMax(
  row: ChartRow,
  series: ChartSeries[],
  stacked: boolean
): number {
  let max = 0;
  let stackSum = 0;
  for (const item of series) {
    const value = row[item.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    if (stacked && !item.dashed) {
      stackSum += value;
    } else {
      max = Math.max(max, value);
    }
  }

  return Math.max(max, stackSum);
}

/**
 * The largest value the y-axis must cover: the data's finite max (stack sums
 * in stacked mode, per-series values otherwise) plus any threshold that is
 * allowed to extend the domain.
 */
function yAxisMax({
  data,
  series,
  stacked,
  thresholds,
}: {
  data: ChartRow[];
  series: ChartSeries[];
  stacked: boolean;
  thresholds: ChartThreshold[] | undefined;
}): number {
  let max = 0;
  for (const row of data) {
    max = Math.max(max, rowMax(row, series, stacked));
  }
  for (const threshold of thresholds ?? []) {
    if (threshold.extendDomain) {
      max = Math.max(max, threshold.value);
    }
  }

  return max;
}

/** Evenly spaced ticks across a fixed domain, endpoints included. */
function evenTicks([min, max]: [number, number]): number[] {
  const step = (max - min) / Y_DOMAIN_SEGMENTS;
  return Array.from(
    { length: Y_DOMAIN_SEGMENTS + 1 },
    (_, index) => min + index * step
  );
}

function resolveVariant(
  variant: MetricTimeChartVariant,
  seriesCount: number
): "area" | "line" | "stacked" {
  if (variant !== "auto") {
    return variant;
  }

  return seriesCount === 1 ? "area" : "line";
}

function thresholdColor(tone: ChartThreshold["tone"]): string {
  return tone === "critical"
    ? "var(--color-destructive)"
    : "var(--color-muted-foreground)";
}

function MetricArea({
  drawMode,
  gradientId,
  item,
}: {
  drawMode: MetricTimeChartVariant;
  gradientId: string;
  item: ChartSeries;
}) {
  const stacked = drawMode === "stacked" && !item.dashed;
  return (
    <Area
      activeDot={ACTIVE_DOT}
      connectNulls={false}
      dataKey={item.key}
      dot={false}
      fill={stacked ? item.color : `url(#${gradientId}-${item.key})`}
      fillOpacity={stacked ? STACKED_FILL_OPACITY : 1}
      isAnimationActive={false}
      {...(stacked ? { stackId: "stack" } : {})}
      {...(item.dashed ? { strokeDasharray: DASHED_STROKE } : {})}
      stroke={item.color}
      strokeOpacity={item.dashed ? DASHED_STROKE_OPACITY : 1}
      strokeWidth={item.dashed ? DASHED_STROKE_WIDTH : SOLID_STROKE_WIDTH}
      type="linear"
    />
  );
}

/**
 * A themed time-series chart on a continuous time axis: calendar-aligned ticks
 * (whole minutes/hours/local midnights), range-adaptive labels, a solid
 * hairline grid, a crosshair tooltip listing every series, and gradient fills
 * from the `--chart-*` tokens. Gaps (null) break the line so probe outages
 * stay visible. This module is intentionally heavy (Recharts) and lazy-loaded.
 */
function MetricTimeChart({
  data,
  domain,
  formatDetailedValue,
  formatValue,
  isRefreshing,
  series,
  showLegend,
  syncId,
  thresholds,
  variant = "auto",
  yAxisMode = "gutter",
  yDomain,
  yTickBase = 10,
}: MetricTimeChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const [minMs, maxMs] = domain ?? extentOf(data);
  const spanMs = maxMs - minMs;
  const ticks = buildTimeTicks(minMs, maxMs);
  // Dashed context series (previous-period overlays) don't count: a lone real
  // series keeps its area fill even with an overlay beside it.
  const solidSeriesCount = series.filter((item) => !item.dashed).length;
  const drawMode = resolveVariant(variant, solidSeriesCount);
  const hasGradientFill = drawMode === "area";
  const autoTicks = yDomain
    ? null
    : niceAxisTicks(
        yAxisMax({ data, series, stacked: drawMode === "stacked", thresholds }),
        yTickBase
      );
  const autoTop = autoTicks?.at(-1);

  return (
    <ChartContainer
      className="cursor-crosshair"
      formatDetailedValue={formatDetailedValue}
      formatValue={formatValue}
      insetValueAxis={yAxisMode === "inset"}
      isRefreshing={isRefreshing}
      series={series}
      showLegend={showLegend}
    >
      <AreaChart
        data={data}
        margin={yAxisMode === "inset" ? INSET_CHART_MARGIN : CHART_MARGIN}
        {...(syncId === undefined
          ? {}
          : { syncId, syncMethod: "value" as const })}
      >
        <defs>
          {series.map((item) => (
            <linearGradient
              id={`${gradientId}-${item.key}`}
              key={item.key}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={item.color}
                stopOpacity={
                  hasGradientFill && !item.dashed ? AREA_FILL_TOP_OPACITY : 0
                }
              />
              <stop offset="100%" stopColor={item.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          stroke="var(--color-border)"
          strokeDasharray={GRID_DASH}
          vertical={false}
        />
        <XAxis
          axisLine={false}
          dataKey="time"
          domain={[minMs, maxMs]}
          scale="time"
          tick={
            <EdgeAwareTimeTick
              formatter={(value: number) => formatTimeTick(value, spanMs)}
            />
          }
          tickLine={false}
          tickMargin={8}
          ticks={ticks}
          type="number"
        />
        <Tooltip
          content={<ChartTooltipContent />}
          cursor={CURSOR}
          isAnimationActive={false}
        />
        {thresholds?.map((threshold) => (
          <ReferenceLine
            ifOverflow={threshold.extendDomain ? "extendDomain" : "discard"}
            key={threshold.value}
            stroke={thresholdColor(threshold.tone)}
            strokeDasharray="4 4"
            y={threshold.value}
            {...(threshold.label === undefined
              ? {}
              : {
                  label: {
                    fill: "var(--color-muted-foreground)",
                    fontSize: 10,
                    position: "insideTopRight" as const,
                    value: threshold.label,
                  },
                })}
          />
        ))}
        {series.map((item) => (
          <MetricArea
            drawMode={drawMode}
            gradientId={gradientId}
            item={item}
            key={item.key}
          />
        ))}
        {/* Declared AFTER the series: Recharts paints in JSX order, and inset
            labels live inside the plot, so the axis must sit on top of the
            data (its surface halo then punches out whatever runs beneath).
            Layout is unaffected by declaration order. */}
        <YAxis
          axisLine={false}
          orientation="right"
          tickFormatter={(value: number) => formatValue(value)}
          tickLine={false}
          {...(yAxisMode === "inset"
            ? {
                mirror: true,
                tick: (
                  <InsetValueTick
                    formatter={(value: number) => formatValue(value)}
                  />
                ),
                width: 1,
              }
            : { tickMargin: 6, width: "auto" as const })}
          {...(yDomain ? { domain: yDomain, ticks: evenTicks(yDomain) } : {})}
          {...(!yDomain && autoTicks && autoTop !== undefined
            ? { domain: [0, autoTop] as [number, number], ticks: autoTicks }
            : {})}
          {...(yDomain || autoTicks ? {} : { tickCount: Y_AXIS_TICK_COUNT })}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export { MetricTimeChart };
