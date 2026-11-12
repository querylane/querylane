import { create } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { act } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { render } from "@/__tests__/render-ui";
import { InstanceMetricsPanel } from "@/components/console-pages/instance-metrics-panel";
import { DEFAULT_METRIC_RANGE } from "@/lib/metrics";
import {
  MetricId,
  MetricUnit,
  QueryMetricsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";
import type { ChartSeries } from "./chart-context";
import { MetricChart } from "./metric-chart";

const DISK_TAB = /Disk I\/O/u;
const CONNECTIONS_TAB = /Connections/u;

const series: ChartSeries[] = [
  {
    key: "read",
    label: "Read",
    color: "var(--color-chart-1)",
    dotClassName: "bg-chart-1",
  },
  {
    key: "write",
    label: "Write",
    color: "var(--color-chart-2)",
    dotClassName: "bg-chart-2",
  },
  {
    key: "previous",
    label: "Previous",
    color: "var(--color-chart-1)",
    dotClassName: "bg-chart-1",
    dashed: true,
  },
];
const data = [
  { time: 1000, read: 12, write: 9, previous: 30 },
  { time: 2000, read: 18, write: 12, previous: 22 },
];

function plotGeometry() {
  const chart = screen.getByRole("img", { name: "Metric time series" });
  return {
    paths: Array.from(chart.querySelectorAll("path[d]"), (path) =>
      path.getAttribute("d")
    ),
    labels: Array.from(
      chart.querySelectorAll("text"),
      (text) => text.textContent
    ),
  };
}

test.each(["line", "area", "stacked"] as const)(
  "%s emphasis preserves geometry, values and previous-period keyboard inspection at narrow width",
  async (variant) => {
    const user = userEvent.setup();
    await render(
      <ScreenshotFrame>
        <div className="h-80 w-72">
          <MetricChart
            data={data}
            formatValue={String}
            series={series}
            seriesEmphasis={true}
            variant={variant}
          />
        </div>
      </ScreenshotFrame>
    );
    const chart = page.getByRole("img", { name: "Metric time series" });
    await expect.element(chart).toBeVisible();
    const before = plotGeometry();
    const read = page.getByRole("button", { name: "Read", exact: true });
    await read.focus();
    await read.press("Enter");
    await expect.element(read).toHaveAttribute("aria-pressed", "true");
    await expect
      .element(
        page
          .getByRole("status")
          .filter({ hasText: "Read emphasized. All values remain shown." })
      )
      .toHaveText("Read emphasized. All values remain shown.");
    expect(plotGeometry()).toEqual(before);
    const svg = screen.getByRole("img", { name: "Metric time series" });
    const previous = svg.querySelector('path[stroke-dasharray="4 4"]');
    expect(Number(previous?.getAttribute("stroke-opacity"))).toBeLessThan(0.55);
    const competitor = svg.querySelector(
      variant === "stacked"
        ? 'path[fill*="color-mix"]'
        : 'path[stroke="var(--color-chart-2)"]'
    );
    expect(competitor).not.toBeNull();
    const dimmedPaint =
      variant === "stacked"
        ? competitor?.getAttribute("fill")?.includes("20%")
        : Number(competitor?.getAttribute("stroke-opacity")) < 1;
    expect(dimmedPaint).toBe(true);
    await chart.focus();
    await chart.press("Home");
    const tooltip = page.locator(".querylane-chart-tooltip");
    await expect
      .element(tooltip.getByText("12", { exact: true }))
      .toBeVisible();
    await expect.element(tooltip.getByText("9", { exact: true })).toBeVisible();
    await expect
      .element(tooltip.getByText("30", { exact: true }))
      .toBeVisible();
    await chart.press("Escape");
    await expect.element(read).toHaveAttribute("aria-pressed", "false");
    await read.focus();
    await read.press("Space");
    await expect.element(read).toHaveAttribute("aria-pressed", "true");
    await act(() =>
      user.pointer({
        keys: "[TouchA]",
        target: screen.getByRole("button", { name: "Read" }),
      })
    );
    await expect.element(read).toHaveAttribute("aria-pressed", "false");
    const bounds = screen
      .getByRole("button", { name: "Read" })
      .getBoundingClientRect();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    const group = screen.getByRole("group", { name: "Metric chart" });
    expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
  }
);

test("series-key identity, not array churn, owns emphasis reset; default legend stays passive", async () => {
  const chart = (items: ChartSeries[], enabled = true) => (
    <div className="size-80">
      <MetricChart
        data={data}
        formatValue={String}
        series={items}
        seriesEmphasis={enabled}
      />
    </div>
  );
  const view = await render(chart(series));
  const read = page.getByRole("button", { name: "Read", exact: true });
  await read.click();
  await view.rerender(chart(series.map((item) => ({ ...item })).toReversed()));
  await expect.element(read).toHaveAttribute("aria-pressed", "true");
  await view.rerender(chart(series.filter((item) => item.key !== "previous")));
  await expect.element(read).toHaveAttribute("aria-pressed", "false");
  await read.click();
  await view.rerender(chart(series));
  await expect.element(read).toHaveAttribute("aria-pressed", "false");
  await read.click();
  await view.rerender(chart(series, false));
  await expect.element(page.getByText("Read", { exact: true })).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
  await view.rerender(chart(series));
  await expect.element(read).toHaveAttribute("aria-pressed", "false");
});

test("the instance Disk I/O tab opts in without changing summaries or range controls", async () => {
  const response = create(QueryMetricsResponseSchema, {
    interval: {
      startTime: { seconds: 0n },
      endTime: { seconds: 86_400n },
    },
    series: [
      MetricId.IO_READ_BYTES_PER_SECOND,
      MetricId.IO_WRITE_BYTES_PER_SECOND,
    ].map((metric) => ({
      metric,
      unit: MetricUnit.BYTES_PER_SECOND,
      delta: { currentValue: 12, previousAvailable: false },
      points: {
        startTime: { seconds: 0n },
        step: { seconds: 1800n },
        values: Array.from({ length: 49 }, () => 12),
      },
    })),
  });
  const onRangeChange = rs.fn();
  await render(
    <ScreenshotFrame>
      <div className="w-80">
        <InstanceMetricsPanel
          isError={false}
          isPending={false}
          isRefreshing={false}
          onRangeChange={onRangeChange}
          range={DEFAULT_METRIC_RANGE}
          response={response}
        />
      </div>
    </ScreenshotFrame>
  );
  const disk = page.getByRole("tab", { name: DISK_TAB });
  await disk.click();
  const summary = screen.getByRole("tab", { name: DISK_TAB }).textContent;
  const read = page.getByRole("button", { name: "read", exact: true });
  await read.click();
  await expect.element(read).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("tab", { name: DISK_TAB }).textContent).toBe(summary);
  await page.getByRole("button", { name: "1h", exact: true }).click();
  expect(onRangeChange).toHaveBeenCalledWith(1);
  await page.getByRole("tab", { name: CONNECTIONS_TAB }).click();
  await expect.element(read).not.toBeVisible();
});
