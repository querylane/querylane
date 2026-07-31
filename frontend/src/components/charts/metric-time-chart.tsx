import { RotateCcw } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
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
import { selectedDataDomain } from "@/components/charts/chart-zoom";
import { Button } from "@/components/ui/button";
import {
  type ChartTickBase,
  niceAxisRangeTicks,
  niceAxisTicks,
} from "@/lib/chart-scale";
import { buildTimeTicks, formatTimeTick } from "@/lib/chart-time";

interface MetricTimeChartProps {
  /** Disables Recharts keyboard semantics when the chart is a button preview. */
  accessibilityLayer?: boolean | undefined;
  /** Reduces chart chrome and tick density for narrow expanded views. */
  compact?: boolean | undefined;
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
   * `zero` (default) preserves absolute magnitude. `data` focuses the domain
   * around the visible values so small changes remain legible in analysis
   * views. Fixed domains and stacked charts always keep their own baseline.
   */
  yAxisScale?: "data" | "zero" | undefined;
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
  /** Enables horizontal drag selection that focuses the chart on a subset. */
  zoomable?: boolean | undefined;
}

const CHART_MARGIN = { bottom: 4, left: 8, right: 8, top: 8 };
// Inset labels render above the top gridline, so the plot needs headroom.
const INSET_CHART_MARGIN = { bottom: 4, left: 0, right: 4, top: 18 };
const Y_AXIS_TICK_COUNT = 4;
const COMPACT_TIME_TICK_COUNT = 3;
const COMPACT_VALUE_TICK_COUNT = 4;
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
const MIN_ZOOM_DRAG_PX = 8;

interface ChartDragSelection {
  currentMs: number;
  pointerId: number;
  startClientX: number;
  startMs: number;
}

interface MetricChartLayout {
  axisMode: "gutter" | "inset";
  maxTimeTicks: number | undefined;
  showLegend: boolean | undefined;
  valueAxisSegments: number;
  valueTickCount: number;
}

interface MetricValueAxisScale {
  domain?: [number, number];
  tickCount?: number;
  ticks?: number[];
}

function metricChartLayout({
  compact,
  showLegend,
  yAxisMode,
}: {
  compact: boolean;
  showLegend: boolean | undefined;
  yAxisMode: "gutter" | "inset";
}): MetricChartLayout {
  if (compact) {
    return {
      axisMode: "inset",
      maxTimeTicks: COMPACT_TIME_TICK_COUNT,
      showLegend: false,
      valueAxisSegments: COMPACT_VALUE_TICK_COUNT - 1,
      valueTickCount: COMPACT_VALUE_TICK_COUNT,
    };
  }

  return {
    axisMode: yAxisMode,
    maxTimeTicks: undefined,
    showLegend,
    valueAxisSegments: Y_DOMAIN_SEGMENTS,
    valueTickCount: Y_AXIS_TICK_COUNT,
  };
}

function extentOf(data: ChartRow[]): [number, number] {
  const first = data[0]?.time ?? 0;
  const last = data.at(-1)?.time ?? first;
  return [first, last];
}

function plotBounds(container: HTMLElement): DOMRect | null {
  const chart = container.querySelector(".recharts-wrapper");
  if (!(chart instanceof HTMLElement)) {
    return null;
  }

  const chartBounds = chart.getBoundingClientRect();
  const gridLine = chart.querySelector(
    ".recharts-cartesian-grid-horizontal line"
  );
  const surface = chart.querySelector("svg.recharts-surface");
  if (!(gridLine instanceof SVGElement && surface instanceof SVGElement)) {
    return chartBounds;
  }

  const x1 = Number(gridLine.getAttribute("x1"));
  const x2 = Number(gridLine.getAttribute("x2"));
  if (!(Number.isFinite(x1) && Number.isFinite(x2) && x2 > x1)) {
    return chartBounds;
  }

  const surfaceBounds = surface.getBoundingClientRect();
  return new DOMRect(
    surfaceBounds.left + x1,
    chartBounds.top,
    x2 - x1,
    chartBounds.height
  );
}

