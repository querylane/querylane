import { describe, expect, test } from "@rstest/core";
import {
  flattenPlan,
  parseExplainPlan,
  summarizeExplainPlan,
} from "@/features/query-plan/explain-plan-model";

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
  test("builds a tree with exclusive times across repeated loops", () => {
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
    expect(root?.children[1]?.exclusiveMs).toBeCloseTo(2);
    expect(root?.children[1]?.indexName).toBe("orders_pkey");
  });

  test("keeps extra fields as details and omits the ones shown inline", () => {
    const plan = parseExplainPlan(ANALYZE_PLAN);
    const seqScan = plan?.root.children[0];
    expect(seqScan?.details).toEqual([
      { label: "Filter", value: "(active = true)" },
    ]);
  });

  test("handles a plain EXPLAIN without actual timings", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        { Plan: { "Node Type": "Result", "Plan Rows": 1, "Total Cost": 0.01 } },
      ])
    );
    expect(plan?.root).toMatchObject({
      exclusiveMs: undefined,
      nodeType: "Result",
      totalCost: 0.01,
    });
    expect(plan?.executionTimeMs).toBeUndefined();
  });

  test("does not invent self time when worker times overlap", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Gather",
            "Actual Total Time": 10,
            "Actual Loops": 1,
            "Workers Planned": 2,
            "Workers Launched": 2,
            Plans: [
              {
                "Node Type": "Seq Scan",
                "Parallel Aware": true,
                "Actual Total Time": 6,
                "Actual Loops": 3,
              },
            ],
          },
        },
      ])
    );
    expect(plan?.root.exclusiveMs).toBeUndefined();
    expect(plan?.root.children[0]?.exclusiveMs).toBeUndefined();
    // Cumulative work may exceed the query's elapsed time. It is not a timeline.
    expect(plan?.root.children[0]?.inclusiveMs).toBe(18);
  });

  test("does not attribute a child's missing timing to the parent", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Sort",
            "Actual Total Time": 10,
            "Actual Loops": 1,
            Plans: [
              { "Node Type": "Seq Scan", "Actual Rows": 10, "Actual Loops": 1 },
            ],
          },
        },
      ])
    );
    expect(plan?.root.exclusiveMs).toBeUndefined();
    expect(plan?.root.actualTotalMs).toBe(10);
  });

  test("returns null for text plans or malformed JSON", () => {
    expect(parseExplainPlan("Seq Scan on users")).toBeNull();
    expect(parseExplainPlan("[]")).toBeNull();
    expect(parseExplainPlan('{"nope":1}')).toBeNull();
  });
});

describe("flattenPlan", () => {
  test("lists nodes depth-first", () => {
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

describe("plan diagnostics", () => {
  it("compares row estimates per loop and uses inclusive root buffer counters", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Nested Loop",
            "Actual Total Time": 20,
            "Actual Loops": 1,
            "Shared Hit Blocks": 100,
            "Shared Read Blocks": 25,
            Plans: [
              {
                "Node Type": "Index Scan",
                "Actual Rows": 5,
                "Plan Rows": 5,
                "Actual Loops": 100,
                "Actual Total Time": 0.1,
                "Shared Hit Blocks": 100,
              },
              {
                "Node Type": "Seq Scan",
                "Actual Rows": 200,
                "Plan Rows": 10,
                "Actual Loops": 1,
                "Actual Total Time": 8,
                "Shared Read Blocks": 25,
              },
            ],
          },
        },
      ])
    );
    if (!plan) {
      throw new Error("expected a plan");
    }
    const summary = summarizeExplainPlan(plan);
    expect(summary.slowestNode?.id).toBe("0.0");
    expect(
      summary.estimateMismatches.map(({ node, label }) => [node.id, label])
    ).toEqual([["0.1", "20× more than estimated"]]);
    expect(summary.sharedBuffers).toEqual({ hits: 100, reads: 25 });
  });

  it("does not invent measurements or diagnose nodes that never ran", () => {
    const plan = parseExplainPlan(
      JSON.stringify([
        {
          Plan: {
            "Node Type": "Result",
            "Plan Rows": 1,
            Plans: [
              {
                "Node Type": "Seq Scan",
                "Plan Rows": 100,
                "Actual Rows": 0,
                "Actual Loops": 0,
                "Actual Total Time": 0,
              },
            ],
          },
        },
      ])
    );
    if (!plan) {
      throw new Error("expected a plan");
    }
    const summary = summarizeExplainPlan(plan);
    expect(summary.slowestNode).toBeUndefined();
    expect(summary.sharedBuffers).toBeUndefined();
    expect(summary.estimateMismatches).toEqual([]);
  });
});
