import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";
import type { ChartRow } from "@/components/charts/chart-context";
import { formatBytes } from "@/lib/console-resources";
import {
  MetricId,
  type MetricSeries,
  MetricUnit,
  type Points,
  type QueryMetricsResponse,
  type TrendDelta,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

const MS_PER_SECOND = 1000;
const NANOS_PER_MS = 1_000_000;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const PERCENT_MULTIPLIER = 100;
const RATIO_DECIMALS = 1;
/** The largest percentage a sub-1 ratio may display as (never a false 100%). */
const MAX_UNPEGGED_PERCENT = 99.9;
const MAX_UNPEGGED_DETAILED_PERCENT = 99.99;
const TREND_DECIMALS = 1;
const COMPACT_THRESHOLD = 10_000;

const BINARY_TICK_BASE = 1024;
const DECIMAL_TICK_BASE = 10;

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});

// signDisplay "negative" drops the sign on values that round to zero, so a
// -0.001 never renders as "-0".
const plainNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  signDisplay: "negative",
});

/** Threshold below which fractional values keep their decimals. */
const SMALL_NUMBER_LIMIT = 10;

const smallNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "negative",
});

const detailedNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  signDisplay: "negative",
});

const DETAILED_RATIO_DECIMALS = 2;

function timestampToMs(timestamp: Timestamp | undefined): number {
  if (!timestamp) {
    return 0;
  }

  return (
    Number(timestamp.seconds) * MS_PER_SECOND + timestamp.nanos / NANOS_PER_MS
  );
}

function durationToMs(duration: Duration | undefined): number {
  if (!duration) {
    return 0;
  }

  return (
    Number(duration.seconds) * MS_PER_SECOND + duration.nanos / NANOS_PER_MS
  );
}

function toTimestampInit(ms: number): { seconds: bigint; nanos: number } {
  return { nanos: 0, seconds: BigInt(Math.floor(ms / MS_PER_SECOND)) };
}

/**
 * The point floor for the "collecting metrics" (nascent) coverage state.
 *
 * The overview panel defaults to a live ~1h window whose x-axis auto-fits the
 * actual sample span, so a short span is no longer misleading — a freshly
 * connected instance just needs enough points to draw. A series is drawable
 * once it has 3 finite points (2 is a single segment with no shape); below
 * that the chart would be a degenerate blob, so we show the collecting state
 * instead. This floor is range-independent: 3 points draw under any window.
 */
const NASCENT_MIN_POINTS = 3;

/** Minimum finite-valued rows for a time chart to be non-degenerate. */
const MIN_RENDERABLE_ROWS = 2;

function finiteSampleStats(response: QueryMetricsResponse | undefined): {
  firstMs: number | null;
  maxFinitePoints: number;
} {
  let firstMs: number | null = null;
  let maxFinitePoints = 0;

  for (const series of response?.series ?? []) {
    let finiteCount = 0;
    for (const point of decodePoints(series.points)) {
      if (point.value !== null) {
        finiteCount += 1;
        firstMs = firstMs === null ? point.time : Math.min(firstMs, point.time);
      }
    }
    maxFinitePoints = Math.max(maxFinitePoints, finiteCount);
  }

  return { firstMs, maxFinitePoints };
}

/** A single decoded point on a metric series; value is null for a gap (NaN). */
export interface MetricPoint {
  /** Milliseconds since epoch. */
  time: number;
  /** The bucket value, or null when the bucket had no samples. */
  value: number | null;
}

export type { ChartRow } from "@/components/charts/chart-context";

export type TrendDirection = "up" | "down" | "flat";

export interface FormattedTrend {
  direction: TrendDirection;
  /** Signed percent label, e.g. "+62%". */
  label: string;
}

export type ChartColorIndex = 1 | 2 | 3 | 4 | 5;

/** One line/area drawn on a metric chart. */
export interface MetricChartSeries {
  /** CSS color for SVG marks, e.g. `var(--color-chart-1)`. */
  color: string;
  /** Tailwind background utility for legend/tooltip dots, e.g. `bg-chart-1`. */
  dotClassName: string;
  /** dataKey into each ChartRow. */
  key: string;
  label: string;
}

