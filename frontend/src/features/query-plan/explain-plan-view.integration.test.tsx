import { afterEach, expect, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainPlanView } from "@/features/query-plan/explain-plan-view";
import { EXPLAIN_ANALYZE_FIXTURE } from "@/test/fixtures/explain-plan-fixture";

const SHIPMENTS_ROW = /Seq Scan.*shipments/u;
const ROW_MISMATCH = /more rows|fewer rows/u;

afterEach(cleanup);

test("self-work selection keeps small operations reachable through a menu", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  await user.click(
    screen.getByRole("button", { name: "Inspect self work distribution" })
  );
  await user.click(
    screen.getByRole("menuitemradio", { name: "Inspect work for Hash: 15 ms" })
  );
  expect(
    within(
      screen.getByRole("complementary", { name: "Plan node details" })
    ).getByRole("heading", { name: "Hash" })
  ).not.toBeNull();
});

test("does not diagnose a one-row estimate rounding to zero as a statistics problem", () => {
  const rawPlan = JSON.stringify([
    {
      Plan: {
        "Node Type": "Seq Scan",
        "Plan Rows": 1,
        "Actual Rows": 0,
        "Actual Loops": 1,
        "Actual Total Time": 0.01,
      },
    },
  ]);
  render(<ExplainPlanView analyze={true} rawPlan={rawPlan} />);
  const inspector = screen.getByRole("complementary", {
    name: "Plan node details",
  });
  expect(within(inspector).queryByText("No rows returned")).toBeNull();
});

test("inspects a hotspot, changes metrics, collapses branches and preserves raw JSON", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  await user.click(screen.getByRole("tab", { name: "Operators" }));

  await user.click(
    screen.getByRole("button", { name: "Inspect Seq Scan on shipments" })
  );
  const inspector = screen.getByRole("complementary", {
    name: "Plan node details",
  });
  expect(
    within(inspector).getByText("(status = 'customs_hold'::text)")
  ).not.toBeNull();
  expect(within(inspector).getByText("100× more rows")).not.toBeNull();

  await user.click(screen.getByRole("combobox", { name: "Plan metric" }));
  await user.click(screen.getByRole("option", { name: "Shared buffers" }));
  expect(
    screen.getByRole("columnheader", { name: "Shared blocks" })
  ).not.toBeNull();
  expect(
    screen.getByRole("row", { name: SHIPMENTS_ROW }).textContent
  ).toContain("4,000");

  await user.click(
    screen.getByRole("button", { name: "Collapse Hash Join branch" })
  );
  expect(
    screen.queryByRole("button", { name: "Inspect Seq Scan on shipments" })
  ).toBeNull();
  expect(
    within(inspector).getByRole("heading", { name: "Hash Join" })
  ).not.toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Expand Hash Join branch" })
  );
  expect(
    screen.getByRole("button", { name: "Inspect Seq Scan on shipments" })
  ).not.toBeNull();

  await user.click(screen.getByRole("tab", { name: "JSON" }));
  expect(screen.getByRole("tabpanel", { name: "JSON" }).textContent).toContain(
    '"Hash Cond": "(s.carrier_id = c.id)"'
  );
});

test("compares rows per loop, not multiplied by the number of executions", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  await user.click(
    screen.getByRole("button", {
      name: "Inspect Index Scan on shipment_items using shipment_items_shipment_id_idx",
    })
  );
  const inspector = screen.getByRole("complementary", {
    name: "Plan node details",
  });
  expect(within(inspector).queryByText(ROW_MISMATCH)).toBeNull();
  expect(within(inspector).getByText("8,000")).not.toBeNull();
  expect(inspector.textContent).toContain("64 ms");
});

