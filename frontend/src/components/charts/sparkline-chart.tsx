import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ChartRow } from "@/components/charts/chart-context";
import { downsampleTrend } from "@/lib/chart-data";

interface SparklineChartProps {
  /** CSS color for the stroke/fill, e.g. `var(--color-chart-1)`. */
  color: string;
  data: ChartRow[];
  /** dataKey into each row. */
  seriesKey: string;
}

const SPARK_MARGIN = { bottom: 2, left: 0, right: 0, top: 2 };
const SPARK_FILL_TOP_OPACITY = 0.2;
const SPARK_INITIAL_DIMENSION = { height: 32, width: 96 };
/**
 * A trend glyph is ~90px wide; ~24 segments give 3-4px each. More reads as
 * pixel noise (a 1h window carries up to 240 raw buckets).
 */
const SPARK_MAX_POINTS = 24;

/**
 * A bare trend glyph for stat tiles and dense lists: one series, no axes, no
 * grid, no tooltip — the enclosing tile carries the value and label. Fills its
 * parent, so the parent constrains the size (e.g. `h-8 w-24`). Heavy
 * (Recharts); load via the lazy boundary in metric-chart.tsx.
 */
function SparklineChart({ color, data, seriesKey }: SparklineChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const trend = downsampleTrend(data, seriesKey, SPARK_MAX_POINTS);

  return (
    <ResponsiveContainer
      height="100%"
      initialDimension={SPARK_INITIAL_DIMENSION}
      width="100%"
    >
      <AreaChart data={trend} margin={SPARK_MARGIN}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={color}
              stopOpacity={SPARK_FILL_TOP_OPACITY}
            />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          domain={["dataMin", "dataMax"]}
          hide={true}
          scale="time"
          type="number"
        />
        <YAxis domain={["auto", "auto"]} hide={true} />
        <Area
          activeDot={false}
          connectNulls={false}
          dataKey={seriesKey}
          dot={false}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          stroke={color}
          strokeWidth={1.5}
          type="linear"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { SparklineChart };
