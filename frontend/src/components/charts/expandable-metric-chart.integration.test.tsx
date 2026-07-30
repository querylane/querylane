import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ExpandableMetricChart } from "@/components/charts/expandable-metric-chart";

vi.mock("@/components/charts/metric-time-chart", () => ({
  MetricTimeChart: ({
    accessibilityLayer,
  }: {
    accessibilityLayer?: boolean | undefined;
  }) => (
    <div
      data-testid="metric-time-chart"
      role={accessibilityLayer === false ? undefined : "application"}
    />
  ),
}));

afterEach(() => {
  cleanup();
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
  expect(within(dialog).getByRole("application")).toBeTruthy();
});