function timeAtPointer(
  container: HTMLElement,
  clientX: number,
  [minMs, maxMs]: [number, number]
): number | null {
  const bounds = plotBounds(container);
  if (!(bounds && bounds.width > 0)) {
    return null;
  }

  const ratio = Math.min(
    1,
    Math.max(0, (clientX - bounds.left) / bounds.width)
  );
  return minMs + (maxMs - minMs) * ratio;
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

/** Finite value extent, including thresholds explicitly allowed to extend it. */
function yAxisExtent({
  data,
  series,
  thresholds,
}: {
  data: ChartRow[];
  series: ChartSeries[];
  thresholds: ChartThreshold[] | undefined;
}): [number, number] | null {
  const dataValues = data.flatMap((row) =>
    series.flatMap((item) => {
      const value = row[item.key];
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    })
  );
  const thresholdValues = (thresholds ?? []).flatMap((threshold) =>
    threshold.extendDomain && Number.isFinite(threshold.value)
      ? [threshold.value]
      : []
  );
  const values = [...dataValues, ...thresholdValues];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max > min ? [min, max] : null;
}

/** Evenly spaced ticks across a fixed domain, endpoints included. */
function evenTicks(
  [min, max]: [number, number],
  segments: number = Y_DOMAIN_SEGMENTS
): number[] {
  const step = (max - min) / segments;
  return Array.from({ length: segments + 1 }, (_, index) => min + index * step);
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

function focusedValueAxisTicks({
  data,
  drawMode,
  formatValue,
  maxSegments,
  series,
  thresholds,
  yAxisScale,
  yDomain,
  yTickBase,
}: {
  data: ChartRow[];
  drawMode: "area" | "line" | "stacked";
  formatValue: (value: number) => string;
  maxSegments: number;
  series: ChartSeries[];
  thresholds: ChartThreshold[] | undefined;
  yAxisScale: "data" | "zero";
  yDomain: [number, number] | undefined;
  yTickBase: ChartTickBase;
}): number[] | null {
  if (yDomain || yAxisScale !== "data" || drawMode === "stacked") {
    return null;
  }

  const extent = yAxisExtent({ data, series, thresholds });
  if (!extent) {
    return null;
  }

  return niceAxisRangeTicks({
    formatValue,
    maxSegments,
    maxValue: extent[1],
    minValue: extent[0],
    tickBase: yTickBase,
  });
}

function resolveValueAxisScale({
  data,
  drawMode,
  formatValue,
  layout,
  series,
  thresholds,
  yAxisScaleMode,
  yDomain,
  yTickBase,
}: {
  data: ChartRow[];
  drawMode: "area" | "line" | "stacked";
  formatValue: (value: number) => string;
  layout: MetricChartLayout;
  series: ChartSeries[];
  thresholds: ChartThreshold[] | undefined;
  yAxisScaleMode: "data" | "zero";
  yDomain: [number, number] | undefined;
  yTickBase: ChartTickBase;
}): MetricValueAxisScale {
  if (yDomain) {
    return {
      domain: yDomain,
      ticks: evenTicks(yDomain, layout.valueAxisSegments),
    };
  }

  const focusedTicks = focusedValueAxisTicks({
    data,
    drawMode,
    formatValue,
    maxSegments: layout.valueAxisSegments,
    series,
    thresholds,
    yAxisScale: yAxisScaleMode,
    yDomain,
    yTickBase,
  });
  const focusedBottom = focusedTicks?.[0];
  const focusedTop = focusedTicks?.at(-1);
  if (focusedTicks && focusedBottom !== undefined && focusedTop !== undefined) {
    return {
      domain: [focusedBottom, focusedTop],
      ticks: focusedTicks,
    };
  }

  const autoTicks = niceAxisTicks(
    yAxisMax({
      data,
      series,
      stacked: drawMode === "stacked",
      thresholds,
    }),
    yTickBase,
    layout.valueAxisSegments
  );
  const autoTop = autoTicks?.at(-1);
  if (autoTicks && autoTop !== undefined) {
    return { domain: [0, autoTop], ticks: autoTicks };
  }

  return { tickCount: layout.valueTickCount };
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
  accessibilityLayer = true,
  compact = false,
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
  yAxisScale = "zero",
  yDomain,
  yTickBase = 10,
  zoomable = false,
}: MetricTimeChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const dragSelectionRef = useRef<ChartDragSelection | null>(null);
  const [dragSelection, setDragSelection] = useState<ChartDragSelection | null>(
    null
  );
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const fullDomain = domain ?? extentOf(data);
  const [minMs, maxMs] = zoomDomain ?? fullDomain;
  const visibleData = zoomDomain
    ? data.filter((row) => row.time >= minMs && row.time <= maxMs)
    : data;
  const spanMs = maxMs - minMs;
  const layout = metricChartLayout({ compact, showLegend, yAxisMode });
  const ticks = buildTimeTicks(minMs, maxMs, layout.maxTimeTicks);
  // Dashed context series (previous-period overlays) don't count: a lone real
  // series keeps its area fill even with an overlay beside it.
  const solidSeriesCount = series.filter((item) => !item.dashed).length;
  const drawMode = resolveVariant(variant, solidSeriesCount);
  const hasGradientFill = drawMode === "area";
  const selectionColor = series[0]?.color ?? "var(--color-chart-1)";
  const resolvedValueAxisScale = resolveValueAxisScale({
    data: visibleData,
    drawMode,
    formatValue,
    layout,
    series,
    thresholds,
    yAxisScaleMode: yAxisScale,
    yDomain,
    yTickBase,
  });

  function startZoomSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(zoomable && event.button === 0)) {
      return;
    }
    const { target } = event;
    if (!(target instanceof Element && target.closest(".recharts-wrapper"))) {
      return;
    }

    const startMs = timeAtPointer(event.currentTarget, event.clientX, [
      minMs,
      maxMs,
    ]);
    if (startMs === null) {
      return;
    }

    const selection = {
      currentMs: startMs,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startMs,
    };
    dragSelectionRef.current = selection;
    setDragSelection(selection);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateZoomSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const selection = dragSelectionRef.current;
    if (!(selection && selection.pointerId === event.pointerId)) {
      return;
    }

    const currentMs = timeAtPointer(event.currentTarget, event.clientX, [
      minMs,
      maxMs,
    ]);
    if (currentMs === null) {
      return;
    }

    const nextSelection = { ...selection, currentMs };
    dragSelectionRef.current = nextSelection;
    setDragSelection(nextSelection);
    event.preventDefault();
  }

  function finishZoomSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const selection = dragSelectionRef.current;
    if (!(selection && selection.pointerId === event.pointerId)) {
      return;
    }

    const currentMs = timeAtPointer(event.currentTarget, event.clientX, [
      minMs,
      maxMs,
    ]);
    dragSelectionRef.current = null;
    setDragSelection(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (
      currentMs === null ||
      Math.abs(event.clientX - selection.startClientX) < MIN_ZOOM_DRAG_PX
    ) {
      return;
    }

    const selectedDomain = selectedDataDomain({
      data: visibleData,
      firstMs: selection.startMs,
      secondMs: currentMs,
      series,
    });
    if (selectedDomain) {
      setZoomDomain(selectedDomain);
    }
  }

  function cancelZoomSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragSelectionRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragSelectionRef.current = null;
    setDragSelection(null);
  }

  return (
    <ChartContainer
      className={zoomable ? "cursor-crosshair touch-none" : "cursor-crosshair"}
      controls={
        zoomDomain ? (
          <>
            <Button
              aria-label="Reset zoom"
              className="absolute top-2 left-2 z-10 bg-background/90 shadow-sm backdrop-blur-sm"
              onClick={() => setZoomDomain(null)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" />
              Reset zoom
            </Button>
            <p aria-live="polite" className="sr-only" role="status">
              Chart zoomed. Reset zoom to show the full range.
            </p>
          </>
        ) : null
      }
      formatDetailedValue={formatDetailedValue}
      formatValue={formatValue}
      insetValueAxis={layout.axisMode === "inset"}
      isRefreshing={isRefreshing}
      onPointerCancel={cancelZoomSelection}
      onPointerDown={startZoomSelection}
      onPointerMove={updateZoomSelection}
      onPointerUp={finishZoomSelection}
      series={series}
      showLegend={layout.showLegend}
    >
      <AreaChart
        accessibilityLayer={accessibilityLayer}
        data={visibleData}
        margin={layout.axisMode === "inset" ? INSET_CHART_MARGIN : CHART_MARGIN}
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
          content={<ChartTooltipContent compact={compact} />}
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
        {dragSelection ? (
          <ReferenceArea
            fill={selectionColor}
            fillOpacity={0.2}
            ifOverflow="hidden"
            stroke={selectionColor}
            strokeOpacity={0.8}
            x1={dragSelection.startMs}
            x2={dragSelection.currentMs}
          />
        ) : null}
        {/* Declared AFTER the series: Recharts paints in JSX order, and inset
            labels live inside the plot, so the axis must sit on top of the
            data (its surface halo then punches out whatever runs beneath).
            Layout is unaffected by declaration order. */}
        <YAxis
          axisLine={false}
          orientation="right"
          tickFormatter={(value: number) => formatValue(value)}
          tickLine={false}
          {...(layout.axisMode === "inset"
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
          {...resolvedValueAxisScale}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export { MetricTimeChart };
