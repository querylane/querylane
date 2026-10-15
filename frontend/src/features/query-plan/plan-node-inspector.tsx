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

const PERCENT = 100;

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
  const predicates = node.details.filter((detail) =>
    [
      "Filter",
      "Index Cond",
      "Hash Cond",
      "Join Filter",
      "Sort Key",
      "Merge Cond",
      "Recheck Cond",
    ].includes(detail.label)
  );
  const otherDetails = node.details.filter(
    (detail) => !predicates.includes(detail)
  );
  const metrics = [
    { label: "Time × loops", value: node.inclusiveMs, format: formatPlanMs },
    { label: "Loops", value: node.actualLoops, format: formatCount },
    { label: "Estimated cost", value: node.totalCost, format: formatCount },
  ];
  return (
    <aside
      aria-label="Plan node details"
      className="@4xl:w-80 shrink-0 @4xl:overflow-auto border-t @4xl:border-t-0 @4xl:border-l bg-card"
    >
      <div className="border-b p-5">
        <p className="mb-2 flex items-center gap-2 text-muted-foreground text-xs">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-chart-4"
          />
          Selected operation
        </p>
        <h3 className="font-semibold text-xl tracking-tight">
          {node.nodeType}
        </h3>
        {node.relationName ? (
          <p className="mt-1 break-all font-mono text-sm">
            {node.relationName}
          </p>
        ) : null}
        {node.indexName ? (
          <p className="mt-1 break-all font-mono text-muted-foreground text-xs">
            {node.indexName}
          </p>
        ) : null}
        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="mb-1 text-muted-foreground text-xs">Self time ≈</p>
            <p className="font-mono text-2xl tabular-nums tracking-tight">
              {node.exclusiveMs === undefined
                ? "—"
                : formatPlanMs(node.exclusiveMs)}
            </p>
          </div>
          {node.actualLoops === 0 ? (
            <p className="text-muted-foreground text-xs">Not executed</p>
          ) : null}
        </div>
        {DESCRIPTIONS[node.nodeType] ? (
          <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
            {DESCRIPTIONS[node.nodeType]}
          </p>
        ) : null}
      </div>
      <RowComparison node={node} />
      {insights.length > 0 ? (
        <div className="space-y-3 border-b p-5">
          {insights.map((insight) => (
            <div className="border-chart-4 border-l-2 pl-3" key={insight.label}>
              <p className="font-medium text-xs">{insight.label}</p>
              <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                {insight.detail}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {predicates.length > 0 ? (
        <dl className="space-y-4 border-b p-5 text-xs">
          {predicates.map((detail) => (
            <div key={detail.label}>
              <dt className="mb-2 font-medium">{detail.label}</dt>
              <dd className="whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2.5 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="space-y-2.5 border-b p-5 text-xs">
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
        <p className="border-b px-5 py-3 text-muted-foreground text-xs">
          Parallel or async plan. Self time is unavailable; total time includes
          overlapping work.
        </p>
      ) : null}
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="font-medium text-xs">Reported properties</p>
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
      <dl className="space-y-3 p-5 text-xs">
        {otherDetails.map((detail) => (
          <div key={detail.label}>
            <dt className="mb-1 text-muted-foreground">{detail.label}</dt>
            <dd className="whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function RowComparison({ node }: { node: PlanNode }) {
  const rowMaximum = Math.max(node.actualRows ?? 0, node.planRows ?? 0);
  return (
    <>
      {" "}
      {node.actualRows !== undefined || node.planRows !== undefined ? (
        <div className="space-y-3 border-b p-5">
          <p className="font-medium text-xs">Rows per loop</p>
          {[
            { label: "Actual", value: node.actualRows, color: "bg-chart-2" },
            {
              label: "Estimated",
              value: node.planRows,
              color: "bg-muted-foreground/40",
            },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono tabular-nums">
                  {row.value === undefined ? "—" : formatCount(row.value)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`${row.color} h-full w-(--plan-share) rounded-full`}
                  style={{
                    "--plan-share": `${rowMaximum > 0 ? ((row.value ?? 0) / rowMaximum) * PERCENT : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export { PlanNodeInspector };
