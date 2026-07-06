import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import {
  ChartContext,
  type ChartSeries,
} from "@/components/charts/chart-context";
import { cn } from "@/lib/utils";

/** First-paint size before ResizeObserver reports; avoids a blank flash. */
const INITIAL_DIMENSION = { height: 200, width: 320 };

/** A legend is the dependable identity channel for two or more series. */
const MIN_SERIES_FOR_LEGEND = 2;

function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {series.map((item) => (
        <div className="flex items-center gap-1.5" key={item.key}>
          <span
            aria-hidden="true"
            className={cn(
              "h-1 w-3.5 rounded-full",
              item.dotClassName,
              item.dashed && "opacity-50"
            )}
          />
          <span className="text-muted-foreground text-xs">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

interface ChartContainerProps {
  /** The Recharts chart element (AreaChart, BarChart, ...). */
  children: ReactElement;
  className?: string;
  /** Tooltip-grade full-precision formatter; defaults to `formatValue`. */
  formatDetailedValue?: ((value: number) => string) | undefined;
  formatValue: (value: number) => string;
  /**
   * Marks the container so index.css paints a surface-colored halo behind
   * inset y-axis labels, keeping them legible over the data.
   */
  insetValueAxis?: boolean | undefined;
  /**
   * Holds the previous render at reduced opacity while fresh data loads, so a
   * range change never flashes a skeleton or jumps layout.
   */
  isRefreshing?: boolean | undefined;
  series: ChartSeries[];
  /** Defaults to showing a legend for >= 2 series; a single series needs none. */
  showLegend?: boolean | undefined;
}

/**
 * The chart kit's mounting frame: provides series config + formatter to
 * tooltip/legend content via context, owns responsive sizing, and appends the
 * legend row. Recharts' hardcoded chrome colors are re-tokened by the
 * `[data-slot="chart"]` rules in index.css. Fills its parent, so the parent
 * constrains the height (e.g. `h-72`); the fixed height includes the axis band
 * and legend, never just the plot.
 */
function ChartContainer({
  children,
  className,
  formatDetailedValue,
  formatValue,
  insetValueAxis = false,
  isRefreshing = false,
  series,
  showLegend = series.length >= MIN_SERIES_FOR_LEGEND,
}: ChartContainerProps) {
  return (
    <ChartContext.Provider
      value={{
        formatDetailedValue: formatDetailedValue ?? formatValue,
        formatValue,
        series,
      }}
    >
      <div
        className={cn(
          "flex size-full flex-col text-xs transition-opacity",
          isRefreshing && "opacity-60",
          className
        )}
        data-slot="chart"
        {...(insetValueAxis ? { "data-y-inset": "" } : {})}
      >
        <div className="min-h-0 flex-1">
          <ResponsiveContainer
            height="100%"
            initialDimension={INITIAL_DIMENSION}
            width="100%"
          >
            {children}
          </ResponsiveContainer>
        </div>
        {showLegend && series.length >= MIN_SERIES_FOR_LEGEND && (
          <ChartLegend series={series} />
        )}
      </div>
    </ChartContext.Provider>
  );
}

export { ChartContainer };
