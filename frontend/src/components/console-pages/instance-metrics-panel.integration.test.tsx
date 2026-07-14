import { create } from "@bufbuild/protobuf";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InstanceMetricsPanel } from "@/components/console-pages/instance-metrics-panel";
import {
  DEFAULT_METRIC_RANGE,
  type MetricRange,
  metricRangeByHours,
} from "@/lib/metrics";
import {
  MetricId,
  MetricKind,
  MetricUnit,
  type QueryMetricsResponse,
  QueryMetricsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

const TEST_NUMBER_3600 = 3600;
const TEST_NUMBER_5 = 5;
const TEST_NUMBER_11 = 11;
const TEST_NUMBER_12 = 12;
const TEST_NUMBER_3 = 3;
const TEST_NUMBER_6 = 6;
const TEST_NUMBER_4 = 4;

const DAY_SECONDS = 24 * TEST_NUMBER_3600;
const DAY_INTERVAL = {
  endTime: { nanos: 0, seconds: BigInt(DAY_SECONDS) },
  startTime: { nanos: 0, seconds: 0n },
};

const TREND_1H_PATTERN = /· 1h/;
const TREND_24H_PATTERN = /· 24h/;
const CONNECTIONS_TAB_PATTERN = /Connections/;
const COMPARE_TOGGLE_PATTERN = /compare to previous/i;

/**
 * Two finite connection samples ending 5 minutes before the window edge — below
 * the three-point floor, so the panel shows the collecting state.
 */
function nascentResponse(): QueryMetricsResponse {
  return create(QueryMetricsResponseSchema, {
    interval: DAY_INTERVAL,
    series: [
      {
        delta: { currentValue: 12, previousAvailable: false },
        kind: MetricKind.GAUGE,
        metric: MetricId.CONNECTIONS_TOTAL,
        points: {
          startTime: {
            nanos: 0,
            seconds: BigInt(DAY_SECONDS - TEST_NUMBER_5 * 60),
          },
          step: { nanos: 0, seconds: 60n },
          values: [TEST_NUMBER_11, TEST_NUMBER_12],
        },
        unit: MetricUnit.COUNT,
      },
    ],
  });
}

/** A connections series with `previousAvailable` and enough points to draw. */
function fullResponse(previousAvailable: boolean): QueryMetricsResponse {
  return create(QueryMetricsResponseSchema, {
    interval: DAY_INTERVAL,
    series: [
      {
        delta: { currentValue: 12, percentChange: 8, previousAvailable },
        kind: MetricKind.GAUGE,
        metric: MetricId.CONNECTIONS_TOTAL,
        points: {
          startTime: { nanos: 0, seconds: 0n },
          step: { nanos: 0, seconds: 1800n },
          values: Array.from({ length: 49 }, () => TEST_NUMBER_12),
        },
        unit: MetricUnit.COUNT,
      },
    ],
  });
}

/** Exactly three finite points — the drawable floor. */
function threePointResponse(): QueryMetricsResponse {
  return create(QueryMetricsResponseSchema, {
    interval: DAY_INTERVAL,
    series: [
      {
        delta: { currentValue: 12, previousAvailable: false },
        kind: MetricKind.GAUGE,
        metric: MetricId.CONNECTIONS_TOTAL,
        points: {
          startTime: {
            nanos: 0,
            seconds: BigInt(DAY_SECONDS - TEST_NUMBER_3 * 60),
          },
          step: { nanos: 0, seconds: 60n },
          values: [10, TEST_NUMBER_11, TEST_NUMBER_12],
        },
        unit: MetricUnit.COUNT,
      },
    ],
  });
}

function renderPanel(overrides: {
  onRangeChange?: (rangeHours: number) => void;
  range?: MetricRange;
  response: QueryMetricsResponse;
}) {
  const onRangeChange = overrides.onRangeChange ?? vi.fn();
  render(
    <InstanceMetricsPanel
      isError={false}
      isPending={false}
      isRefreshing={false}
      onRangeChange={onRangeChange}
      range={overrides.range ?? DEFAULT_METRIC_RANGE}
      response={overrides.response}
    />
  );
  return { onRangeChange };
}

afterEach(() => {
  cleanup();
});

describe("InstanceMetricsPanel range picker", () => {
  test("renders the four range options with 1h active by default", () => {
    renderPanel({ response: fullResponse(true) });

    for (const label of ["1h", "6h", "24h", "7d"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(
      screen.getByRole("button", { name: "1h" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "6h" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  test("reports the selected window when a range is clicked", () => {
    const { onRangeChange } = renderPanel({ response: fullResponse(true) });

    fireEvent.click(screen.getByRole("button", { name: "6h" }));
    expect(onRangeChange).toHaveBeenCalledWith(TEST_NUMBER_6);
  });

  test("keeps the picker visible while collecting", () => {
    renderPanel({ response: nascentResponse() });

    expect(screen.getByText("Collecting metrics")).toBeTruthy();
    expect(screen.getByRole("button", { name: "24h" })).toBeTruthy();
  });
});

describe("InstanceMetricsPanel trend labels", () => {
  test("suffixes the trend with the selected range", () => {
    renderPanel({
      range: metricRangeByHours(24),
      response: fullResponse(true),
    });

    expect(screen.getByText("+8%")).toBeTruthy();
    expect(screen.getByText(TREND_24H_PATTERN)).toBeTruthy();
    expect(screen.queryByText(TREND_1H_PATTERN)).toBeNull();
  });

  test("falls back to a range-aware no-comparison caption", () => {
    renderPanel({
      range: metricRangeByHours(TEST_NUMBER_6),
      response: fullResponse(false),
    });

    // The Transactions/Cache/IO tabs have no series, plus Connections has no
    // comparison — all show the 6h caption, never a stale 24h one.
    expect(screen.getAllByText("no 6h comparison yet").length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText("no 24h comparison yet")).toBeNull();
  });
});

describe("InstanceMetricsPanel comparison overlay", () => {
  test("draws the previous-period overlay automatically, with no toggle", () => {
    renderPanel({ response: fullResponse(true) });

    // The overlay is always on: there is no switch and no toggle label to hunt
    // for, on any tab.
    fireEvent.click(screen.getByRole("tab", { name: CONNECTIONS_TAB_PATTERN }));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(COMPARE_TOGGLE_PATTERN)).toBeNull();

    // And the old header-level "vs previous" button stays gone.
    expect(screen.queryByRole("button", { name: "vs previous" })).toBeNull();
  });
});

describe("InstanceMetricsPanel nascent coverage", () => {
  test("shows a concrete collecting state below the three-point floor", () => {
    renderPanel({ response: nascentResponse() });

    expect(screen.getByText("Collecting metrics")).toBeTruthy();
    expect(
      screen.getByText(
        "Collection started 5 minutes ago. Charts appear after ~1 more sample — usually within 2–3 minutes."
      )
    ).toBeTruthy();
    // No chart tabs while collecting; stat tiles stay static with live values.
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getAllByText("collecting")).toHaveLength(TEST_NUMBER_4);
  });

  test("draws the tabbed charts once three points exist", () => {
    renderPanel({ response: threePointResponse() });

    expect(screen.queryByText("Collecting metrics")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(TEST_NUMBER_4);
  });
});
