import { afterEach, expect, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainPlanView } from "@/features/query-plan/explain-plan-view";
import { EXPLAIN_ANALYZE_FIXTURE } from "./explain-plan.fixture";

const SHIPMENTS_NODE_NAME = /^(?:Inspect )?Seq Scan\b.*\bshipments\b/u;
afterEach(cleanup);

test("operator search reveals collapsed matches and recovers from an empty result", async () => {
  const user = userEvent.setup();
  render(<ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />);
  await user.click(screen.getByRole("tab", { name: "Operators" }));
  await user.click(
    screen.getByRole("button", { name: "Collapse Hash Join branch" })
  );
  const search = screen.getByRole("searchbox", {
    name: "Search plan operators",
  });
  await user.click(search);
  await user.paste("SHIPMENTS");
  await user.click(
    within(screen.getByRole("list", { name: "Matching operators" })).getByRole(
      "button",
      { name: SHIPMENTS_NODE_NAME }
    )
  );
  expect(
    within(
      screen.getByRole("complementary", { name: "Plan node details" })
    ).getByRole("heading", { name: "Seq Scan" })
  ).not.toBeNull();
  expect(
    screen.getByRole("button", { name: "Collapse Hash Join branch" })
  ).not.toBeNull();
  await user.clear(search);
  await user.paste("missing_operator");
  expect(screen.getByRole("status").textContent).toBe("No matching operators.");
  await user.clear(search);
  expect(screen.queryByRole("list", { name: "Matching operators" })).toBeNull();
  expect(
    screen.getByRole("button", { name: SHIPMENTS_NODE_NAME })
  ).not.toBeNull();
});

test("a new plan resets selection, metric availability and JSON fallback", async () => {
  const user = userEvent.setup();
  const view = render(
    <ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />
  );
  await user.click(screen.getByRole("button", { name: SHIPMENTS_NODE_NAME }));
  const rawPlan = JSON.stringify([
    { Plan: { "Node Type": "Result", "Plan Rows": 0, "Total Cost": 0 } },
  ]);
  view.rerender(<ExplainPlanView analyze={false} rawPlan={rawPlan} />);
  await user.click(screen.getByRole("tab", { name: "Timing" }));
  expect(
    screen.getByText(
      "No self timings reported. Use Explain analyze to measure operator work."
    )
  ).not.toBeNull();
  expect(screen.queryByRole("list", { name: "Operator work" })).toBeNull();
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
