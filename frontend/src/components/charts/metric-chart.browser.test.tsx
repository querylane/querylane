import { type Locator, page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { MetricChart, MetricSparkline } from "@/components/charts/metric-chart";
import {
  CURRENT_LINE_SELECTOR,
  METRIC_CHART_SAMPLE_DATA as data,
  PREVIOUS_LINE_SELECTOR,
} from "@/visual-harness/chart-scenario-data";
import { MetricChartKitScenario } from "@/visual-harness/chart-scenarios";

async function hoverLineEnd(chart: Locator, selector: string) {
  const chartElement = screen.getByRole("img", { name: "Metric time series" });
  const line = chartElement.querySelector<SVGPathElement>(selector);
  const transform = line?.getScreenCTM();
  if (!(line && transform)) {
    throw new Error(`Expected a chart line matching ${selector}`);
  }
  const point = line
    .getPointAtLength(line.getTotalLength())
    .matrixTransform(transform);
  const bounds = chartElement.getBoundingClientRect();
  await chart.hover({
    position: { x: point.x - bounds.left, y: point.y - bounds.top },
  });
  return point;
}

function tooltipRow(tooltip: Locator, label: string) {
  return tooltip.locator(".ts-chart-tooltip__row").filter({ hasText: label });
}

// Pixels for the hovered chart kit live in e2e/visual/charts.spec.ts, which
// opens the same scenario through the visual harness.
test("renders the metric chart kit", async () => {
  await render(
    <ScreenshotFrame>
      <MetricChartKitScenario />
    </ScreenshotFrame>
  );

  const chart = page.getByRole("img", { name: "Metric time series" });
  await expect.element(chart).toBeVisible();
  await expect
    .element(page.getByRole("img", { name: "Metric trend" }))
    .toBeVisible();
  const filledAreaPaths = screen
    .getByTestId("metric-chart-fixture")
    .querySelectorAll<SVGPathElement>('path[fill^="url("]');
  expect(filledAreaPaths.length).toBeGreaterThanOrEqual(2);
  for (const path of filledAreaPaths) {
    expect(path.getAttribute("stroke-width")).toBe("0");
  }
  await expect.element(page.getByText("Alert threshold")).toBeVisible();
  const currentPoint = await hoverLineEnd(chart, CURRENT_LINE_SELECTOR);
  await expect.element(page.getByText("15.00 req/s")).toBeVisible();
  const tooltip = page.getByRole("status");
  await expect
    .element(tooltipRow(tooltip, "Current"))
    .toHaveAttribute("data-active", "true");
  await expect
    .element(tooltipRow(tooltip, "Previous"))
    .toHaveAttribute("data-active", "false");
  const activeRow = tooltipRow(tooltip, "Current");
  await expect
    .element(activeRow)
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect.element(activeRow).toHaveCSS("box-shadow", "none");
  await expect.element(activeRow).toHaveCSS("font-weight", "500");
  await expect.element(tooltip.getByText("10.00 req/s")).toBeVisible();
  await expect.element(tooltip).toHaveAttribute("data-placement", "top");
  expect(
    screen.getByRole("status").getBoundingClientRect().bottom
  ).toBeLessThan(currentPoint.y);

  await hoverLineEnd(chart, PREVIOUS_LINE_SELECTOR);
  await expect.element(tooltip.getByText("16.00 req/s")).toBeVisible();
  await expect
    .element(tooltipRow(tooltip, "Previous"))
    .toHaveAttribute("data-active", "true");
  await expect
    .element(tooltipRow(tooltip, "Current"))
    .toHaveAttribute("data-active", "false");

  await chart.focus();
  await chart.press("Home");
  await expect.element(tooltip.getByText("12.00 req/s")).toBeVisible();
  await chart.press("ArrowRight");
  await chart.press("ArrowRight");
  await chart.press("ArrowRight");
  await expect.element(tooltip.getByText("–")).toBeVisible();
  await expect.element(tooltip.getByText("15.00 req/s")).toBeVisible();
  await chart.press("End");
  await expect.element(tooltip.getByText("24.00 req/s")).toBeVisible();
  const tooltipElement = screen.getByRole("status");
  await chart.blur();
  await expect.poll(() => tooltipElement.checkVisibility()).toBe(false);
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
    // Grouped keyboard navigation picks the topmost point at each timestamp.
    const activeLabel = variant === "stacked" ? "Previous" : "Current";
    await expect
      .element(tooltipRow(tooltip, activeLabel))
      .toHaveAttribute("data-active", "true");
    await chart.press("ArrowRight");
    await expect.element(tooltip.getByText("18 req/s")).toBeVisible();
    await expect.element(tooltip.getByText("12 req/s")).toBeVisible();
  }
);
