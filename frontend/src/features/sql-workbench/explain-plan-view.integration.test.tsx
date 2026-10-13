import { afterEach, expect, test } from "@rstest/core";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseExplainPlan } from "@/features/sql-workbench/explain-plan-model";
import { ExplainPlanView } from "@/features/sql-workbench/explain-plan-view";

const MORE_ROWS = /more than estimated/;
const TIMING_CAVEAT = /Not a timeline/;
const PARALLEL_CAVEAT = /Parallel work and subplans are approximate/;
const INDEX_WORK = /Index Scan.*10 ms/;
const INDEX_DETAILS = /Show details for Index Scan/;
const INDEX_CONDITION = /"Index Cond"/;
const TIMING_PROMPT = /Run Explain analyze for timings/;
const PARSE_ERROR = /could not be parsed/;

const rawPlan = JSON.stringify([
  {
    "Execution Time": 15,
    Plan: {
      "Node Type": "Nested Loop",
      "Actual Loops": 1,
      "Actual Total Time": 12,
      "Plan Rows": 5,
      "Actual Rows": 5,
      Plans: [
        {
          "Node Type": "Index Scan",
          "Relation Name": "orders",
          "Index Name": "orders_pkey",
          "Actual Loops": 20,
          "Actual Total Time": 0.5,
          "Actual Rows": 5,
          "Plan Rows": 5,
          "Index Cond": "(id = customers.id)",
        },
      ],
    },
  },
]);

afterEach(cleanup);

test("inspect a graph node, compare timing, and retain tree and JSON views", async () => {
  const user = userEvent.setup();
  render(
    <ExplainPlanView
      analyze={true}
      plan={parseExplainPlan(rawPlan) ?? undefined}
      rawPlan={rawPlan}
    />
  );
  expect(
    screen.getByRole("tab", { name: "Graph" }).getAttribute("aria-selected")
  ).toBe("true");
  await user.click(
    screen.getByRole("button", {
      name: "Inspect Index Scan on orders using orders_pkey",
    })
  );
  const inspector = screen.getByRole("region", { name: "Selected node" });
  expect(within(inspector).getByText("(id = customers.id)")).toBeDefined();
  expect(within(inspector).getByText("20")).toBeDefined();
  expect(screen.queryByText(MORE_ROWS)).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Plan metrics" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "About plan metrics" }));
  const notes = await screen.findByRole("dialog", { name: "Plan metrics" });
  expect(within(notes).getByText(PARALLEL_CAVEAT)).toBeDefined();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Plan metrics" })).toBeNull()
  );
  await user.click(screen.getByRole("tab", { name: "Timing" }));
  expect(screen.getByText(TIMING_CAVEAT)).toBeDefined();
  expect(screen.getByRole("img", { name: INDEX_WORK })).toBeDefined();
  await user.click(screen.getByRole("tab", { name: "Tree" }));
  await user.click(screen.getByRole("button", { name: INDEX_DETAILS }));
  expect(screen.getByText("(id = customers.id)")).toBeDefined();
  await user.click(screen.getByRole("tab", { name: "JSON" }));
  expect(screen.getByText(INDEX_CONDITION)).toBeDefined();
});

test("estimates and unparseable plans do not invent actual time", async () => {
  const user = userEvent.setup();
  const estimated =
    '[{"Plan":{"Node Type":"Result","Plan Rows":1,"Total Cost":0.01}}]';
  const { rerender } = render(
    <ExplainPlanView
      analyze={false}
      plan={parseExplainPlan(estimated) ?? undefined}
      rawPlan={estimated}
    />
  );
  await user.click(screen.getByRole("tab", { name: "Timing" }));
  expect(screen.getByText(TIMING_PROMPT)).toBeDefined();
  expect(screen.queryByRole("img")).toBeNull();
  rerender(
    <ExplainPlanView analyze={false} plan={undefined} rawPlan="invalid plan" />
  );
  expect(screen.getByText("invalid plan")).toBeDefined();
  expect(screen.getByText(PARSE_ERROR)).toBeDefined();
});

test("ranked work and findings reveal a collapsed operator without losing selection", async () => {
  const user = userEvent.setup();
  const raw = JSON.stringify([
    {
      Plan: {
        "Node Type": "Nested Loop",
        "Actual Loops": 1,
        "Actual Total Time": 50,
        Plans: [
          {
            "Node Type": "Seq Scan",
            "Relation Name": "events",
            "Actual Loops": 1,
            "Actual Total Time": 40,
            "Actual Rows": 20,
            "Plan Rows": 20,
            "Rows Removed by Filter": 1980,
          },
        ],
      },
    },
  ]);
  render(
    <ExplainPlanView
      analyze={true}
      plan={parseExplainPlan(raw) ?? undefined}
      rawPlan={raw}
    />
  );
  await user.click(
    screen.getByRole("button", { name: "Collapse Nested Loop" })
  );
  expect(
    screen.queryByRole("button", { name: "Inspect Seq Scan on events" })
  ).toBeNull();
  await user.click(
    within(screen.getByRole("region", { name: "Plan insights" })).getByRole(
      "button",
      { name: "99.0% filtered · Seq Scan on events" }
    )
  );
  const search = screen.getByRole("searchbox", { name: "Find an operator" });
  await user.type(search, "events");
  expect(
    screen.getByRole("button", { name: "Inspect Nested Loop" })
  ).toBeDefined();
  await user.clear(search);
  await user.type(search, "missing-table");
  expect(screen.getByText("No operators match.")).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  const node = screen.getByRole("button", {
    name: "Inspect Seq Scan on events",
  });
  expect(node.getAttribute("aria-pressed")).toBe("true");
  expect(
    within(screen.getByRole("region", { name: "Selected node" })).getByText(
      "1980"
    )
  ).toBeDefined();
  await user.click(screen.getByRole("tab", { name: "Timing" }));
  const timing = screen.getByRole("region", { name: "Ranked plan work" });
  const rows = within(timing).getAllByRole("button");
  expect(rows[0]?.getAttribute("aria-label")).toBe(
    "Inspect Seq Scan on events"
  );
  expect(rows[0]?.getAttribute("aria-pressed")).toBe("true");
});
