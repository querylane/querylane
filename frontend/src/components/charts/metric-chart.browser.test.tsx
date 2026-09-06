import { expect, test } from "vitest";
import { page } from "vitest/browser";
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
  await page.getByTestId("metric-chart-surface").hover();
  await expect.element(page.getByText("15.00 req/s")).toBeVisible();
  await expect(page.getByTestId("metric-chart-fixture")).toMatchScreenshot(
    "metric-chart-kit"
  );
});
