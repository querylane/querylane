import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumn,
  Clock,
} from "lucide-react";
import type {
  ChartSeries,
  ChartThreshold,
} from "@/components/charts/chart-context";
import { ChartRangePicker } from "@/components/charts/chart-range-picker";
import { MetricChart } from "@/components/charts/metric-chart";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assessMetricsCoverage,
  CHART_COLORS,
  decodePoints,
  formatElapsedDuration,
  formatMetricValue,
  formatMetricValueDetailed,
  formatTrend,
  hasDrawablePoints,
  hasRenderableSpan,
  METRIC_RANGES,
  METRIC_TABS,
  type MetricPoint,
  type MetricRange,
  type MetricsCoverage,
  type MetricTab,
  type MetricTabSeries,
  mergeSeriesData,
  metricRangeWindowMs,
  metricTickBase,
  noComparisonCaption,
  representativeValue,
  samplesUntilChart,
  seriesByMetric,
  shiftMetricPoints,
} from "@/lib/metrics";
import { cn } from "@/lib/utils";
import {
  MetricId,
  type MetricSeries,
  MetricUnit,
  type QueryMetricsResponse,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

interface InstanceMetricsPanelProps {
  /**
   * The server's max_connections; drawn as a critical threshold line on the
   * connections chart once the series climbs into its neighborhood. While
   * headroom is large the line is omitted entirely so it cannot flatten the
   * data (see connectionsThresholds).
   */
  connectionsLimit?: number | undefined;
  /** True when the metrics query failed and there is no data to show. */
  isError: boolean;
  isPending: boolean;
  /** True while a range switch still shows the previous window's data. */
  isRefreshing: boolean;
  onRangeChange: (rangeHours: number) => void;
  /**
   * The window immediately before `response`'s, drawn as a dashed muted
   * overlay ("this time last period") on single-series tabs.
   */
  previousResponse?: QueryMetricsResponse | undefined;
  /** The active window; owned by the parent so its metrics query can refetch. */
  range: MetricRange;
  response: QueryMetricsResponse | undefined;
}

function PanelHeader({
  range,
  onRangeChange,
}: {
  range: MetricRange;
  onRangeChange: (rangeHours: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-border border-b px-4 py-2.5">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Metrics
      </span>
      {/* A clock icon frames the segmented picker as a trailing time window
          (the Grafana/Datadog convention); the comparison control lives on the
          chart itself, next to the line it toggles, not up here. */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock aria-hidden="true" className="size-3.5" />
        <ChartRangePicker
          onRangeChange={onRangeChange}
          options={METRIC_RANGES}
          range={range}
        />
      </div>
    </div>
  );
}

function TabTrigger({
  tab,
  series,
  range,
}: {
  tab: MetricTab;
  series: Map<number, MetricSeries>;
  range: MetricRange;
}) {
  const primary = series.get(tab.series[0]?.metric ?? 0);
  const value = representativeValue(primary);
  const formatted = primary ? formatMetricValue(value, primary.unit) : "—";
  const trend = formatTrend(primary?.delta);

  return (
    <TabsTrigger
      className="h-auto flex-col items-start justify-start gap-1.5 rounded-none border-0 px-4 py-3 text-left before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary before:opacity-0 hover:bg-muted/50 data-active:bg-transparent data-active:before:opacity-100 group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent"
      value={tab.key}
    >
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {tab.label}
      </span>
      <span className="font-bold font-mono text-foreground text-xl tabular-nums tracking-tight">
        {formatted}
      </span>
      {trend ? (
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs tabular-nums",
            trend.direction === "up" && "text-success",
            trend.direction === "down" && "text-destructive",
            trend.direction === "flat" && "text-muted-foreground"
          )}
        >
          {trend.direction === "up" ? <ArrowUp className="size-3" /> : null}
          {trend.direction === "down" ? <ArrowDown className="size-3" /> : null}
          {trend.label}
          <span className="text-muted-foreground"> · {range.shortLabel}</span>
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">
          {noComparisonCaption(range)}
        </span>
      )}
    </TabsTrigger>
  );
}

/**
 * The non-interactive stat tile shown while metrics collection is warming up:
 * same anatomy as TabTrigger (label, latest value) but with a "collecting"
 * status caption instead of a trend, and no chart to switch to.
 */
function CollectingStat({
  tab,
  series,
}: {
  tab: MetricTab;
  series: Map<number, MetricSeries>;
}) {
  const primary = series.get(tab.series[0]?.metric ?? 0);
  const value = representativeValue(primary);
  const formatted = primary ? formatMetricValue(value, primary.unit) : "—";

  return (
    <div className="flex flex-col items-start gap-1.5 px-4 py-3 text-left">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {tab.label}
      </span>
      <span className="font-bold font-mono text-foreground text-xl tabular-nums tracking-tight">
        {formatted}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-success"
        />
        collecting
      </span>
    </div>
  );
}

/**
 * The collecting-state body copy: a concrete "when will it draw" line (derived
 * from the 3-point floor) plus, when known, how long collection has been
 * running. Keeps the promise specific instead of open-ended.
 */
function collectingDescription(coverage: MetricsCoverage): string {
  const remaining = samplesUntilChart(coverage);
  const threshold =
    remaining > 0
      ? `Charts appear after ~${remaining} more ${remaining === 1 ? "sample" : "samples"} — usually within 2–3 minutes.`
      : "Charts appear once a few samples are collected — usually within 2–3 minutes.";

  if (coverage.firstSampleMs === null || coverage.windowEndMs === null) {
    return threshold;
  }

  const elapsedMs = Math.max(0, coverage.windowEndMs - coverage.firstSampleMs);
  return `Collection started ${formatElapsedDuration(elapsedMs)} ago. ${threshold}`;
}

/** Ratios live on a fixed 0-100% axis; the auto domain would tick past 100%. */
const RATIO_Y_DOMAIN: [number, number] = [0, 1];

/**
 * The previous window's series, shifted forward one window so it overlays the
 * current one ("this time last period"). Drawn dashed and translucent in the
 * SAME hue as the live series — identity stays with the metric, and the dash
 * marks it as context, not a measurement (the Axiom/Stripe convention). Null
 * when the previous window has too little data to draw — the overlay is then
 * omitted entirely rather than leaving a phantom legend entry. Only
 * single-series tabs get an overlay: on a two-series tab two identical dashed
 * lines would be unreadable.
 */
function comparisonOverlay(
  primary: MetricTabSeries,
  previousSeries: Map<number, MetricSeries>,
  windowMs: number
): { points: MetricPoint[]; series: ChartSeries } | null {
  const previous = previousSeries.get(primary.metric);
  if (!previous) {
    return null;
  }

  const points = shiftMetricPoints(decodePoints(previous.points), windowMs);
  if (!hasDrawablePoints(points)) {
    return null;
  }

  return {
    points,
    series: {
      color: CHART_COLORS[primary.colorIndex].color,
      dashed: true,
      dotClassName: CHART_COLORS[primary.colorIndex].dotClassName,
      key: `${primary.metric}-previous`,
      label: "previous",
    },
  };
}

function TabChart({
  tab,
  series,
  previousSeries,
  isRefreshing,
  thresholds,
  windowMs,
}: {
  isRefreshing: boolean;
  previousSeries: Map<number, MetricSeries>;
  tab: MetricTab;
  series: Map<number, MetricSeries>;
  thresholds?: ChartThreshold[] | undefined;
  windowMs: number;
}) {
  const present = tab.series
    .map((config) => ({ config, metricSeries: series.get(config.metric) }))
    .filter(
      (
        item
      ): item is {
        config: (typeof tab.series)[number];
        metricSeries: MetricSeries;
      } => item.metricSeries !== undefined
    );

  if (present.length === 0) {
    return (
      <EmptyState
        className="mt-4 px-4"
        description="These samples require PostgreSQL 16+, or none have been collected yet for this window."
        icon={ChartNoAxesColumn}
        title="No data for this metric"
      />
    );
  }

  const chartSeries: ChartSeries[] = present.map(({ config }) => ({
    color: CHART_COLORS[config.colorIndex].color,
    dotClassName: CHART_COLORS[config.colorIndex].dotClassName,
    key: String(config.metric),
    label: config.label,
  }));
  const dataSeries = present.map(({ config, metricSeries }) => ({
    key: String(config.metric),
    points: decodePoints(metricSeries.points),
  }));

  const unit = present[0]?.metricSeries.unit ?? 0;

  // The gate judges the current window alone: a comparison overlay must never
  // resurrect a chart whose own window is still empty.
  if (!hasRenderableSpan(mergeSeriesData(dataSeries))) {
    return (
      <EmptyState
        className="mt-4 px-4"
        description="Charts appear once a few samples have been collected for this window."
        icon={ChartNoAxesColumn}
        title="Not enough samples yet"
      />
    );
  }

  // The previous-period overlay is always drawn (no toggle): on single-series
  // tabs it is the chart's built-in "this time last period" context. Two-series
  // tabs skip it — two dashed lines beside two solid ones would be unreadable.
  const primaryConfig = present[0]?.config;
  const isSingleSeries = present.length === 1;
  const overlay =
    isSingleSeries && primaryConfig !== undefined
      ? comparisonOverlay(primaryConfig, previousSeries, windowMs)
      : null;
  if (overlay) {
    chartSeries.push(overlay.series);
    dataSeries.push({ key: overlay.series.key, points: overlay.points });
  }

  // Full-bleed: `yAxisMode="inset"` overlays the y-labels inside the plot on a
  // halo, so the chart spans the card's full width edge to edge — matching the
  // tab bar above, with no reserved axis gutter on either side.
  return (
    <div className="h-72 w-full pt-4">
      <MetricChart
        data={mergeSeriesData(dataSeries)}
        formatDetailedValue={(value) => formatMetricValueDetailed(value, unit)}
        formatValue={(value) => formatMetricValue(value, unit)}
        isRefreshing={isRefreshing}
        series={chartSeries}
        thresholds={thresholds}
        yAxisMode="inset"
        {...(unit === MetricUnit.RATIO ? { yDomain: RATIO_Y_DOMAIN } : {})}
        yTickBase={metricTickBase(unit)}
      />
    </div>
  );
}

/**
 * The featured-metrics panel: a range picker over a segmented stat bar of
 * metric tabs (label, big value, period-over-period trend) sitting flush above
 * the selected metric's chart. Reads directly from a QueryMetrics response;
 * metrics absent from the response (e.g. I/O on PostgreSQL < 16) render a
 * graceful empty state. Until any series has enough points to draw, the charts
 * are replaced by one deliberate "collecting metrics" state that keeps the
 * latest values visible.
 */
/**
 * Only draw the max_connections ceiling once the series has climbed within
 * reach of it. Below this fraction the limit is pure headroom: extending the
 * domain to show it would flatten the data into a line at the bottom, and an
 * unextended domain would never include it anyway.
 */
const CONNECTIONS_LIMIT_PROXIMITY = 0.7;

function connectionsThresholds(
  series: Map<number, MetricSeries>,
  connectionsLimit: number | undefined
): ChartThreshold[] | undefined {
  if (!connectionsLimit || connectionsLimit <= 0) {
    return;
  }

  let peak = 0;
  for (const value of series.get(MetricId.CONNECTIONS_TOTAL)?.points?.values ??
    []) {
    if (Number.isFinite(value)) {
      peak = Math.max(peak, value);
    }
  }
  if (peak < CONNECTIONS_LIMIT_PROXIMITY * connectionsLimit) {
    return;
  }

  return [
    {
      extendDomain: true,
      label: "max",
      tone: "critical",
      value: connectionsLimit,
    },
  ];
}

export function InstanceMetricsPanel({
  connectionsLimit,
  response,
  previousResponse,
  isError,
  isPending,
  isRefreshing,
  range,
  onRangeChange,
}: InstanceMetricsPanelProps) {
  const series = seriesByMetric(response);
  const previousSeries = seriesByMetric(previousResponse);
  const tabThresholds = new Map<string, ChartThreshold[] | undefined>();
  tabThresholds.set(
    "connections",
    connectionsThresholds(series, connectionsLimit)
  );

  if (isPending && !response) {
    return (
      <Card className="border-border">
        <CardContent>
          <div className="h-96 w-full animate-pulse rounded-lg bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  // Without this branch a failed QueryMetrics would fall through to the
  // "collecting metrics" state and promise data that will never arrive.
  if (isError && !response) {
    return (
      <Card className="gap-0 border-border py-0">
        <PanelHeader onRangeChange={onRangeChange} range={range} />
        <div className="px-6 pb-6">
          <EmptyState
            className="mt-4 min-h-72"
            description="The metrics query failed. Refresh to retry; if it keeps failing, check the instance connection."
            icon={ChartNoAxesColumn}
            title="Metrics unavailable"
          />
        </div>
      </Card>
    );
  }

  const coverage = assessMetricsCoverage(response);

  if (coverage.nascent) {
    return (
      <Card className="gap-0 border-border py-0">
        <PanelHeader onRangeChange={onRangeChange} range={range} />
        <div className="grid w-full grid-cols-2 divide-x divide-y divide-border border-border border-b sm:grid-cols-4 sm:divide-y-0">
          {METRIC_TABS.map((tab) => (
            <CollectingStat key={tab.key} series={series} tab={tab} />
          ))}
        </div>
        <div className="px-6 pb-6">
          <EmptyState
            className="mt-4 min-h-72"
            description={collectingDescription(coverage)}
            icon={Activity}
            title="Collecting metrics"
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-0 border-border py-0">
      <PanelHeader onRangeChange={onRangeChange} range={range} />
      <Tabs className="gap-0" defaultValue={METRIC_TABS[0]?.key}>
        <TabsList className="grid h-auto w-full grid-cols-2 divide-x divide-y divide-border rounded-none border-border border-b bg-transparent p-0 group-data-horizontal/tabs:h-auto sm:grid-cols-4 sm:divide-y-0">
          {METRIC_TABS.map((tab) => (
            <TabTrigger key={tab.key} range={range} series={series} tab={tab} />
          ))}
        </TabsList>
        {METRIC_TABS.map((tab) => (
          <TabsContent className="pb-6" key={tab.key} value={tab.key}>
            <TabChart
              isRefreshing={isRefreshing}
              previousSeries={previousSeries}
              series={series}
              tab={tab}
              thresholds={tabThresholds.get(tab.key)}
              windowMs={metricRangeWindowMs(range)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