/** A chart tab: one or more series rendered together on a shared axis. */
export interface MetricTab {
  /** Stable key for the tab trigger. */
  key: string;
  label: string;
  /** Series drawn in this tab, in draw order. */
  series: MetricTabSeries[];
}

export interface MetricTabSeries {
  /** Which `--chart-N` token drives the stroke/fill (1-based). */
  colorIndex: ChartColorIndex;
  /** Legend label; omitted for single-series tabs. */
  label: string;
  metric: MetricId;
}

/** A selectable overview time range: a trailing window and its trend baseline. */
export interface MetricRange {
  /** Trailing window length in hours; also the period-over-period comparison. */
  hours: number;
  /** Stable key for the range control. */
  key: string;
  /** Compact label for the control and trend suffix, e.g. "1h". */
  shortLabel: string;
}

/**
 * The default overview range: a live ~1h window. Short enough that the auto
 * step (~window/240) keeps buckets small, so charts populate within a couple
 * of minutes of connecting and the panel feels live. Users opt into longer
 * ranges explicitly.
 */
export const DEFAULT_METRIC_RANGE: MetricRange = {
  hours: 1,
  key: "1h",
  shortLabel: "1h",
};

/** The overview range options, shortest first. */
export const METRIC_RANGES: MetricRange[] = [
  DEFAULT_METRIC_RANGE,
  { hours: 6, key: "6h", shortLabel: "6h" },
  { hours: HOURS_PER_DAY, key: "24h", shortLabel: "24h" },
  { hours: HOURS_PER_DAY * DAYS_PER_WEEK, key: "7d", shortLabel: "7d" },
];

/** Resolves a range by its window hours, falling back to the default. */
export function metricRangeByHours(hours: number): MetricRange {
  return (
    METRIC_RANGES.find((range) => range.hours === hours) ?? DEFAULT_METRIC_RANGE
  );
}

/**
 * The caption shown in place of a trend when the previous period has no data
 * yet, e.g. "no 1h comparison yet" — honest about which window is missing.
 */
export function noComparisonCaption(range: MetricRange): string {
  return `no ${range.shortLabel} comparison yet`;
}

/**
 * Chart colors keyed by `--chart-N` index: `color` is the SVG mark value,
 * `dotClassName` a Tailwind background utility for legend/tooltip dots. The
 * class strings are literals so Tailwind's static extraction keeps them.
 */
export const CHART_COLORS: Record<
  ChartColorIndex,
  { color: string; dotClassName: string }
> = {
  1: { color: "var(--color-chart-1)", dotClassName: "bg-chart-1" },
  2: { color: "var(--color-chart-2)", dotClassName: "bg-chart-2" },
  3: { color: "var(--color-chart-3)", dotClassName: "bg-chart-3" },
  4: { color: "var(--color-chart-4)", dotClassName: "bg-chart-4" },
  5: { color: "var(--color-chart-5)", dotClassName: "bg-chart-5" },
};

/** The metrics featured on the instance overview, and their tab grouping. */
export const METRIC_TABS: MetricTab[] = [
  {
    key: "transactions",
    label: "Transactions",
    series: [
      { colorIndex: 1, label: "tps", metric: MetricId.TRANSACTIONS_PER_SECOND },
    ],
  },
  {
    key: "connections",
    label: "Connections",
    series: [
      {
        colorIndex: 2,
        label: "connections",
        metric: MetricId.CONNECTIONS_TOTAL,
      },
    ],
  },
  {
    key: "cache-hit",
    label: "Cache hit",
    series: [
      { colorIndex: 3, label: "hit ratio", metric: MetricId.CACHE_HIT_RATIO },
    ],
  },
  {
    key: "io",
    label: "Disk I/O",
    series: [
      {
        colorIndex: 4,
        label: "read",
        metric: MetricId.IO_READ_BYTES_PER_SECOND,
      },
      {
        colorIndex: 5,
        label: "write",
        metric: MetricId.IO_WRITE_BYTES_PER_SECOND,
      },
    ],
  },
];

/**
 * Every metric id queried for the overview page: the tab series plus storage,
 * which has no tab but feeds the header stat tile's sparkline.
 */
