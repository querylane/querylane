import { Button } from "@/components/querylane-ui/button";
import {
  type PlanNode,
  planNodeInsights,
} from "@/features/query-plan/explain-plan-model";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";

const DESCRIPTIONS: Record<string, string> = {
  Aggregate: "Combines input rows into aggregate results.",
  Sort: "Orders input rows by the sort keys.",
  "Incremental Sort": "Sorts groups that already share an ordered prefix.",
  "Seq Scan": "Reads the table and applies its filter, if present.",
  "Index Scan":
    "Finds matching rows through an index, then fetches table rows.",
  "Index Only Scan":
    "Reads indexed values; visibility checks may still fetch table pages.",
  "Bitmap Heap Scan":
    "Fetches table pages identified by a bitmap of matching rows.",
  "Bitmap Index Scan":
    "Builds a bitmap of matching row locations from an index.",
  "Hash Join":
    "Builds a hash table from one input and probes it with the other.",
  "Merge Join": "Joins two inputs ordered by the join keys.",
  "Nested Loop": "Runs the inner input for each row from the outer input.",
  Hash: "Builds a hash table for its parent operation.",
  Gather: "Combines rows from parallel participants.",
  "Gather Merge": "Merges sorted rows from parallel participants.",
  Limit: "Stops requesting rows once the limit is satisfied.",
  Materialize: "Stores input rows for reuse by the parent operation.",
};

function PlanNodeInspector({
  node,
  parallel,
  onViewJson,
}: {
  node: PlanNode;
  parallel: boolean;
  onViewJson: () => void;
}) {
  const insights = planNodeInsights(node);
  const metrics = [
    {
      label: "Actual rows / loop",
      value: node.actualRows,
      format: formatCount,
    },
    {
      label: "Estimated rows / loop",
      value: node.planRows,
      format: formatCount,
    },
    { label: "Loops", value: node.actualLoops, format: formatCount },
    { label: "Time × loops", value: node.inclusiveMs, format: formatPlanMs },
    { label: "Self time ≈", value: node.exclusiveMs, format: formatPlanMs },
    { label: "Estimated cost", value: node.totalCost, format: formatCount },
  ];
  return (
    <aside
      aria-label="Plan node details"
      className="@4xl:w-72 shrink-0 @4xl:overflow-auto border-t @4xl:border-t-0 @4xl:border-l bg-muted/10"
    >
      <div className="space-y-3 border-b p-4">
        <div>
          <p className="mb-1 text-muted-foreground text-xs">
            Selected operation
          </p>
          <h3 className="font-semibold text-sm">{node.nodeType}</h3>
          {node.relationName ? (
            <p className="mt-1 break-all font-mono text-xs">
              {node.relationName}
            </p>
          ) : null}
          {node.indexName ? (
            <p className="mt-1 break-all font-mono text-muted-foreground text-xs">
              {node.indexName}
            </p>
          ) : null}
        </div>
        {DESCRIPTIONS[node.nodeType] ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {DESCRIPTIONS[node.nodeType]}
          </p>
        ) : null}
        {node.actualLoops === 0 ? (
          <p className="text-muted-foreground text-xs">Not executed</p>
        ) : null}
        {insights.map((insight) => (
          <div
            className="rounded-md border border-chart-4/30 bg-chart-4/5 p-2.5"
            key={insight.label}
          >
            <p className="font-medium text-xs">{insight.label}</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              {insight.detail}
            </p>
          </div>
        ))}
      </div>
      <dl className="space-y-2 border-b p-4 text-xs">
        {metrics.map((metric) => (
          <div className="flex justify-between gap-3" key={metric.label}>
            <dt className="text-muted-foreground">{metric.label}</dt>
            <dd className="font-mono tabular-nums">
              {metric.value === undefined ? "—" : metric.format(metric.value)}
            </dd>
          </div>
        ))}
      </dl>
      {parallel ? (
        <p className="border-b px-4 py-2 text-muted-foreground text-xs">
          Parallel or async plan. Self time is unavailable; total time includes
          overlapping work.
        </p>
      ) : null}
      <div className="px-4 pt-3">
        <Button
          onClick={onViewJson}
          presentation="compact"
          size="xs"
          type="button"
          variant="outline"
        >
          View JSON
        </Button>
      </div>
      <dl className="space-y-3 p-4 text-xs">
        {node.details.map((detail) => (
          <div key={detail.label}>
            <dt className="mb-1 text-muted-foreground">{detail.label}</dt>
            <dd className="whitespace-pre-wrap break-words font-mono [overflow-wrap:anywhere]">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export { PlanNodeInspector };
