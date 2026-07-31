import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ExpandableMetricChart } from "@/components/charts/expandable-metric-chart";

vi.mock("@/components/charts/metric-time-chart", () => ({
  MetricTimeChart: ({
    accessibilityLayer,
    compact,
    yAxisScale,
  }: {
    accessibilityLayer?: boolean | undefined;
    compact?: boolean | undefined;
    yAxisScale?: "data" | "zero" | undefined;
  }) => (
    <div
      data-compact={String(compact)}
      data-testid="metric-time-chart"
      data-y-axis-scale={yAxisScale}
      role={accessibilityLayer === false ? undefined : "application"}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("keeps Recharts keyboard semantics out of the chart button", async () => {
  const user = userEvent.setup();
  render(
    <ExpandableMetricChart
      data={[
        { time: 0, value: 1 },
        { time: 1, value: 2 },
      ]}
      formatValue={String}
      series={[
        {
          color: "currentColor",
          dotClassName: "bg-primary",
          key: "value",
          label: "Connections",
        },
      ]}
      title="Connections metrics"
      triggerClassName="h-72 w-full"
    />
  );

  const trigger = await screen.findByRole("button", {
    name: "Expand Connections metrics",
  });
  expect(within(trigger).queryByRole("application")).toBeNull();

  await user.click(trigger);

  const dialog = await screen.findByRole("dialog", {
    name: "Connections metrics",
  });
  const expandedChart = within(dialog).getByRole("application");
  expect(expandedChart.dataset["yAxisScale"]).toBe("data");
});

test("uses a compact chart presentation on mobile", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    }))
  );

  render(
    <ExpandableMetricChart
      data={[
        { time: 0, value: 1 },
        { time: 1, value: 2 },
      ]}
      formatValue={String}
      series={[
        {
          color: "currentColor",
          dotClassName: "bg-primary",
          key: "value",
          label: "Connections",
        },
      ]}
      title="Connections metrics"
      triggerClassName="h-72 w-full"
    />
  );

  await user.click(
    screen.getByRole("button", { name: "Expand Connections metrics" })
  );

  const dialog = await screen.findByRole("dialog", {
    name: "Connections metrics",
  });
  const chart = within(dialog).getByTestId("metric-time-chart");
  await waitFor(() => {
    expect(chart.dataset["compact"]).toBe("true");
  });
});