export const OVERVIEW_METRIC_IDS: MetricId[] = [
  ...METRIC_TABS.flatMap((tab) => tab.series.map((series) => series.metric)),
  MetricId.STORAGE_TOTAL_BYTES,
];

/**
 * Expands a columnar Points message into `{time, value}` pairs on the implicit
 * `start_time + i*step` grid. NaN buckets become null so charts break the line.
 */
export function decodePoints(points: Points | undefined): MetricPoint[] {
  if (!points) {
    return [];
  }

  const startMs = timestampToMs(points.startTime);
  const stepMs = durationToMs(points.step);

  return points.values.map((value, index) => ({
    time: startMs + index * stepMs,
    value: Number.isNaN(value) ? null : value,
  }));
}

/**
 * Merges several decoded series onto one timestamp axis, so a multi-line tab
 * (e.g. I/O read + write) renders on a shared x-axis. Series that share a grid
 * align exactly; gaps stay null.
 */
export function mergeSeriesData(
  series: { key: string; points: MetricPoint[] }[]
): ChartRow[] {
  const rowsByTime = new Map<number, ChartRow>();

  for (const { key, points } of series) {
    for (const point of points) {
      const existing = rowsByTime.get(point.time);
      if (existing) {
        existing[key] = point.value;
      } else {
        rowsByTime.set(point.time, { time: point.time, [key]: point.value });
      }
    }
  }

  return [...rowsByTime.values()].sort((left, right) => left.time - right.time);
}

/** Indexes a response's series by metric id for direct tab lookup. */
export function seriesByMetric(
  response: QueryMetricsResponse | undefined
): Map<MetricId, MetricSeries> {
  const byMetric = new Map<MetricId, MetricSeries>();
  for (const series of response?.series ?? []) {
    byMetric.set(series.metric, series);
  }

  return byMetric;
}

/** How much of the requested window a QueryMetrics response actually covers. */
export interface MetricsCoverage {
  /** Finite points on the best-covered series (drives the collecting hint). */
  finitePointCount: number;
  /** Epoch ms of the earliest finite sample across all series, if any. */
  firstSampleMs: number | null;
  /** True when no series yet has enough points to draw an honest chart. */
  nascent: boolean;
  /** End of the queried window in epoch ms (a near-"now" anchor), if known. */
  windowEndMs: number | null;
}

/**
 * Classifies a QueryMetrics response's coverage, so the overview panel can swap
 * an undrawable just-connected chart for one deliberate "collecting metrics"
 * state. Nascent means "not yet drawable": the best-covered series has fewer
 * than NASCENT_MIN_POINTS finite points. The window length is irrelevant — the
 * chart auto-fits its actual span — so this holds across every range option.
 */
export function assessMetricsCoverage(
  response: QueryMetricsResponse | undefined
): MetricsCoverage {
  const interval = response?.interval;
  const windowEndMs = interval?.endTime
    ? timestampToMs(interval.endTime)
    : null;
  const { firstMs, maxFinitePoints } = finiteSampleStats(response);

  return {
    finitePointCount: maxFinitePoints,
    firstSampleMs: firstMs,
    nascent: maxFinitePoints < NASCENT_MIN_POINTS,
    windowEndMs,
  };
}

/**
 * How many more finite samples the best-covered series needs before its chart
 * can draw (never negative). Drives the collecting state's concrete hint.
 */
export function samplesUntilChart(coverage: MetricsCoverage): number {
  return Math.max(0, NASCENT_MIN_POINTS - coverage.finitePointCount);
}

/** Coarse human elapsed-time label, e.g. "8 minutes", "about 2 hours", "about 3 days". */
export function formatElapsedDuration(elapsedMs: number): string {
  const totalMinutes = Math.floor(
    elapsedMs / (SECONDS_PER_MINUTE * MS_PER_SECOND)
  );
  if (totalMinutes < 1) {
    return "less than a minute";
  }
  if (totalMinutes < MINUTES_PER_HOUR) {
    return totalMinutes === 1 ? "1 minute" : `${totalMinutes} minutes`;
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    return hours === 1 ? "about 1 hour" : `about ${hours} hours`;
  }

  // Decompose past hours — "about 168 hours" is how a week-old transaction
  // used to read.
  const days = Math.floor(hours / HOURS_PER_DAY);
  return days === 1 ? "about 1 day" : `about ${days} days`;
}

