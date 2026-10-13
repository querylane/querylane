import { parseExplainPlan } from "@/features/sql-workbench/explain-plan-model";
import { ExplainPlanView } from "@/features/sql-workbench/explain-plan-view";

const SQL_PLAN_JSON = JSON.stringify([
  {
    "Planning Time": 0.65,
    "Execution Time": 42.8,
    Plan: {
      "Node Type": "Nested Loop",
      "Plan Rows": 24,
      "Actual Rows": 24,
      "Actual Loops": 1,
      "Actual Total Time": 40,
      "Total Cost": 112.4,
      "Shared Hit Blocks": 120,
      "Shared Read Blocks": 30,
      Plans: [
        {
          "Node Type": "Seq Scan",
          "Relation Name": "customers",
          "Plan Rows": 2,
          "Actual Rows": 24,
          "Actual Loops": 1,
          "Actual Total Time": 28,
          "Total Cost": 80,
          "Shared Hit Blocks": 24,
          "Shared Read Blocks": 30,
          Filter: "(region = 'west'::text)",
          "Rows Removed by Filter": 4976,
        },
        {
          "Node Type": "Index Scan",
          "Relation Name": "orders",
          "Index Name": "orders_customer_id_idx",
          "Plan Rows": 1,
          "Actual Rows": 1,
          "Actual Loops": 24,
          "Actual Total Time": 0.25,
          "Total Cost": 1.35,
          "Shared Hit Blocks": 96,
          "Shared Read Blocks": 0,
          "Index Cond": "(customer_id = customers.id)",
        },
      ],
    },
  },
]);
const ESTIMATED_PLAN_JSON =
  '[{"Plan":{"Node Type":"Result","Plan Rows":1,"Total Cost":0.01}}]';

function SqlPlanScenario({
  rawPlan,
  analyze,
}: {
  rawPlan: string;
  analyze: boolean;
}) {
  return (
    <div className="flex h-[740px] w-[1180px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border">
      <ExplainPlanView
        analyze={analyze}
        plan={parseExplainPlan(rawPlan) ?? undefined}
        rawPlan={rawPlan}
      />
    </div>
  );
}

function SqlPlanAnalyzerScenario() {
  return <SqlPlanScenario analyze={true} rawPlan={SQL_PLAN_JSON} />;
}

const DEEP_PLAN_LIMIT_COUNT = 16;

function SqlPlanDeepScenario() {
  let plan: Record<string, unknown> = {
    "Node Type": "Seq Scan",
    "Relation Name": "pg_class",
    "Plan Rows": 400,
    "Actual Rows": 10,
    "Actual Loops": 1,
    "Actual Total Time": 0.02,
  };
  for (let depth = 0; depth < DEEP_PLAN_LIMIT_COUNT; depth += 1) {
    plan = {
      "Node Type": "Limit",
      "Plan Rows": 10,
      "Actual Rows": 10,
      "Actual Loops": 1,
      "Actual Total Time": 0.02,
      Plans: [plan],
    };
  }
  return (
    <SqlPlanScenario
      analyze={true}
      rawPlan={JSON.stringify([{ Plan: plan }])}
    />
  );
}

function SqlPlanEstimatesScenario() {
  return <SqlPlanScenario analyze={false} rawPlan={ESTIMATED_PLAN_JSON} />;
}

function SqlPlanRawScenario() {
  return <SqlPlanScenario analyze={false} rawPlan="Unsupported plan output" />;
}

function SqlPlanSpillScenario() {
  return (
    <SqlPlanScenario
      analyze={true}
      rawPlan={JSON.stringify([
        {
          "Execution Time": 105,
          "Planning Time": 0.8,
          Plan: {
            "Node Type": "Gather",
            "Actual Total Time": 100,
            "Actual Loops": 1,
            "Actual Rows": 300,
            "Plan Rows": 300,
            "Workers Planned": 2,
            "Workers Launched": 2,
            "Shared Hit Blocks": 3000,
            "Shared Read Blocks": 120,
            "Temp Written Blocks": 640,
            Plans: [
              {
                "Node Type": "Sort",
                "Actual Total Time": 80,
                "Actual Loops": 3,
                "Actual Rows": 100,
                "Plan Rows": 100,
                "Sort Space Type": "Disk",
                "Sort Space Used": 2048,
                "Sort Method": "external merge",
                "Sort Key": ["events.created_at"],
                Plans: [
                  {
                    "Node Type": "Hash",
                    "Actual Total Time": 50,
                    "Actual Loops": 3,
                    "Hash Batches": 8,
                    "Peak Memory Usage": 512,
                    Plans: [
                      {
                        "Node Type": "Seq Scan",
                        "Relation Name": "events",
                        "Parallel Aware": true,
                        "Actual Total Time": 40,
                        "Actual Loops": 3,
                        "Actual Rows": 100,
                        "Plan Rows": 100,
                        "Rows Removed by Filter": 9900,
                        Filter: "(status = 'pending'::text)",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ])}
    />
  );
}

export {
  SqlPlanAnalyzerScenario,
  SqlPlanDeepScenario,
  SqlPlanEstimatesScenario,
  SqlPlanRawScenario,
  SqlPlanSpillScenario,
};
