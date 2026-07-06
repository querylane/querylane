import { type ComponentProps, lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts is heavy (~142KB gzip); keep it out of the initial bundle by
// splitting the chart internals into their own lazily-loaded chunks.
const MetricTimeChart = lazy(() =>
  import("@/components/charts/metric-time-chart").then((module) => ({
    default: module.MetricTimeChart,
  }))
);

const SparklineChart = lazy(() =>
  import("@/components/charts/sparkline-chart").then((module) => ({
    default: module.SparklineChart,
  }))
);

/**
 * Lazy boundary around the full time-series chart. Fills its parent, so the
 * parent must constrain the height (e.g. `h-72`).
 */
export function MetricChart(props: ComponentProps<typeof MetricTimeChart>) {
  return (
    <Suspense fallback={<Skeleton className="size-full" />}>
      <MetricTimeChart {...props} />
    </Suspense>
  );
}

/**
 * Lazy boundary around the sparkline glyph. Fills its parent, so the parent
 * must constrain the size (e.g. `h-8 w-24`).
 */
export function MetricSparkline(props: ComponentProps<typeof SparklineChart>) {
  return (
    <Suspense fallback={<Skeleton className="size-full" />}>
      <SparklineChart {...props} />
    </Suspense>
  );
}
