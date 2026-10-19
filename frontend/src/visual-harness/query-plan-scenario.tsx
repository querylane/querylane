import { ExplainPlanView } from "@/features/query-plan/explain-plan-view";
import { EXPLAIN_ANALYZE_FIXTURE } from "@/test/fixtures/explain-plan-fixture";

// Interactive, read-only fixture. This entry is excluded from production builds.
function QueryPlanScenario() {
  return (
    <section
      aria-label="Query plan demo"
      className="flex h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border bg-background"
    >
      <ExplainPlanView analyze={true} rawPlan={EXPLAIN_ANALYZE_FIXTURE} />
    </section>
  );
}

export { QueryPlanScenario };
