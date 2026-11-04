import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { Input } from "@/components/ui/input";
import type { ChartSeries } from "./chart-context";
import { MetricChart } from "./metric-chart";

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

test("a runtime render error preserves the chart slot, adjacent plot and editable controls through retry", async () => {
  const { reportError } = globalThis;
  const reportedError = rs
    .spyOn(globalThis, "reportError")
    .mockImplementation((error: unknown) => {
      if (
        !(
          error instanceof Error &&
          error.message === "Metric formatter unavailable"
        )
      ) {
        reportError(error);
      }
    });
  let failed = true;
  function formatValue(value: number) {
    if (failed) {
      throw new Error("Metric formatter unavailable");
    }
    return String(value);
  }
  await render(
    <ScreenshotFrame>
      <Input aria-label="Range note" defaultValue="24 hours" />
      <div className="size-72" data-testid="optional-plot">
        <MetricChart
          data={data}
          formatValue={formatValue}
          series={series}
          yAxisMode="inset"
        />
      </div>
      <div className="size-72">
        <MetricChart data={data} formatValue={String} series={series} />
      </div>
    </ScreenshotFrame>,
    { createRootOptions: { onCaughtError: rs.fn() } }
  );
  const failure = page.getByRole("alert");
  await expect.element(failure).toBeVisible();
  expect(reportedError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Metric formatter unavailable" })
  );
  const slot = screen.getByTestId("optional-plot");
  const before = slot.getBoundingClientRect().height;
  await expect
    .element(page.getByRole("img", { name: "Metric time series" }))
    .toBeVisible();
  const note = page.getByRole("textbox", { name: "Range note" });
  await note.fill("1 hour");
  await page.getByRole("button", { name: "Retry chart" }).click();
  await expect.element(failure).toBeVisible();
  await expect.element(note).toHaveValue("1 hour");
  failed = false;
  await page.getByRole("button", { name: "Retry chart" }).click();
  await expect.element(failure).not.toBeVisible();
  await expect.element(note).toHaveValue("1 hour");
  expect(
    screen.getAllByRole("img", { name: "Metric time series" })
  ).toHaveLength(2);
  expect(slot.getBoundingClientRect().height).toBe(before);
});