test("a new plan resets selection, metric availability and JSON fallback", async () => {
  const user = userEvent.setup();
  const view = render(
    <ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />
  );
  await user.click(
    screen.getByRole("button", { name: "Inspect Seq Scan on shipments" })
  );
  const rawPlan = JSON.stringify([
    { Plan: { "Node Type": "Result", "Plan Rows": 0, "Total Cost": 0 } },
  ]);
  view.rerender(<ExplainPlanView analyze={false} rawPlan={rawPlan} />);
  await user.click(screen.getByRole("tab", { name: "Operators" }));
  expect(
    screen.getByRole("columnheader", { name: "Est. cost" })
  ).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Result" })).not.toBeNull();
  expect(screen.queryByText("(status = 'customs_hold'::text)")).toBeNull();
  await user.click(screen.getByRole("combobox", { name: "Plan metric" }));
  expect(
    screen
      .getByRole("option", { name: "Self time" })
      .getAttribute("aria-disabled")
  ).toBe("true");
  await user.keyboard("{Escape}");
  view.rerender(
    <ExplainPlanView analyze={false} rawPlan="unrecognized plan output" />
  );
  expect(screen.getByRole("tabpanel", { name: "JSON" }).textContent).toContain(
    "unrecognized plan output"
  );
});

test("starts with expensive work and keeps map, operators and focus selection linked", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  expect(
    screen.getByRole("tab", { name: "Map" }).getAttribute("aria-selected")
  ).toBe("true");
  const inspector = () =>
    screen.getByRole("complementary", { name: "Plan node details" });
  expect(
    within(inspector()).getByRole("heading", { name: "Seq Scan" })
  ).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Inspect Hash Join" }));
  expect(within(inspector()).getByText("(s.carrier_id = c.id)")).not.toBeNull();
  await user.click(screen.getByRole("tab", { name: "Operators" }));
  await user.click(
    screen.getByRole("button", {
      name: "Inspect Index Scan on shipment_items using shipment_items_shipment_id_idx",
    })
  );
  await user.click(screen.getByRole("tab", { name: "Map" }));
  expect(
    screen
      .getByRole("button", {
        name: "Inspect Index Scan on shipment_items using shipment_items_shipment_id_idx",
      })
      .getAttribute("aria-pressed")
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: "Focus plan" }));
  expect(screen.getByRole("dialog", { name: "Query plan" })).not.toBeNull();
  expect(
    within(inspector()).getByRole("heading", { name: "Index Scan" })
  ).not.toBeNull();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Focus plan" })
  );
  expect(
    within(inspector()).getByRole("heading", { name: "Index Scan" })
  ).not.toBeNull();
});

test("keeps large plans readable and never attributes parallel work to self time", async () => {
  const user = userEvent.setup();
  const large = JSON.stringify([
    {
      Plan: {
        "Node Type": "Append",
        Plans: Array.from({ length: 60 }, (_, index) => ({
          "Node Type": "Seq Scan",
          "Relation Name": `partition_${index}`,
          "Plan Rows": 1,
        })),
      },
    },
  ]);
  const view = render(<ExplainPlanView analyze={false} rawPlan={large} />);
  expect(
    screen.getByRole("tab", { name: "Operators" }).getAttribute("aria-selected")
  ).toBe("true");
  await user.click(
    screen.getByRole("button", { name: "Inspect Seq Scan on partition_59" })
  );
  expect(
    within(
      screen.getByRole("complementary", { name: "Plan node details" })
    ).getByText("partition_59")
  ).not.toBeNull();
  const parallel = JSON.stringify([
    {
      Plan: {
        "Node Type": "Gather",
        "Workers Planned": 2,
        "Actual Total Time": 12,
        Plans: [
          {
            "Node Type": "Seq Scan",
            "Actual Total Time": 10,
            "Actual Loops": 3,
          },
        ],
      },
    },
  ]);
  view.rerender(<ExplainPlanView analyze={true} rawPlan={parallel} />);
  expect(
    screen.queryByRole("group", { name: "Approximate self work distribution" })
  ).toBeNull();
  expect(
    screen.getByText("Parallel work · self time unavailable")
  ).not.toBeNull();
  await user.click(screen.getByRole("combobox", { name: "Plan metric" }));
  expect(
    screen
      .getByRole("option", { name: "Self time" })
      .getAttribute("aria-disabled")
  ).toBe("true");
});

test("hotspot navigation follows the active metric rather than always selecting the slowest scan", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  await user.click(screen.getByRole("combobox", { name: "Plan metric" }));
  await user.click(screen.getByRole("option", { name: "Shared buffers" }));
  await user.click(screen.getByRole("button", { name: "Find hotspot" }));
  expect(
    within(
      screen.getByRole("complementary", { name: "Plan node details" })
    ).getByRole("heading", { name: "Sort" })
  ).not.toBeNull();
});
