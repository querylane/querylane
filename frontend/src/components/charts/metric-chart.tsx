import {
  CatchBoundary,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ComponentProps, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isChunkLoadError } from "@/lib/chunk-load-recovery";
import { normalizeAppUiError, reportAppUiError } from "@/lib/ui-error";

// React.lazy caches rejected imports. Distinguish them from retryable renders,
// including module initialization failures not recognized as chunk errors.
// Each lazy import settles once, so this retains at most its two failures.
const moduleFailures = new Set<unknown>();
function chartModuleFailed(error: unknown): never {
  moduleFailures.add(error);
  throw error;
}

// Keep the heavy chart runtime in its existing lazy chunks.
const MetricTimeChart = lazy(() =>
  import("@/components/charts/metric-time-chart")
    .then((module) => ({ default: module.MetricTimeChart }))
    .catch(chartModuleFailed)
);
const SparklineChart = lazy(() =>
  import("@/components/charts/sparkline-chart")
    .then((module) => ({ default: module.SparklineChart }))
    .catch(chartModuleFailed)
);

function reportChartError(error: unknown) {
  reportAppUiError(
    normalizeAppUiError(error, { area: "metric-chart", source: "runtime" })
  );
}

function ChartFailure({ error, reset }: ErrorComponentProps) {
  const moduleFailed = moduleFailures.has(error) || isChunkLoadError(error);
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center text-sm"
      role="alert"
    >
      <p className="font-medium">Chart unavailable</p>
      <p className="text-muted-foreground text-xs">
        {moduleFailed
          ? "Reload the page to try loading this chart again."
          : "This chart could not be displayed. Other controls are still available."}
      </p>
      {moduleFailed ? null : (
        <Button onClick={reset} variant="outline">
          Retry chart
        </Button>
      )}
    </div>
  );
}

function TrendFailure() {
  return (
    <div
      aria-label="Metric trend unavailable"
      className="text-muted-foreground flex size-full items-center justify-center"
      role="img"
    >
      <span aria-hidden="true">–</span>
    </div>
  );
}

const loadingPlot = (
  <div
    aria-hidden="true"
    className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-3"
  >
    <Skeleton className="h-px w-full" />
    <Skeleton className="h-px w-full" />
    <Skeleton className="h-px w-full" />
    <div className="flex justify-between">
      <Skeleton className="h-3 w-10" />
      <Skeleton className="h-3 w-10" />
      <Skeleton className="h-3 w-10" />
    </div>
  </div>
);

function ChartLoading(props: ComponentProps<typeof MetricTimeChart>) {
  const showLegend = props.showLegend ?? props.series.length >= 2;
  return (
    <div
      aria-label="Loading metric chart"
      className="flex size-full min-w-0 flex-col text-xs"
      role="status"
    >
      {/* Keep interactive chart controls behind the chart-runtime boundary. */}
      {loadingPlot}
      {showLegend && props.series.length >= 2 ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
          {props.series.map((item) => (
            <div className="flex items-center gap-1.5" key={item.key}>
              <Skeleton aria-hidden="true" className="h-1 w-3.5" />
              <span className="text-muted-foreground text-xs">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Local, lazy time-series panel. The parent constrains its height. */
export function MetricChart(props: ComponentProps<typeof MetricTimeChart>) {
  return (
    <CatchBoundary
      errorComponent={ChartFailure}
      getResetKey={() => "metric-chart"}
      onCatch={reportChartError}
    >
      <Suspense fallback={<ChartLoading {...props} />}>
        <MetricTimeChart {...props} />
      </Suspense>
    </CatchBoundary>
  );
}

/** Local, size-stable trend glyph: no repeated live alerts or tiny controls. */
export function MetricSparkline(props: ComponentProps<typeof SparklineChart>) {
  return (
    <CatchBoundary
      errorComponent={TrendFailure}
      getResetKey={() => "metric-trend"}
      onCatch={reportChartError}
    >
      <Suspense
        fallback={
          <Skeleton
            aria-label="Loading metric trend"
            className="size-full"
            role="img"
          />
        }
      >
        <SparklineChart {...props} />
      </Suspense>
    </CatchBoundary>
  );
}
