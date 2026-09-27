import { create } from "@bufbuild/protobuf";
import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstanceMetricsPanel } from "@/components/console-pages/instance-metrics-panel";
import { DEFAULT_METRIC_RANGE, type MetricRange } from "@/lib/metrics";
import {
  MetricId,
  MetricKind,
  MetricUnit,
  type QueryMetricsResponse,
  QueryMetricsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

rs.mock("@/components/charts/metric-time-chart", () => ({
  MetricTimeChart: () => <div data-testid="metric-time-chart" />,
}));

const DAY_SECONDS = 24 * 3600;
const DAY_INTERVAL = {
  endTime: { nanos: 0, seconds: BigInt(DAY_SECONDS) },
  startTime: { nanos: 0, seconds: 0n },
};

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
            seconds: BigInt(DAY_SECONDS - 5 * 60),
          },
          step: { nanos: 0, seconds: 60n },
          values: [11, 12],
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
          values: Array.from({ length: 49 }, () => 12),
        },
        unit: MetricUnit.COUNT,
      },
    ],
  });
}

/** Exactly three finite points — the drawable floor. */

function renderPanel(overrides: {
  onRangeChange?: (rangeHours: number) => void;
  range?: MetricRange;
  response: QueryMetricsResponse;
}) {
  const onRangeChange = overrides.onRangeChange ?? rs.fn();
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

describe("InstanceMetricsPanel comparison overlay", () => {
  test("draws the previous-period overlay automatically, with no toggle", async () => {
    renderPanel({ response: fullResponse(true) });

    // The overlay is always on: there is no switch and no toggle label to hunt
    // for, on any tab.
    fireEvent.click(screen.getByRole("tab", { name: CONNECTIONS_TAB_PATTERN }));
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(COMPARE_TOGGLE_PATTERN)).toBeNull();

    // And the old header-level "vs previous" button stays gone.
    expect(screen.queryByRole("button", { name: "vs previous" })).toBeNull();
    await screen.findByTestId("metric-time-chart");
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
    expect(screen.getAllByText("collecting")).toHaveLength(4);
  });
});
