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
import { Card, CardContent } from "@/components/querylane-ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/querylane-ui/tabs";
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
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Metrics
      </span>

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
      className="h-auto flex-col items-start justify-start text-left before:absolute before:inset-x-0 before:top-0 before:h-0.5"
      presentation="metric"
      value={tab.key}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {tab.label}
      </span>
      <span className="font-mono text-xl font-bold tracking-tight text-foreground tabular-nums">
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
        <span className="text-xs text-muted-foreground">
          {noComparisonCaption(range)}
        </span>
      )}
    </TabsTrigger>
  );
}

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
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {tab.label}
      </span>
      <span className="font-mono text-xl font-bold tracking-tight text-foreground tabular-nums">
        {formatted}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none"
        />
        collecting
      </span>
    </div>
  );
}

function collectingDescription(coverage: MetricsCoverage) {
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

const RATIO_Y_DOMAIN: [number, number] = [0, 1];

function comparisonOverlay(
  primary: MetricTabSeries,
  previousSeries: Map<number, MetricSeries>,
  windowMs: number
) {
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
  } satisfies { points: MetricPoint[]; series: ChartSeries } | null;
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
        className="h-72 min-h-0"
        description="These samples require PostgreSQL 16+, or none have been collected yet for this window."
        icon={ChartNoAxesColumn}
        presentation="chart"
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

  const unit = present[0]?.metricSeries.unit ?? MetricUnit.UNSPECIFIED;

  if (!hasRenderableSpan(mergeSeriesData(dataSeries))) {
    return (
      <EmptyState
        className="h-72 min-h-0"
        description="Charts appear once a few samples have been collected for this window."
        icon={ChartNoAxesColumn}
        presentation="chart"
        title="Not enough samples yet"
      />
    );
  }

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

  return (
    <div className="h-72 w-full px-4 pt-4">
      <MetricChart
        data={mergeSeriesData(dataSeries)}
        formatDetailedValue={(value) => formatMetricValueDetailed(value, unit)}
        formatValue={(value) => formatMetricValue(value, unit)}
        isRefreshing={isRefreshing}
        series={chartSeries}
        seriesEmphasis={!isSingleSeries}
        thresholds={thresholds}
        {...(unit === MetricUnit.RATIO ? { yDomain: RATIO_Y_DOMAIN } : {})}
        yTickBase={metricTickBase(unit)}
      />
    </div>
  );
}

const CONNECTIONS_LIMIT_PROXIMITY = 0.7;

function connectionsThresholds(
  series: Map<number, MetricSeries>,
  connectionsLimit: number | undefined
) {
  if (
    !(
      typeof connectionsLimit === "number" &&
      connectionsLimit !== 0 &&
      !Number.isNaN(connectionsLimit)
    ) ||
    connectionsLimit <= 0
  ) {
    return undefined;
  }

  let peak = 0;
  const values = series.get(MetricId.CONNECTIONS_TOTAL)?.points?.values ?? [];
  for (const value of values) {
    if (Number.isFinite(value)) {
      peak = Math.max(peak, value);
    }
  }
  if (peak < CONNECTIONS_LIMIT_PROXIMITY * connectionsLimit) {
    return undefined;
  }

  return [
    {
      extendDomain: true,
      label: "max",
      tone: "critical",
      value: connectionsLimit,
    },
  ] satisfies ChartThreshold[] | undefined;
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
  const tabThresholds = new Map<string, ChartThreshold[] | undefined>([
    ["connections", connectionsThresholds(series, connectionsLimit)],
  ]);

  if (isPending && !response) {
    return (
      <Card presentation="bordered">
        <CardContent>
          <div className="h-96 w-full animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
        </CardContent>
      </Card>
    );
  }

  if (isError && !response) {
    return (
      <Card presentation="bordered-flush">
        <PanelHeader onRangeChange={onRangeChange} range={range} />
        <div className="pb-6">
          <EmptyState
            className="h-72 min-h-0"
            description="Querylane couldn't load metrics. Refresh to retry."
            icon={ChartNoAxesColumn}
            presentation="chart"
            title="Metrics unavailable"
          />
        </div>
      </Card>
    );
  }

  const coverage = assessMetricsCoverage(response);

  if (coverage.nascent) {
    return (
      <Card presentation="bordered-flush">
        <PanelHeader onRangeChange={onRangeChange} range={range} />
        <div className="grid w-full grid-cols-2 divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
          {METRIC_TABS.map((tab) => (
            <CollectingStat key={tab.key} series={series} tab={tab} />
          ))}
        </div>
        <div className="pb-6">
          <EmptyState
            className="h-72 min-h-0"
            description={collectingDescription(coverage)}
            icon={Activity}
            presentation="chart"
            title="Collecting metrics"
          />
        </div>
      </Card>
    );
  }

  return (
    <Card presentation="bordered-flush">
      <PanelHeader onRangeChange={onRangeChange} range={range} />
      <Tabs defaultValue={METRIC_TABS[0]?.key} presentation="flush">
        <TabsList
          className="grid h-auto w-full grid-cols-2 group-data-horizontal/tabs:h-auto sm:grid-cols-4"
          presentation="metrics"
        >
          {METRIC_TABS.map((tab) => (
            <TabTrigger key={tab.key} range={range} series={series} tab={tab} />
          ))}
        </TabsList>
        {METRIC_TABS.map((tab) => (
          <TabsContent key={tab.key} presentation="metrics" value={tab.key}>
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
