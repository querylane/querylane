import { describe, expect, it } from "@rstest/core";
import {
  flattenPlan,
  parseExplainPlan,
} from "@/features/sql-workbench/explain-plan-model";

const ANALYZE_PLAN = JSON.stringify([
  {
    "Execution Time": 12.5,
    Plan: {
      "Actual Loops": 1,
      "Actual Rows": 10,
      "Actual Total Time": 10,
      "Node Type": "Hash Join",
      "Plan Rows": 12,
      Plans: [
        {
          "Actual Loops": 1,
          "Actual Rows": 1000,
          "Actual Total Time": 6,
          Filter: "(active = true)",
          "Node Type": "Seq Scan",
          "Plan Rows": 900,
          "Relation Name": "users",
          "Total Cost": 20.5,
        },
        {
          "Actual Loops": 2,
          "Actual Rows": 5,
          "Actual Total Time": 1,
          "Index Name": "orders_pkey",
          "Node Type": "Index Scan",
          "Plan Rows": 5,
          "Relation Name": "orders",
          "Total Cost": 8.25,
        },
      ],
      "Total Cost": 40,
    },
    "Planning Time": 0.4,
  },
]);

describe("parseExplainPlan", () => {
  it("builds a tree with exclusive times and shares", () => {
    const plan = parseExplainPlan(ANALYZE_PLAN);
    expect(plan).not.toBeNull();
    expect(plan?.executionTimeMs).toBe(12.5);
    expect(plan?.planningTimeMs).toBe(0.4);

    const root = plan?.root;
    expect(root?.nodeType).toBe("Hash Join");
    expect(root?.children.map((child) => child.nodeType)).toEqual([
      "Seq Scan",
      "Index Scan",
    ]);
    // 10ms inclusive minus 6ms (seq scan) minus 2ms (index scan × 2 loops).
    expect(root?.exclusiveMs).toBeCloseTo(2);
    expect(root?.share).toBeCloseTo(0.2);
    expect(root?.children[0]?.share).toBeCloseTo(0.6);
    expect(root?.children[1]?.exclusiveMs).toBeCloseTo(2);
    expect(root?.children[1]?.indexName).toBe("orders_pkey");
  });

  it("keeps extra fields as details and omits the ones shown inline", () => {
    const plan = parseExplainPlan(ANALYZE_PLAN);
    const seqScan = plan?.root.children[0];
    expect(seqScan?.details).toEqual([
      { label: "Filter", value: "(active = true)" },
    ]);
  });

  it("handles a plain EXPLAIN without actual timings", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        { Plan: { "Node Type": "Result", "Plan Rows": 1, "Total Cost": 0.01 } },
      ])
    );
    expect(plan?.root).toMatchObject({
      exclusiveMs: undefined,
      nodeType: "Result",
      share: undefined,
      totalCost: 0.01,
    });
    expect(plan?.executionTimeMs).toBeUndefined();
  });

  it("returns null for text plans or malformed JSON", () => {
    expect(parseExplainPlan("Seq Scan on users")).toBeNull();
    expect(parseExplainPlan("[]")).toBeNull();
    expect(parseExplainPlan('{"nope":1}')).toBeNull();
  });
});

describe("flattenPlan", () => {
  it("lists nodes depth-first", () => {
    const plan = parseExplainPlan(ANALYZE_PLAN);
    if (!plan) {
      throw new Error("expected a plan");
    }
    expect(flattenPlan(plan.root).map((node) => node.id)).toEqual([
      "0",
      "0.0",
      "0.1",
    ]);
  });
});
