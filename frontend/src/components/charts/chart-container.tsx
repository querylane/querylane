import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import type { ChartSeries } from "@/components/charts/chart-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A legend is the dependable identity channel for two or more series. */
const MIN_SERIES_FOR_LEGEND = 2;

function ChartLegend({
  series,
  emphasizedSeriesKey,
  onSeriesEmphasisChange,
  descriptionId,
}: {
  series: ChartSeries[];
  emphasizedSeriesKey: string | null;
  onSeriesEmphasisChange?: ((key: string | null) => void) | undefined;
  descriptionId: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {series.map((item) =>
        onSeriesEmphasisChange ? (
          <Button
            aria-describedby={descriptionId}
            aria-pressed={emphasizedSeriesKey === item.key}
            className="min-h-11 min-w-11"
            key={item.key}
            onClick={() => {
              onSeriesEmphasisChange(
                emphasizedSeriesKey === item.key ? null : item.key
              );
            }}
            variant={emphasizedSeriesKey === item.key ? "outline" : "ghost"}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1 w-3.5 rounded-full",
                item.dotClassName,
                item.dashed === true && "opacity-50"
              )}
            />
            {item.label}
            <span aria-hidden="true" className="size-3.5">
              {emphasizedSeriesKey === item.key ? (
                <Check className="size-3.5" />
              ) : null}
            </span>
          </Button>
        ) : (
          <div className="flex items-center gap-1.5" key={item.key}>
            <span
              aria-hidden="true"
              className={cn(
                "h-1 w-3.5 rounded-full",
                item.dotClassName,
                item.dashed === true && "opacity-50"
              )}
            />
            <span className="text-muted-foreground text-xs">{item.label}</span>
          </div>
        )
      )}
    </div>
  );
}

interface ChartContainerProps {
  children: ReactNode;
  className?: string;
  emphasizedSeriesKey?: string | null | undefined;
  /**
   * Holds the previous render at reduced opacity while fresh data loads, so a
   * range change never flashes a skeleton or jumps layout.
   */
  isRefreshing?: boolean | undefined;
  onSeriesEmphasisChange?: ((key: string | null) => void) | undefined;
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
  emphasizedSeriesKey = null,
  onSeriesEmphasisChange,
  series,
  showLegend = series.length >= MIN_SERIES_FOR_LEGEND,
}: ChartContainerProps) {
  const descriptionId = useId();
  const emphasisEnabled =
    showLegend &&
    series.length >= MIN_SERIES_FOR_LEGEND &&
    onSeriesEmphasisChange !== undefined;
  const emphasizedSeries = series.find(
    (item) => item.key === emphasizedSeriesKey
  );
  return (
    <fieldset
      aria-label={emphasisEnabled ? "Metric chart" : undefined}
      className={cn(
        "flex size-full min-w-0 flex-col text-xs transition-opacity",
        isRefreshing && "opacity-60",
        className
      )}
      data-slot="chart"
      onKeyDownCapture={
        emphasisEnabled
          ? (event) => {
              if (event.key === "Escape") {
                onSeriesEmphasisChange?.(null);
              }
            }
          : undefined
      }
    >
      <div className="min-h-0 flex-1">{children}</div>
      {showLegend && series.length >= MIN_SERIES_FOR_LEGEND ? (
        <ChartLegend
          descriptionId={descriptionId}
          emphasizedSeriesKey={emphasizedSeriesKey}
          onSeriesEmphasisChange={onSeriesEmphasisChange}
          series={series}
        />
      ) : null}
      {emphasisEnabled ? (
        <>
          <p className="sr-only" id={descriptionId}>
            Emphasize a series without hiding values. Press Escape to reset.
          </p>
          <p className="text-muted-foreground text-center text-xs">
            All values remain shown.
          </p>
          <p className="sr-only" role="status">
            {emphasizedSeries
              ? `${emphasizedSeries.label} emphasized. All values remain shown.`
              : "No series emphasized."}
          </p>
        </>
      ) : null}
    </fieldset>
  );
}

export { ChartContainer };
