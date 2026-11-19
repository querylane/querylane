import { type Locator, page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import { MetricChart, MetricSparkline } from "@/components/charts/metric-chart";

const MINUTE_MS = 60_000;
const START_MS = Date.parse("2026-08-23T12:00:00Z");

const SAMPLES = [
  { previous: 9, requests: 12 },
  { previous: 12, requests: 18 },
  { previous: 10, requests: 15 },
  { previous: 15, requests: null },
  { previous: 14, requests: 22 },
  { previous: 16, requests: 24 },
];

const data = SAMPLES.map((sample, index) => ({
  ...sample,
  time: START_MS + index * MINUTE_MS,
}));

function tooltipRow(tooltip: Locator, label: string) {
  return tooltip.locator(".ts-chart-tooltip__row").filter({ hasText: label });
}

test.each([
  {
    compactClassName: "h-40 w-60",
    compactViewBox: "0 0 240 160",
    expandedClassName: "h-72 w-[640px]",
    expandedViewBox: "0 0 640 288",
    label: "Metric time series",
    tallClassName: "h-80 w-[640px]",
    tallViewBox: "0 0 640 320",
  },
  {
    compactClassName: "h-8 w-24",
    compactViewBox: "0 0 96 32",
    expandedClassName: "h-12 w-40",
    expandedViewBox: "0 0 160 48",
    label: "Metric trend",
    tallClassName: "h-16 w-40",
    tallViewBox: "0 0 160 64",
  },
])("resizes $label with its CSS-owned slot", async (fixture) => {
  const content =
    fixture.label === "Metric trend" ? (
      <MetricSparkline
        color="var(--color-chart-1)"
        data={data}
        seriesKey="requests"
      />
    ) : (
      <MetricChart
        data={data}
        formatValue={(value) => `${value} req/s`}
        series={[
          {
            color: "var(--color-chart-1)",
            dotClassName: "bg-chart-1",
            key: "requests",
            label: "Current",
          },
        ]}
      />
    );
  const view = await render(
    <div className={fixture.compactClassName}>{content}</div>
  );
  const surface = page.getByRole("img", { name: fixture.label });
  await expect
    .element(surface)
    .toHaveAttribute("viewBox", fixture.compactViewBox);

  await view.rerender(
    <div className={fixture.expandedClassName}>{content}</div>
  );
  await expect
    .element(surface)
    .toHaveAttribute("viewBox", fixture.expandedViewBox);

  await view.rerender(<div className={fixture.tallClassName}>{content}</div>);
  await expect.element(surface).toHaveAttribute("viewBox", fixture.tallViewBox);

  const chartElement = screen.getByRole("img", { name: fixture.label });
  await view.rerender(<div className="hidden">{content}</div>);
  await expect.poll(() => chartElement.checkVisibility()).toBe(false);
  await view.rerender(
    <div className={fixture.compactClassName}>{content}</div>
  );
  await expect
    .element(surface)
    .toHaveAttribute("viewBox", fixture.compactViewBox);
  await expect.element(surface).toBeVisible();
  await view.unmount();
  expect(chartElement.isConnected).toBe(false);
});

test.each(["line", "stacked"] as const)(
  "keeps same-colored %s series distinct during keyboard inspection",
  async (variant) => {
    await render(
      <div className="h-72 w-80">
        <MetricChart
          data={data}
          formatValue={(value) => `${value} req/s`}
          series={[
            {
              color: "var(--color-chart-1)",
              dotClassName: "bg-chart-1",
              key: "requests",
              label: "Current",
            },
            {
              color: "var(--color-chart-1)",
              dotClassName: "bg-chart-1",
              key: "previous",
              label: "Previous",
            },
          ]}
          variant={variant}
        />
      </div>
    );
    const chart = page.getByRole("img", { name: "Metric time series" });
    await expect.element(chart).toBeVisible();
    await chart.focus();
    await chart.press("Home");
    const tooltip = page.getByRole("status");
    await expect.element(tooltip.getByText("12 req/s")).toBeVisible();
    await expect.element(tooltip.getByText("9 req/s")).toBeVisible();

    const activeLabel = variant === "stacked" ? "Previous" : "Current";
    await expect
      .element(tooltipRow(tooltip, activeLabel))
      .toHaveAttribute("data-active", "true");
    await chart.press("ArrowRight");
    await expect.element(tooltip.getByText("18 req/s")).toBeVisible();
    await expect.element(tooltip.getByText("12 req/s")).toBeVisible();
  }
);
