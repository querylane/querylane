import type { Page } from "playwright/test";
import { CURRENT_LINE_SELECTOR } from "../../src/visual-harness/chart-scenario-data";
import { expect, test } from "../tests/base";

// Isolated chart kit rendered by src/visual-harness. Behavior for the same
// scenario is covered in src/components/charts/metric-chart.rstest-browser.test.tsx.

async function lineEndPoint(page: Page, selector: string) {
  return await page
    .getByRole("img", { name: "Metric time series" })
    .evaluate((chart, lineSelector) => {
      const line = chart.querySelector<SVGPathElement>(lineSelector);
      const transform = line?.getScreenCTM();
      if (!(line && transform)) {
        throw new Error(`Expected a chart line matching ${lineSelector}`);
      }
      const point = line
        .getPointAtLength(line.getTotalLength())
        .matrixTransform(transform);
      return { x: point.x, y: point.y };
    }, selector);
}

test("metric chart kit shows the current-series tooltip", async ({ page }) => {
  await page.goto("/visual.html?scenario=metric-chart-kit");
  const fixture = page.getByTestId("metric-chart-fixture");
  await expect(
    fixture.getByRole("img", { name: "Metric time series" })
  ).toBeVisible();
  await expect(fixture.getByText("Alert threshold")).toBeVisible();

  const point = await lineEndPoint(page, CURRENT_LINE_SELECTOR);
  await page.mouse.move(point.x, point.y);

  const tooltip = page.getByRole("status");
  await expect(tooltip.getByText("15.00 req/s")).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-placement", "top");
  await expect(fixture).toHaveScreenshot("metric-chart-kit.png");
});
