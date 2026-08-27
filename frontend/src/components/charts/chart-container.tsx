import type { ReactNode } from "react";
import type { ChartSeries } from "@/components/charts/chart-context";
import { cn } from "@/lib/utils";

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
  children: ReactNode;
  className?: string;
  /**
   * Holds the previous render at reduced opacity while fresh data loads, so a
   * range change never flashes a skeleton or jumps layout.
   */
  isRefreshing?: boolean | undefined;
  series: ChartSeries[];
  /** Defaults to showing a legend for at least two series. */
  showLegend?: boolean | undefined;
}

/**
 * The chart kit's parent-sized mounting frame. The fixed parent height includes
 * the guide bands and app-owned legend, never just the plot.
 */
function ChartContainer({
  children,
  className,
  isRefreshing = false,
  series,
  showLegend = series.length >= MIN_SERIES_FOR_LEGEND,
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        "flex size-full flex-col text-xs transition-opacity",
        isRefreshing && "opacity-60",
        className
      )}
      data-slot="chart"
    >
      <div className="min-h-0 flex-1">{children}</div>
      {showLegend && series.length >= MIN_SERIES_FOR_LEGEND ? (
        <ChartLegend series={series} />
      ) : null}
    </div>
  );
}

export { ChartContainer };
