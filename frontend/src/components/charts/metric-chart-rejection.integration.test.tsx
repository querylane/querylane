import { expect, rs, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import { MetricChart, MetricSparkline } from "./metric-chart";

rs.mock("@/components/charts/metric-time-chart", () => {
  throw new Error("Module initialization failed");
});
rs.mock("@/components/charts/sparkline-chart", () => {
  throw new Error("Module initialization failed");
});

test("rejected chart imports stay local without offering a cached-import retry", async () => {
  const view = render(
    <>
      <p>Instance controls</p>
      <MetricChart data={[]} formatValue={String} series={[]} />
      <MetricSparkline color="currentColor" data={[]} seriesKey="read" />
    </>,
    { onCaughtError: rs.fn() }
  );
  const failure = await screen.findByRole("alert");
  expect(failure.textContent).toContain("Reload the page");
  expect(screen.getByText("Instance controls")).toBeTruthy();
  expect(
    await screen.findByRole("img", { name: "Metric trend unavailable" })
  ).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<MetricChart data={[]} formatValue={String} series={[]} />);
  const repeatedFailure = await screen.findByRole("alert");
  expect(repeatedFailure.textContent).toContain("Reload the page");
});
