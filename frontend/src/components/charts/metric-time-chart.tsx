import {
  areaY,
  crosshair,
  defineChart,
  lineY,
  ruleY,
  stack,
  text,
} from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useId } from "react";
import { ChartContainer } from "@/components/charts/chart-container";
import type {
  ChartRow,
  ChartSeries,
  ChartThreshold,
  MetricTimeChartVariant,
} from "@/components/charts/chart-context";
import { ResponsiveChart } from "@/components/charts/responsive-chart";
import { type ChartTickBase, niceAxisTicks } from "@/lib/chart-scale";
import {
  buildTimeTicks,
  formatTimeTick,
  formatTooltipTime,
} from "@/lib/chart-time";

interface MetricTimeChartProps {
  data: ChartRow[];
  /** Pins the x-axis to a fixed epoch-ms window. Defaults to the data extent. */
  domain?: [number, number] | undefined;
  /** Full-precision tooltip formatter; defaults to `formatValue`. */
  formatDetailedValue?: ((value: number) => string) | undefined;
  /** Formats a raw value for the y-axis and legend (compact). */
  formatValue: (value: number) => string;
  isRefreshing?: boolean | undefined;
  series: ChartSeries[];
  showLegend?: boolean | undefined;
  thresholds?: ChartThreshold[] | undefined;
  variant?: MetricTimeChartVariant | undefined;
  /** `inset` trades the gutter axis for labels inside the plot. */
  yAxisMode?: "gutter" | "inset" | undefined;
  /** Fixed y-axis bounds for naturally bounded metrics such as ratios. */
  yDomain?: [number, number] | undefined;
  /** Use 1024 for byte-based ticks; defaults to decimal steps. */
  yTickBase?: ChartTickBase | undefined;
}

interface MetricDatum {
  seriesKey: string;
  time: number;
  value: number | null;
}

const INSET_CHART_MARGIN = { bottom: 28, left: 8, right: 4, top: 18 };
const AREA_FILL_TOP_OPACITY = 0.16;
const STACKED_FILL_OPACITY = 0.3;
const DASHED_STROKE = "4 4";
const SOLID_STROKE_WIDTH = 2;
const DASHED_STROKE_WIDTH = 1.5;
const DASHED_STROKE_OPACITY = 0.55;
const Y_DOMAIN_SEGMENTS = 4;
const INITIAL_HEIGHT = 200;
const INITIAL_WIDTH = 320;

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

function rowsForSeries(data: ChartRow[], seriesKey: string): MetricDatum[] {
  return data.map((row) => ({
    seriesKey,
    time: row.time,
    value: row[seriesKey] ?? null,
  }));
}

function resolveValueAxis({
  data,
  drawMode,
  series,
  thresholds,
  yDomain,
  yTickBase,
}: {
  data: ChartRow[];
  drawMode: "area" | "line" | "stacked";
  series: ChartSeries[];
  thresholds: ChartThreshold[] | undefined;
  yDomain: [number, number] | undefined;
  yTickBase: ChartTickBase;
}): { domain: [number, number]; ticks: number[] } {
  if (yDomain) {
    return { domain: yDomain, ticks: evenTicks(yDomain) };
  }

  const ticks = niceAxisTicks(
    yAxisMax({ data, series, stacked: drawMode === "stacked", thresholds }),
    yTickBase
  ) ?? [0, 1];
  return { domain: [0, ticks.at(-1) ?? 1], ticks };
}

/**
 * A themed, responsive TanStack time-series chart. App-owned tick generation,
 * formatters, colors, missing-value gaps, thresholds, overlays, and legends
 * remain stable while TanStack owns the accessible SVG and interaction model.
 */
