import { areaY, defineChart, lineY } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useId } from "react";
import type { ChartRow } from "@/components/charts/chart-context";
import { ResponsiveChart } from "@/components/charts/responsive-chart";
import { downsampleTrend } from "@/lib/chart-data";

interface SparklineChartProps {
  /** CSS color for the stroke/fill, for example `var(--color-chart-1)`. */
  color: string;
  data: ChartRow[];
  seriesKey: string;
}

interface SparklineDatum {
  time: number;
  value: number | null;
}

const SPARK_FILL_TOP_OPACITY = 0.14;
const SPARK_INITIAL_HEIGHT = 48;
const SPARK_INITIAL_WIDTH = 160;
const SPARK_MAX_POINTS = 36;
const FLAT_SERIES_PADDING_RATIO = 0.01;
const MINIMUM_FLAT_SERIES_PADDING = 1;

function finiteExtent(data: SparklineDatum[]): [number, number] {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const row of data) {
    if (typeof row.value === "number" && Number.isFinite(row.value)) {
      minimum = Math.min(minimum, row.value);
      maximum = Math.max(maximum, row.value);
    }
  }
  if (!(Number.isFinite(minimum) && Number.isFinite(maximum))) {
    return [0, 1];
  }
  if (minimum === maximum) {
    const padding = Math.max(
      Math.abs(minimum) * FLAT_SERIES_PADDING_RATIO,
      MINIMUM_FLAT_SERIES_PADDING
    );
    return [minimum - padding, maximum + padding];
  }
  return [minimum, maximum];
}

/** A bare, parent-sized trend glyph with no guides or interaction chrome. */
function SparklineChart({ color, data, seriesKey }: SparklineChartProps) {
  const gradientId = `spark-${useId().replaceAll(/[^a-zA-Z0-9_-]/g, "")}`;
  const trend = downsampleTrend(data, seriesKey, SPARK_MAX_POINTS).map(
    (row): SparklineDatum => ({
      time: row.time,
      value: row[seriesKey] ?? null,
    })
  );
  const [minimum, maximum] = finiteExtent(trend);
  const firstTime = trend[0]?.time ?? 0;
  const lastTime = trend.at(-1)?.time ?? firstTime + 1;
  const definition = defineChart({
    focus: false,
    keyboard: false,
    pointer: false,
    chart: () => ({
      gradients: [
        {
          id: gradientId,
          stops: [
            { color, offset: 0, opacity: 0 },
            { color, offset: 1, opacity: SPARK_FILL_TOP_OPACITY },
          ],
        },
      ],
      guides: false,
      margin: 0,
      marks: [
        areaY(trend, {
          fill: `url(#${gradientId})`,
          id: "sparkline-fill",
          key: (row) => row.time,
          strokeWidth: 0,
          x: "time",
          y1: minimum,
          y2: "value",
        }),
        lineY(trend, {
          id: "sparkline-stroke",
          key: (row) => row.time,
          stroke: color,
          strokeWidth: 1.5,
          x: "time",
          y: "value",
        }),
      ],
      theme: {
        background: "transparent",
        foreground: color,
        grid: "transparent",
        muted: color,
        palette: [color],
      },
      x: { scale: scaleLinear().domain([firstTime, lastTime]) },
      y: { scale: scaleLinear().domain([minimum, maximum]) },
    }),
  });

  return (
    <ResponsiveChart
      ariaLabel="Metric trend"
      definition={definition}
      initialHeight={SPARK_INITIAL_HEIGHT}
      initialWidth={SPARK_INITIAL_WIDTH}
    />
  );
}

export { SparklineChart };
