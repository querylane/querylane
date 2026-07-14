import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  assessMetricsCoverage,
  buildInstanceMetricsInput,
  buildPreviousInstanceMetricsInput,
  DEFAULT_METRIC_RANGE,
  decodePoints,
  formatElapsedDuration,
  formatMetricValue,
  formatTrend,
  hasDrawablePoints,
  hasRenderableSpan,
  METRIC_RANGES,
  metricRangeByHours,
  metricRangeWindowMs,
  noComparisonCaption,
  OVERVIEW_METRIC_IDS,
  representativeValue,
  samplesUntilChart,
  seriesByMetric,
  shiftMetricPoints,
} from "@/lib/metrics";
import {
  MetricId,
  MetricSeriesSchema,
  MetricUnit,
  PointsSchema,
  QueryMetricsResponseSchema,
  TrendDeltaSchema,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

const TEST_NUMBER_3 = 3;
const TEST_NUMBER_0_POINT_992 = 0.992;
const TEST_NUMBER_0_POINT_9999 = 0.9999;
const TEST_NUMBER_0_POINT_001 = 0.001;
const TEST_NUMBER_9999_POINT_5 = 9999.5;
const TEST_NUMBER_3500000 = 3_500_000;
const TEST_NUMBER_184000 = 184_000;
const TEST_NUMBER_0_POINT_5 = 0.5;
const TEST_NUMBER_1_POINT_5 = 1.5;
const TEST_NUMBER_42_POINT_7 = 42.7;
const TEST_NUMBER_42 = 42;
const TEST_NUMBER_3600 = 3600;
const TEST_NUMBER_7 = 7;
const TEST_NUMBER_1000 = 1000;
const TEST_NUMBER_120 = 120;
const TEST_NUMBER_5 = 5;
const TEST_NUMBER_6 = 6;
const TEST_NUMBER_49 = 49;
const TEST_NUMBER_999 = 999;
const TEST_NUMBER_30000 = 30_000;
const TEST_NUMBER_60000 = 60_000;
const TEST_NUMBER_8 = 8;
const TEST_NUMBER_3600000 = 3_600_000;
const TEST_NUMBER_7_POINT_4 = 7.4;
const TEST_NUMBER_25 = 25;
const TEST_NUMBER_12 = 12;
const TEST_NUMBER_500 = 500;
const TEST_BIGINT_3600 = 3600n;

describe("decodePoints", () => {
  test("expands the implicit time grid and maps NaN gaps to null", () => {
    const points = create(PointsSchema, {
      startTime: { nanos: 0, seconds: 1000n },
      step: { nanos: 0, seconds: 60n },
      values: [1, Number.NaN, TEST_NUMBER_3],
    });

    expect(decodePoints(points)).toEqual([
      { time: 1_000_000, value: 1 },
      { time: 1_060_000, value: null },
      { time: 1_120_000, value: 3 },
    ]);
  });

  test("returns an empty array for undefined points", () => {
    expect(decodePoints(undefined)).toEqual([]);
  });
});

describe("formatMetricValue", () => {
  test("formats ratios as percentages", () => {
    expect(formatMetricValue(TEST_NUMBER_0_POINT_992, MetricUnit.RATIO)).toBe(
      "99.2%"
    );
  });

  test("never shows a sub-1 ratio as a pegged 100%", () => {
    expect(formatMetricValue(TEST_NUMBER_0_POINT_9999, MetricUnit.RATIO)).toBe(
      "99.9%"
    );
    expect(formatMetricValue(1, MetricUnit.RATIO)).toBe("100%");
  });

  test("never renders a negative zero", () => {
    expect(formatMetricValue(-TEST_NUMBER_0_POINT_001, MetricUnit.COUNT)).toBe(
      "0"
    );
  });

  test("keeps compact notation across the rounding boundary", () => {
    expect(formatMetricValue(TEST_NUMBER_9999_POINT_5, MetricUnit.COUNT)).toBe(
      "10K"
    );
  });

  test("formats bytes-per-second with a /s suffix", () => {
    expect(
      formatMetricValue(TEST_NUMBER_3500000, MetricUnit.BYTES_PER_SECOND)
    ).toBe("3.3 MB/s");
  });

  test("compacts large counts", () => {
    expect(formatMetricValue(TEST_NUMBER_184000, MetricUnit.PER_SECOND)).toBe(
      "184K"
    );
  });

  test("keeps decimals on small fractional values so axis ticks stay distinct", () => {
    expect(
      formatMetricValue(TEST_NUMBER_0_POINT_5, MetricUnit.PER_SECOND)
    ).toBe("0.5");
    expect(formatMetricValue(TEST_NUMBER_1_POINT_5, MetricUnit.COUNT)).toBe(
      "1.5"
    );
    expect(formatMetricValue(2, MetricUnit.COUNT)).toBe("2");
    expect(formatMetricValue(TEST_NUMBER_42_POINT_7, MetricUnit.COUNT)).toBe(
      "43"
    );
  });

  test("renders an em dash for non-finite values", () => {
    expect(formatMetricValue(Number.NaN, MetricUnit.COUNT)).toBe("—");
    expect(formatMetricValue(null, MetricUnit.COUNT)).toBe("—");
  });
});

describe("formatTrend", () => {
  test("suppresses the trend when the previous window is unavailable", () => {
    const delta = create(TrendDeltaSchema, {
      currentValue: 10,
      percentChange: 50,
      previousAvailable: false,
    });

    expect(formatTrend(delta)).toBeNull();
  });

  test("suppresses the trend when percent change is NaN", () => {
    const delta = create(TrendDeltaSchema, {
      percentChange: Number.NaN,
      previousAvailable: true,
    });

    expect(formatTrend(delta)).toBeNull();
  });

  test("labels a positive change with direction up", () => {
    const delta = create(TrendDeltaSchema, {
      percentChange: 62,
      previousAvailable: true,
    });

    expect(formatTrend(delta)).toEqual({ direction: "up", label: "+62%" });
  });

  test("labels a negative change with direction down", () => {
    const delta = create(TrendDeltaSchema, {
      percentChange: -12.34,
      previousAvailable: true,
    });

    expect(formatTrend(delta)).toEqual({ direction: "down", label: "-12.3%" });
  });
});

describe("representativeValue", () => {
  test("prefers the delta current value", () => {
    const series = create(MetricSeriesSchema, {
      delta: { currentValue: 42, previousAvailable: true },
      points: { values: [1, 2, TEST_NUMBER_3] },
    });

    expect(representativeValue(series)).toBe(TEST_NUMBER_42);
  });

  test("falls back to the last finite point when no delta", () => {
    const series = create(MetricSeriesSchema, {
      points: { values: [1, 2, Number.NaN] },
    });

    expect(representativeValue(series)).toBe(2);
  });
});

describe("seriesByMetric", () => {
  test("indexes series by metric id", () => {
    const response = create(QueryMetricsResponseSchema, {
      series: [
        { metric: MetricId.CACHE_HIT_RATIO },
        { metric: MetricId.CONNECTIONS_TOTAL },
      ],
    });

    const byMetric = seriesByMetric(response);
    expect(byMetric.get(MetricId.CACHE_HIT_RATIO)?.metric).toBe(
      MetricId.CACHE_HIT_RATIO
    );
    expect(byMetric.has(MetricId.IO_READ_BYTES_PER_SECOND)).toBe(false);
  });
});

describe("assessMetricsCoverage", () => {
  const daySeconds = 24 * TEST_NUMBER_3600;
  const weekSeconds = TEST_NUMBER_7 * daySeconds;
  const dayInterval = {
    endTime: { nanos: 0, seconds: BigInt(daySeconds) },
    startTime: { nanos: 0, seconds: 0n },
  };
  // A wide (7d) window used to prove the point floor is range-independent.
  const weekInterval = {
    endTime: { nanos: 0, seconds: BigInt(weekSeconds) },
    startTime: { nanos: 0, seconds: 0n },
  };

  test("treats an undefined response as nascent with no first sample", () => {
    expect(assessMetricsCoverage(undefined)).toEqual({
      finitePointCount: 0,
      firstSampleMs: null,
      nascent: true,
      windowEndMs: null,
    });
  });

  test("treats a response with only gap points as nascent", () => {
    const response = create(QueryMetricsResponseSchema, {
      interval: dayInterval,
      series: [
        {
          metric: MetricId.CONNECTIONS_TOTAL,
          points: {
            startTime: { nanos: 0, seconds: 0n },
            step: { nanos: 0, seconds: 60n },
            values: [Number.NaN, Number.NaN],
          },
        },
      ],
    });

    const coverage = assessMetricsCoverage(response);
    expect(coverage.nascent).toBe(true);
    expect(coverage.finitePointCount).toBe(0);
    expect(coverage.firstSampleMs).toBeNull();
    expect(coverage.windowEndMs).toBe(daySeconds * TEST_NUMBER_1000);
  });

  test("flags fewer than three finite points as nascent", () => {
    const startSeconds = daySeconds - TEST_NUMBER_120;
    const response = create(QueryMetricsResponseSchema, {
      interval: dayInterval,
      series: [
        {
          metric: MetricId.CONNECTIONS_TOTAL,
          points: {
            startTime: { nanos: 0, seconds: BigInt(startSeconds) },
            step: { nanos: 0, seconds: 60n },
            values: [TEST_NUMBER_5, TEST_NUMBER_6],
          },
        },
      ],
    });

    const coverage = assessMetricsCoverage(response);
    expect(coverage.nascent).toBe(true);
    expect(coverage.finitePointCount).toBe(2);
    expect(coverage.firstSampleMs).toBe(startSeconds * TEST_NUMBER_1000);
  });

  test("draws a short span once three points exist, regardless of range", () => {
    // Three one-minute samples at the very end of a 7d window: the old span
    // gate would have flagged this, but the point floor lets it draw.
    const startSeconds = weekSeconds - TEST_NUMBER_120;
    const response = create(QueryMetricsResponseSchema, {
      interval: weekInterval,
      series: [
        {
          metric: MetricId.CONNECTIONS_TOTAL,
          points: {
            startTime: { nanos: 0, seconds: BigInt(startSeconds) },
            step: { nanos: 0, seconds: 60n },
            values: [TEST_NUMBER_5, TEST_NUMBER_6, TEST_NUMBER_5],
          },
        },
      ],
    });

    const coverage = assessMetricsCoverage(response);
    expect(coverage.nascent).toBe(false);
    expect(coverage.finitePointCount).toBe(TEST_NUMBER_3);
  });

  test("treats a fully covered 24h window as not nascent", () => {
    const response = create(QueryMetricsResponseSchema, {
      interval: dayInterval,
      series: [
        {
          metric: MetricId.CONNECTIONS_TOTAL,
          points: {
            startTime: { nanos: 0, seconds: 0n },
            step: { nanos: 0, seconds: 1800n },
            values: Array.from({ length: 49 }, (_, index) => index),
          },
        },
      ],
    });

    const coverage = assessMetricsCoverage(response);
    expect(coverage.nascent).toBe(false);
    expect(coverage.finitePointCount).toBe(TEST_NUMBER_49);
    expect(coverage.firstSampleMs).toBe(0);
    expect(coverage.windowEndMs).toBe(daySeconds * TEST_NUMBER_1000);
  });

  test("uses the best-covered series for the density signal", () => {
    // A dense gauge next to an almost-empty counter must not force the panel
    // into the collecting state.
    const response = create(QueryMetricsResponseSchema, {
      interval: dayInterval,
      series: [
        {
          metric: MetricId.CONNECTIONS_TOTAL,
          points: {
            startTime: { nanos: 0, seconds: 0n },
            step: { nanos: 0, seconds: 1800n },
            values: Array.from({ length: 49 }, () => TEST_NUMBER_5),
          },
        },
        {
          metric: MetricId.TRANSACTIONS_PER_SECOND,
          points: {
            startTime: { nanos: 0, seconds: 0n },
            step: { nanos: 0, seconds: 1800n },
            values: [1],
          },
        },
      ],
    });

    const coverage = assessMetricsCoverage(response);
    expect(coverage.nascent).toBe(false);
    expect(coverage.finitePointCount).toBe(TEST_NUMBER_49);
  });
});

describe("samplesUntilChart", () => {
  test("counts the points still needed to reach the three-point floor", () => {
    expect(
      samplesUntilChart({
        finitePointCount: 0,
        firstSampleMs: null,
        nascent: true,
        windowEndMs: null,
      })
    ).toBe(TEST_NUMBER_3);
    expect(
      samplesUntilChart({
        finitePointCount: 2,
        firstSampleMs: 0,
        nascent: true,
        windowEndMs: 1,
      })
    ).toBe(1);
  });

  test("never goes negative once the chart can draw", () => {
    expect(
      samplesUntilChart({
        finitePointCount: 9,
        firstSampleMs: 0,
        nascent: false,
        windowEndMs: 1,
      })
    ).toBe(0);
  });
});

describe("metricRangeByHours", () => {
  test("resolves each known range by its window hours", () => {
    for (const range of METRIC_RANGES) {
      expect(metricRangeByHours(range.hours)).toBe(range);
    }
  });

  test("falls back to the default range for an unknown value", () => {
    expect(metricRangeByHours(TEST_NUMBER_999)).toBe(DEFAULT_METRIC_RANGE);
  });

  test("defaults to a 1h live window", () => {
    expect(DEFAULT_METRIC_RANGE.hours).toBe(1);
    expect(METRIC_RANGES[0]).toBe(DEFAULT_METRIC_RANGE);
  });
});

describe("noComparisonCaption", () => {
  test("names the selected range's missing comparison window", () => {
    expect(noComparisonCaption(DEFAULT_METRIC_RANGE)).toBe(
      "no 1h comparison yet"
    );
    expect(noComparisonCaption(metricRangeByHours(24))).toBe(
      "no 24h comparison yet"
    );
  });
});

describe("formatElapsedDuration", () => {
  test("labels sub-minute spans", () => {
    expect(formatElapsedDuration(TEST_NUMBER_30000)).toBe("less than a minute");
  });

  test("labels minute spans, singular and plural", () => {
    expect(formatElapsedDuration(TEST_NUMBER_60000)).toBe("1 minute");
    expect(formatElapsedDuration(TEST_NUMBER_8 * TEST_NUMBER_60000)).toBe(
      "8 minutes"
    );
  });

  test("labels hour spans, singular and plural", () => {
    expect(formatElapsedDuration(TEST_NUMBER_3600000)).toBe("about 1 hour");
    expect(
      formatElapsedDuration(TEST_NUMBER_7_POINT_4 * TEST_NUMBER_3600000)
    ).toBe("about 7 hours");
  });

  test("decomposes past hours into days", () => {
    expect(formatElapsedDuration(TEST_NUMBER_25 * TEST_NUMBER_3600000)).toBe(
      "about 1 day"
    );
    // A week-old transaction used to read "about 168 hours".
    expect(
      formatElapsedDuration(TEST_NUMBER_7 * 24 * TEST_NUMBER_3600000)
    ).toBe("about 7 days");
  });
});

describe("hasRenderableSpan", () => {
  test("rejects empty rows", () => {
    expect(hasRenderableSpan([])).toBe(false);
  });

  test("rejects a single finite point", () => {
    expect(hasRenderableSpan([{ "1": 5, time: 0 }])).toBe(false);
  });

  test("rejects rows whose extra timestamps are all gaps", () => {
    expect(
      hasRenderableSpan([
        { "1": 5, time: 0 },
        { "1": null, time: 60_000 },
      ])
    ).toBe(false);
  });

  test("accepts two finite-valued timestamps", () => {
    expect(
      hasRenderableSpan([
        { "1": 5, time: 0 },
        { "1": 6, time: 60_000 },
      ])
    ).toBe(true);
  });
});

describe("buildPreviousInstanceMetricsInput", () => {
  const anchorMs = TEST_NUMBER_7 * 24 * TEST_NUMBER_3600 * TEST_NUMBER_1000;

  test("tiles exactly one window before the current one, without comparison", () => {
    const input = buildPreviousInstanceMetricsInput(
      "instances/prod",
      anchorMs,
      TEST_NUMBER_6
    );

    expect(input.target).toBe("instances/prod");
    expect(input.metrics).toEqual(OVERVIEW_METRIC_IDS);
    expect(input.interval.endTime.seconds).toBe(
      BigInt(anchorMs / TEST_NUMBER_1000 - TEST_NUMBER_6 * TEST_NUMBER_3600)
    );
    expect(input.interval.startTime.seconds).toBe(
      BigInt(anchorMs / TEST_NUMBER_1000 - TEST_NUMBER_12 * TEST_NUMBER_3600)
    );
    expect("comparison" in input).toBe(false);
  });
});

describe("shiftMetricPoints", () => {
  test("shifts times forward and keeps gaps", () => {
    const shifted = shiftMetricPoints(
      [
        { time: 1000, value: 5 },
        { time: 2000, value: null },
      ],
      TEST_NUMBER_500
    );

    expect(shifted).toEqual([
      { time: 1500, value: 5 },
      { time: 2500, value: null },
    ]);
  });
});

describe("hasDrawablePoints", () => {
  test("needs at least two finite points", () => {
    expect(hasDrawablePoints([])).toBe(false);
    expect(hasDrawablePoints([{ time: 1, value: 2 }])).toBe(false);
    expect(
      hasDrawablePoints([
        { time: 1, value: 2 },
        { time: 2, value: null },
        { time: 3, value: 4 },
      ])
    ).toBe(true);
  });
});

describe("metricRangeWindowMs", () => {
  test("converts the range hours to milliseconds", () => {
    expect(metricRangeWindowMs(DEFAULT_METRIC_RANGE)).toBe(TEST_NUMBER_3600000);
  });
});

describe("buildInstanceMetricsInput", () => {
  const anchorMs = TEST_NUMBER_7 * 24 * TEST_NUMBER_3600 * TEST_NUMBER_1000; // one week past epoch

  test("builds a 1h window with a matching 1h comparison by default", () => {
    const input = buildInstanceMetricsInput("instances/prod", anchorMs, 1);

    expect(input.target).toBe("instances/prod");
    expect(input.metrics).toEqual(OVERVIEW_METRIC_IDS);
    expect(input.interval.endTime.seconds).toBe(
      BigInt(anchorMs / TEST_NUMBER_1000)
    );
    expect(input.interval.startTime.seconds).toBe(
      BigInt(anchorMs / TEST_NUMBER_1000 - TEST_NUMBER_3600)
    );
    // Comparison offset equals the window length, not a fixed 24h.
    expect(input.comparison.seconds).toBe(TEST_BIGINT_3600);
  });

  test("scales the window and comparison to the selected range", () => {
    for (const range of METRIC_RANGES) {
      const input = buildInstanceMetricsInput(
        "instances/prod",
        anchorMs,
        range.hours
      );
      const rangeSeconds = BigInt(range.hours * TEST_NUMBER_3600);

      expect(input.comparison.seconds).toBe(rangeSeconds);
      expect(
        input.interval.endTime.seconds - input.interval.startTime.seconds
      ).toBe(rangeSeconds);
    }
  });

  test("leaves step unset so the backend picks the bucket size", () => {
    const input = buildInstanceMetricsInput(
      "instances/prod",
      anchorMs,
      TEST_NUMBER_6
    );

    expect("step" in input).toBe(false);
  });
});
