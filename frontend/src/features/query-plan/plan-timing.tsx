import { Button } from "@/components/querylane-ui/button";
import {
  type PlanNode,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import { formatPlanMs } from "@/features/sql-workbench/sql-workbench-format";

const PERCENT = 100;

function PlanTiming({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: PlanNode[];
  selectedId: string;
  onSelect: (node: PlanNode) => void;
}) {
  if (!nodes.some((node) => node.exclusiveMs !== undefined)) {
    return (
      <p className="text-muted-foreground min-h-48 min-w-0 flex-1 p-4 text-xs">
        {nodes.some((node) => node.parallel === true)
          ? "Self time is unavailable for parallel or asynchronous work."
          : "No self timings reported. Use Explain analyze to measure operator work."}
      </p>
    );
  }
  const ranked = nodes.toSorted(
    (a, b) => (b.exclusiveMs ?? -1) - (a.exclusiveMs ?? -1)
  );
  const maximum = Math.max(0, ...nodes.map((node) => node.exclusiveMs ?? 0));
  return (
    <section
      aria-label="Plan timing"
      className="min-h-48 min-w-0 flex-1 overflow-auto p-4"
    >
      <p className="text-muted-foreground mb-4 text-xs">
        Approximate self work across loops, highest first. Not a timeline.
      </p>
      <ol aria-label="Operator work" className="space-y-3">
        {ranked.map((node) => (
          <li className="rounded-lg border p-3" key={node.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                aria-label={`Inspect ${planNodeTitle(node)}`}
                aria-pressed={selectedId === node.id}
                className="h-auto max-w-full"
                onClick={() => {
                  onSelect(node);
                }}
                presentation="sql-plan-node"
                type="button"
                variant="ghost"
              >
                <span className="truncate">{planNodeTitle(node)}</span>
              </Button>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {node.exclusiveMs === undefined
                  ? "Not measured"
                  : formatPlanMs(node.exclusiveMs)}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="bg-muted mt-2 h-2 overflow-hidden rounded-sm"
            >
              <div
                className="bg-chart-2/55 h-full w-(--plan-share) rounded-sm"
                style={{
                  "--plan-share": `${maximum > 0 ? ((node.exclusiveMs ?? 0) / maximum) * PERCENT : 0}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export { PlanTiming };