/**
 * True when merged chart rows contain at least two timestamps carrying a
 * finite value — the minimum for a time chart to draw an actual line. Below
 * that, a lone point on a dataMin→dataMax axis renders as a degenerate blob,
 * so callers should fall back to an empty state instead.
 */
export function hasRenderableSpan(rows: ChartRow[]): boolean {
  let finiteRows = 0;
  for (const row of rows) {
    const hasFiniteValue = Object.entries(row).some(
      ([key, value]) =>
        key !== "time" && typeof value === "number" && Number.isFinite(value)
    );
    if (hasFiniteValue) {
      finiteRows += 1;
      if (finiteRows >= MIN_RENDERABLE_ROWS) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Compact large counts ("184K"), plain integers below 10k. Small fractional
 * values (< 10) keep up to two decimals — rounding a 0.5-step axis to whole
 * numbers would render duplicate tick labels ("0, 1, 1, 2").
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  // Threshold on the ROUNDED value so 9,999.5 renders "10K" like 10,000
  // does, instead of flipping notation at the boundary.
  if (Math.abs(Math.round(value)) >= COMPACT_THRESHOLD) {
    return compactNumberFormatter.format(value);
  }

  if (Math.abs(value) < SMALL_NUMBER_LIMIT && !Number.isInteger(value)) {
    return smallNumberFormatter.format(value);
  }

  return plainNumberFormatter.format(value);
}

/**
 * The tick ladder base for a unit's y-axis: byte units tick on binary (1024)
 * boundaries so labels stay whole numbers as the formatter rolls through
 * KB/MB/GB; everything else ticks on the decimal 1-2-5 ladder. Keep this next
 * to formatMetricValue — the two must agree or axis labels grow decimals.
 */
export function metricTickBase(unit: MetricUnit): 10 | 1024 {
  return unit === MetricUnit.BYTES || unit === MetricUnit.BYTES_PER_SECOND
    ? BINARY_TICK_BASE
    : DECIMAL_TICK_BASE;
}

/** Formats a metric value for display using its unit as the hint. */
export function formatMetricValue(
  value: number | null | undefined,
  unit: MetricUnit
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  switch (unit) {
    case MetricUnit.BYTES:
      return formatBytes(Math.round(value));
    case MetricUnit.BYTES_PER_SECOND:
      return `${formatBytes(Math.round(value))}/s`;
    case MetricUnit.RATIO: {
      let rounded = Number(
        (value * PERCENT_MULTIPLIER).toFixed(RATIO_DECIMALS)
      );
      // A ratio below 1 must never display as a pegged "100%" — a 99.99%
      // cache hit is a different story than a true 100%.
      if (rounded >= PERCENT_MULTIPLIER && value < 1) {
        rounded = MAX_UNPEGGED_PERCENT;
      }
      return `${rounded}%`;
    }
    default:
      return formatCompactNumber(value);
  }
}

/**
 * Full-precision variant for tooltips: the axis may abbreviate ("12.3K"), but
 * the reader hovering a point wants the exact number ("12,345"). Bytes keep
 * the shared byte formatting; ratios gain a second decimal.
 */
export function formatMetricValueDetailed(
  value: number | null | undefined,
  unit: MetricUnit
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  switch (unit) {
    case MetricUnit.BYTES:
      return formatBytes(Math.round(value));
    case MetricUnit.BYTES_PER_SECOND:
      return `${formatBytes(Math.round(value))}/s`;
    case MetricUnit.RATIO: {
      let rounded = Number(
        (value * PERCENT_MULTIPLIER).toFixed(DETAILED_RATIO_DECIMALS)
      );
      if (rounded >= PERCENT_MULTIPLIER && value < 1) {
        rounded = MAX_UNPEGGED_DETAILED_PERCENT;
      }
      return `${rounded}%`;
    }
    default:
      return detailedNumberFormatter.format(value);
  }
}

/**
 * The representative scalar for a stat tile: the server's delta.current_value
 * when present and finite, otherwise the last non-gap point.
 */
export function representativeValue(
  series: MetricSeries | undefined
): number | null {
  if (!series) {
    return null;
  }

  const current = series.delta?.currentValue;
  if (current !== undefined && Number.isFinite(current)) {
    return current;
  }

  for (let index = series.points?.values.length ?? 0; index > 0; index -= 1) {
    const value = series.points?.values[index - 1];
    if (value !== undefined && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Formats a TrendDelta for a stat tile, or null when it should be suppressed
 * (no previous window, or a non-finite percent change).
 */
export function formatTrend(
  delta: TrendDelta | undefined
): FormattedTrend | null {
  if (!(delta?.previousAvailable && Number.isFinite(delta.percentChange))) {
    return null;
  }

  const rounded = Number(delta.percentChange.toFixed(TREND_DECIMALS));
  const sign = rounded > 0 ? "+" : "";
  let direction: TrendDirection = "flat";
  if (rounded > 0) {
    direction = "up";
  } else if (rounded < 0) {
    direction = "down";
  }

  return {
    direction,
    label: `${sign}${rounded}%`,
  };
}

/**
 * Builds the QueryMetrics request init for the instance overview: a trailing
 * `rangeHours` window ending at `anchorMs`, with a period-over-period
 * comparison over the SAME length (so the trend reads "vs the previous
 * 1h/6h/…"). `step` is left unset so the backend picks the bucket size
 * (~window/240, floored to the probe cadence). The caller quantizes `anchorMs`
 * so the request (and its query key) is stable.
 */
export function buildInstanceMetricsInput(
  instanceName: string,
  anchorMs: number,
  rangeHours: number
) {
  const rangeSeconds = rangeHours * SECONDS_PER_HOUR;
  const windowMs = rangeSeconds * MS_PER_SECOND;

  return {
    comparison: {
      nanos: 0,
      seconds: BigInt(rangeSeconds),
    },
    interval: {
      endTime: toTimestampInit(anchorMs),
      startTime: toTimestampInit(anchorMs - windowMs),
    },
    metrics: OVERVIEW_METRIC_IDS,
    target: instanceName,
  };
}

/**
 * Builds the QueryMetrics request for the window immediately BEFORE the one
 * `buildInstanceMetricsInput` queries — the comparison overlay's data source.
 * Same length and same anchor, so both windows share a bucket grid and the
 * overlay aligns exactly once shifted forward by the window length. No
 * `comparison`: the previous window needs no trend of its own.
 */
export function buildPreviousInstanceMetricsInput(
  instanceName: string,
  anchorMs: number,
  rangeHours: number
) {
  const windowMs = rangeHours * SECONDS_PER_HOUR * MS_PER_SECOND;

  return {
    interval: {
      endTime: toTimestampInit(anchorMs - windowMs),
      startTime: toTimestampInit(anchorMs - 2 * windowMs),
    },
    metrics: OVERVIEW_METRIC_IDS,
    target: instanceName,
  };
}

/** The window length in ms for a range, i.e. the comparison overlay's shift. */
export function metricRangeWindowMs(range: MetricRange): number {
  return range.hours * SECONDS_PER_HOUR * MS_PER_SECOND;
}

/**
 * Shifts decoded points forward in time so a previous-period series overlays
 * the current window ("this time last period"). Gaps stay gaps.
 */
export function shiftMetricPoints(
  points: MetricPoint[],
  offsetMs: number
): MetricPoint[] {
  return points.map((point) => ({
    time: point.time + offsetMs,
    value: point.value,
  }));
}

/**
 * True when a decoded series has enough finite points to draw a line — the
 * comparison overlay is omitted entirely below this, so an empty previous
 * window never leaves a phantom legend entry.
 */
export function hasDrawablePoints(points: MetricPoint[]): boolean {
  let finiteCount = 0;
  for (const point of points) {
    if (point.value !== null) {
      finiteCount += 1;
      if (finiteCount >= MIN_RENDERABLE_ROWS) {
        return true;
      }
    }
  }

  return false;
}
