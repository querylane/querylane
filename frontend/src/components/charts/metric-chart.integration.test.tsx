import { afterEach, expect, rs, test } from "@rstest/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { use } from "react";
import { Input } from "@/components/ui/input";
import { MetricChart, MetricSparkline } from "./metric-chart";

const boundary = rs.hoisted(() => ({
  mode: "healthy",
  pending: Promise.withResolvers<void>(),
}));

// The optional runtime is the external boundary; the lazy wrapper stays real.
function RuntimeChart() {
  if (boundary.mode === "loading") {
    use(boundary.pending.promise);
  }
  if (boundary.mode === "failed") {
    throw new Error("Chart render failed");
  }
  return <p>Healthy metric plot</p>;
}
function RuntimeTrend() {
  if (boundary.mode === "failed") {
    throw new Error("Trend render failed");
  }
  return <p>Healthy trend</p>;
}
rs.mock("@/components/charts/metric-time-chart", () => ({
  MetricTimeChart: RuntimeChart,
}));
rs.mock("@/components/charts/sparkline-chart", () => ({
  SparklineChart: RuntimeTrend,
}));

afterEach(() => {
  cleanup();
  boundary.mode = "healthy";
});

const series = [
  {
    key: "read",
    label: "Read",
    color: "currentColor",
    dotClassName: "bg-chart-1",
  },
  {
    key: "write",
    label: "Write",
    color: "currentColor",
    dotClassName: "bg-chart-2",
  },
];

function Panel() {
  return (
    <>
      <Input aria-label="Range" defaultValue="24 hours" />
      <MetricChart data={[]} formatValue={String} series={series} />
    </>
  );
}

test("loading reserves a contextual non-focusable plot and legend, then settles", async () => {
  boundary.pending = Promise.withResolvers<void>();
  boundary.mode = "loading";
  render(<Panel />);
  const pending = await screen.findByRole("status", {
    name: "Loading metric chart",
  });
  expect(pending.textContent).toContain("Read");
  expect(pending.textContent).toContain("Write");
  expect(pending.querySelector("button, input, [tabindex]")).toBeNull();
  act(() => {
    // Retry the same use() with its fulfilled promise, like a real resource.
    boundary.pending.resolve();
  });
  expect(await screen.findByText("Healthy metric plot")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

test("a render failure stays local; controls keep state and explicit retry recovers", async () => {
  const user = userEvent.setup();
  boundary.mode = "failed";
  render(<Panel />, { onCaughtError: rs.fn() });
  const failure = await screen.findByRole("alert");
  expect(failure.textContent).toContain("Chart unavailable");
  const range = screen.getByRole("textbox", { name: "Range" });
  await user.clear(range);
  await user.type(range, "1 hour");
  boundary.mode = "healthy";
  await user.click(screen.getByRole("button", { name: "Retry chart" }));
  expect(await screen.findByText("Healthy metric plot")).toBeTruthy();
  expect(screen.getByDisplayValue("1 hour")).toBe(range);
});

test("a failed sparkline has a concise accessible placeholder, not a repeated alert or retry control", async () => {
  boundary.mode = "failed";
  render(<MetricSparkline color="currentColor" data={[]} seriesKey="read" />, {
    onCaughtError: rs.fn(),
  });
  expect(
    await screen.findByRole("img", { name: "Metric trend unavailable" })
  ).toBeTruthy();
  await waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
  expect(screen.queryByRole("button")).toBeNull();
});
