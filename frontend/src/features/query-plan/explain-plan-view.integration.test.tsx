import { afterEach, expect, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainPlanView } from "@/features/query-plan/explain-plan-view";
import { EXPLAIN_ANALYZE_FIXTURE } from "@/test/fixtures/explain-plan-fixture";

const SHIPMENTS_ROW = /Seq Scan.*shipments/;
const ROW_MISMATCH = /more rows|fewer rows/;

afterEach(cleanup);

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