function MetricTimeChart({
  data,
  domain,
  formatDetailedValue,
  formatValue,
  isRefreshing,
  series,
  showLegend,
  thresholds,
  variant = "auto",
  yAxisMode = "gutter",
  yDomain,
  yTickBase = 10,
}: MetricTimeChartProps) {
  const gradientPrefix = useId().replaceAll(/[^a-zA-Z0-9_-]/g, "");
  const [minMs, maxMs] = domain ?? extentOf(data);
  const spanMs = maxMs - minMs;
  const timeTicks = buildTimeTicks(minMs, maxMs);
  const solidSeries = series.filter((item) => !item.dashed);
  const dashedSeries = series.filter((item) => item.dashed);
  const drawMode = resolveVariant(variant, solidSeries.length);
  const { domain: valueDomain, ticks: valueTicks } = resolveValueAxis({
    data,
    drawMode,
    series,
    thresholds,
    yDomain,
    yTickBase,
  });
  const detailedValue = formatDetailedValue ?? formatValue;
  const seriesOrder = new Map(
    series.map((item, index) => [item.key, index] as const)
  );
  const seriesByKey = new Map(series.map((item) => [item.key, item] as const));
  const gradients =
    drawMode === "area"
      ? solidSeries.map((item) => ({
          id: `${gradientPrefix}-${item.key}`,
          stops: [
            { color: item.color, offset: 0, opacity: 0 },
            { color: item.color, offset: 1, opacity: AREA_FILL_TOP_OPACITY },
          ],
        }))
      : [];

  const solidMarks =
    drawMode === "stacked"
      ? [
          areaY(
            solidSeries.flatMap((item) => rowsForSeries(data, item.key)),
            {
              fill: (row) =>
                seriesByKey.get(row.seriesKey)?.color ?? "currentColor",
              fillOpacity: STACKED_FILL_OPACITY,
              id: "stacked-series",
              key: (row) => `${row.seriesKey}-${row.time}`,
              layout: stack({ order: solidSeries.map((item) => item.key) }),
              strokeWidth: 0,
              x: "time",
              y: "value",
              z: "seriesKey",
            }
          ),
        ]
      : solidSeries.flatMap((item) => {
          const rows = rowsForSeries(data, item.key);
          if (drawMode === "line") {
            return [
              lineY(rows, {
                id: item.key,
                key: (row) => `${row.seriesKey}-${row.time}`,
                stroke: item.color,
                strokeWidth: SOLID_STROKE_WIDTH,
                x: "time",
                y: "value",
              }),
            ];
          }
          return [
            areaY(rows, {
              fill: `url(#${gradientPrefix}-${item.key})`,
              id: `${item.key}-fill`,
              key: (row) => `${row.seriesKey}-${row.time}`,
              strokeWidth: 0,
              x: "time",
              y: "value",
            }),
            lineY(rows, {
              id: `${item.key}-stroke`,
              key: (row) => `${row.seriesKey}-${row.time}`,
              stroke: item.color,
              strokeWidth: SOLID_STROKE_WIDTH,
              x: "time",
              y: "value",
            }),
          ];
        });
  const contextMarks = dashedSeries.map((item) =>
    lineY(rowsForSeries(data, item.key), {
      id: item.key,
      key: (row) => `${row.seriesKey}-${row.time}`,
      stroke: item.color,
      strokeDasharray: DASHED_STROKE,
      strokeOpacity: DASHED_STROKE_OPACITY,
      strokeWidth: DASHED_STROKE_WIDTH,
      x: "time",
      y: "value",
    })
  );
  const thresholdRules = (thresholds ?? []).map((threshold) =>
    decorative(
      ruleY([threshold.value], {
        id: `threshold-${threshold.value}`,
        stroke: thresholdColor(threshold.tone),
        strokeDasharray: DASHED_STROKE,
      })
    )
  );
  const thresholdLabels = (thresholds ?? []).flatMap((threshold) =>
    threshold.label === undefined
      ? []
      : [
          decorative(
            text(
              [
                {
                  label: threshold.label,
                  time: maxMs,
                  value: threshold.value,
                },
              ],
              {
                anchor: "end",
                dx: -4,
                dy: -6,
                fill: "var(--color-muted-foreground)",
                fontSize: 10,
                id: `threshold-label-${threshold.value}`,
                text: "label",
                x: "time",
                y: "value",
              }
            )
          ),
        ]
  );
  const insetLabels =
    yAxisMode === "inset"
      ? valueTicks.map((value) =>
          decorative(
            text([{ label: formatValue(value), time: maxMs, value }], {
              anchor: "end",
              dx: -4,
              dy: -5,
              fill: "var(--color-muted-foreground)",
              fontSize: 10,
              id: `value-label-${value}`,
              text: "label",
              x: "time",
              y: "value",
            })
          )
        )
      : [];
  const definition = defineChart({
    chart: () => ({
      gradients,
      marks: [
        ...solidMarks,
        ...contextMarks,
        ...thresholdRules,
        ...thresholdLabels,
        ...insetLabels,
        crosshair({
          marker: {
            fill: "var(--color-card)",
            radius: 4,
            stroke: "var(--color-foreground)",
            strokeWidth: 2,
          },
          x: {
            stroke: "var(--color-foreground)",
            strokeDasharray: DASHED_STROKE,
            strokeOpacity: 0.4,
          },
          y: false,
        }),
      ],
      ...(yAxisMode === "inset" ? { margin: INSET_CHART_MARGIN } : {}),
      theme: {
        background: "transparent",
        foreground: "var(--color-foreground)",
        grid: "var(--color-border)",
        muted: "var(--color-muted-foreground)",
        palette: series.map((item) => item.color),
      },
      x: {
        axis: {
          line: false,
          tickLabels: {
            anchor: ({ index }) => {
              if (index === 0) {
                return "start";
              }
              return index === timeTicks.length - 1 ? "end" : "middle";
            },
            thin: false,
          },
          ticks: {
            format: (value) => formatTimeTick(value, spanMs),
            padding: 8,
            size: 0,
            values: timeTicks,
          },
        },
        scale: scaleLinear().domain([minMs, maxMs]),
      },
      y: {
        axis:
          yAxisMode === "inset"
            ? false
            : {
                line: false,
                ticks: {
                  format: formatValue,
                  padding: 6,
                  size: 0,
                  values: valueTicks,
                },
              },
        grid: true,
        scale: scaleLinear().domain(valueDomain),
      },
    }),
    focus: "group-x",
    focusRing: false,
    keyboard: true,
    tooltip: {
      anchor: "group-center",
      className: "querylane-chart-tooltip",
      content: (points) => {
        const valueBySeries = new Map(
          points.map((point) => [point.datum.seriesKey, point.datum.value])
        );
        const time = points[0]?.xValue;
        return {
          ...(typeof time === "number"
            ? { title: formatTooltipTime(time) }
            : {}),
          rows: series.map((item) => {
            const value = valueBySeries.get(item.key);
            return {
              color: item.color,
              label: item.label,
              value: typeof value === "number" ? detailedValue(value) : "–",
            };
          }),
        };
      },
      offset: 8,
      placement: ["top", "right", "left", "bottom"],
      sort: (left, right) =>
        (seriesOrder.get(left.datum.seriesKey) ?? Number.MAX_SAFE_INTEGER) -
        (seriesOrder.get(right.datum.seriesKey) ?? Number.MAX_SAFE_INTEGER),
      sticky: false,
      use: tooltip,
    },
  });

  return (
    <ChartContainer
      className="cursor-crosshair"
      isRefreshing={isRefreshing}
      series={series}
      showLegend={showLegend}
    >
      <ResponsiveChart
        ariaLabel="Metric time series"
        definition={definition}
        initialHeight={INITIAL_HEIGHT}
        initialWidth={INITIAL_WIDTH}
      />
    </ChartContainer>
  );
}

export { MetricTimeChart };
