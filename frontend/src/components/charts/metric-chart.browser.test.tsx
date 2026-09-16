import { expect, test } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { MetricChart, MetricSparkline } from "@/components/charts/metric-chart";

const minute = 60_000;
const start = Date.UTC(2026, 7, 23, 12);
const data = [
  { previous: 9, requests: 12, time: start },
  { previous: 12, requests: 18, time: start + minute },
  { previous: 10, requests: 15, time: start + minute * 2 },
  { previous: 15, requests: null, time: start + minute * 3 },
  { previous: 14, requests: 22, time: start + minute * 4 },
  { previous: 16, requests: 24, time: start + minute * 5 },
];

async function hoverLineEnd(chart: Locator, selector: string) {
  const line = chart.element().querySelector<SVGPathElement>(selector);
  const transform = line?.getScreenCTM();
  if (!(line && transform)) {
    throw new Error(`Expected a chart line matching ${selector}`);
  }
  const point = line
    .getPointAtLength(line.getTotalLength())
    .matrixTransform(transform);
  const bounds = chart.element().getBoundingClientRect();
  await chart.hover({
    position: { x: point.x - bounds.left, y: point.y - bounds.top },
  });
  return point;
}

test("renders the metric chart kit", async () => {
  render(
    <ScreenshotFrame>
      <div
        className="w-[760px] space-y-6 rounded-xl border border-border bg-card p-6"
        data-testid="metric-chart-fixture"
      >
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base">Requests</h2>
              <p className="text-muted-foreground text-xs">
                Current and previous five-minute windows
              </p>
            </div>
            <div className="h-12 w-40">
              <MetricSparkline
                color="var(--color-chart-1)"
                data={data}
                seriesKey="requests"
              />
            </div>
          </div>
          <div className="h-72 w-full" data-testid="metric-chart-surface">
            <MetricChart
              data={data}
              formatDetailedValue={(value) => `${value.toFixed(2)} req/s`}
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
                  dashed: true,
                  dotClassName: "bg-chart-1",
                  key: "previous",
                  label: "Previous",
                },
              ]}
              thresholds={[
                { label: "Alert threshold", tone: "critical", value: 20 },
              ]}
            />
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("img", { name: "Metric time series" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("img", { name: "Metric trend" }))
    .toBeVisible();
  const filledAreaPaths = page
    .getByTestId("metric-chart-fixture")
    .element()
    .querySelectorAll<SVGPathElement>('path[fill^="url("]');
  expect(filledAreaPaths.length).toBeGreaterThanOrEqual(2);
  for (const path of filledAreaPaths) {
    expect(path.getAttribute("stroke-width")).toBe("0");
  }
  await expect.element(page.getByText("Alert threshold")).toBeVisible();
  const chart = page.getByRole("img", { name: "Metric time series" });
  const currentPoint = await hoverLineEnd(
    chart,
    'path[stroke="var(--color-chart-1)"][stroke-width="2"]'
  );
  await expect.element(page.getByText("15.00 req/s")).toBeVisible();
  const tooltip = page.getByRole("status");
  await expect
    .element(tooltip.getByText("Current").element().parentElement)
    .toHaveAttribute("data-active", "true");
  await expect
    .element(tooltip.getByText("Previous").element().parentElement)
    .toHaveAttribute("data-active", "false");
  await expect.element(tooltip.getByText("10.00 req/s")).toBeVisible();
  await expect.element(tooltip).toHaveAttribute("data-placement", "top");
  expect(tooltip.element().getBoundingClientRect().bottom).toBeLessThan(
    currentPoint.y
  );
  await expect(page.getByTestId("metric-chart-fixture")).toMatchScreenshot(
    "metric-chart-kit"
  );

  await hoverLineEnd(
    chart,
    'path[stroke="var(--color-chart-1)"][stroke-dasharray="4 4"]'
  );
  await expect.element(tooltip.getByText("16.00 req/s")).toBeVisible();
  await expect
    .element(tooltip.getByText("Previous").element().parentElement)
    .toHaveAttribute("data-active", "true");
  await expect
    .element(tooltip.getByText("Current").element().parentElement)
    .toHaveAttribute("data-active", "false");

  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Home}");
  await expect.element(tooltip.getByText("12.00 req/s")).toBeVisible();
  await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
  await expect.element(tooltip.getByText("–")).toBeVisible();
  await expect.element(tooltip.getByText("15.00 req/s")).toBeVisible();
  await user.keyboard("{End}");
  await expect.element(tooltip.getByText("24.00 req/s")).toBeVisible();
  const tooltipElement = tooltip.element();
  await user.tab();
  await expect.element(tooltipElement).not.toBeVisible();
});

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

  // Height-only changes must relayout even when width and data stay unchanged.
  await view.rerender(<div className={fixture.tallClassName}>{content}</div>);
  await expect.element(surface).toHaveAttribute("viewBox", fixture.tallViewBox);

  const chartElement = surface.element();
  await view.rerender(<div className="hidden">{content}</div>);
  await expect.element(chartElement).not.toBeVisible();
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
    const user = userEvent.setup();
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
    await expect
      .element(page.getByRole("img", { name: "Metric time series" }))
      .toBeVisible();
    await user.tab();
    await user.keyboard("{Home}");
    const tooltip = page.getByRole("status");
    await expect.element(tooltip.getByText("12 req/s")).toBeVisible();
    await expect.element(tooltip.getByText("9 req/s")).toBeVisible();
    // Grouped keyboard navigation picks the topmost point at each timestamp.
    const activeLabel = variant === "stacked" ? "Previous" : "Current";
    await expect
      .element(tooltip.getByText(activeLabel).element().parentElement)
      .toHaveAttribute("data-active", "true");
    await user.keyboard("{ArrowRight}");
    await expect.element(tooltip.getByText("18 req/s")).toBeVisible();
    await expect.element(tooltip.getByText("12 req/s")).toBeVisible();
  }
);
