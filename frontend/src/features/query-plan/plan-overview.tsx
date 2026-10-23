import { ChevronDown } from "lucide-react";
import { Button } from "@/components/querylane-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/querylane-ui/dropdown-menu";
import {
  type ExplainPlan,
  type PlanNode,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";

const PERCENT = 100;

function PlanOverview({
  plan,
  nodes,
  selectedId,
  onSelect,
}: {
  plan: ExplainPlan;
  nodes: PlanNode[];
  selectedId: string;
  onSelect: (node: PlanNode) => void;
}) {
  const ranked = nodes
    .filter((node) => (node.exclusiveMs ?? 0) > 0)
    .toSorted((a, b) => (b.exclusiveMs ?? 0) - (a.exclusiveMs ?? 0));
  const total = ranked.reduce((sum, node) => sum + (node.exclusiveMs ?? 0), 0);
  const [hotspot] = ranked;
  return (
    <div className="bg-card border-b px-4 py-3 @3xl:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <SummaryNumbers count={nodes.length} plan={plan} />
        {hotspot && total > 0 ? (
          <Button
            aria-label={`Inspect largest work: ${planNodeTitle(hotspot)}`}
            className="h-auto max-w-full justify-start"
            onClick={() => {
              onSelect(hotspot);
            }}
            presentation="sql-plan-node"
            type="button"
            variant="ghost"
          >
            <span className="min-w-0 text-left">
              <span className="text-muted-foreground block text-xs">
                Largest available self work ≈
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs">
                <span className="truncate">
                  {hotspot.relationName ?? hotspot.nodeType}
                </span>
                <span className="text-warning-700 dark:text-warning-400 font-mono tabular-nums">
                  {Math.round(((hotspot.exclusiveMs ?? 0) / total) * PERCENT)}%
                </span>
                <span aria-hidden="true">↗</span>
              </span>
            </span>
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            {plan.root.parallel === true
              ? "Parallel work · self time unavailable"
              : "No self-work profile"}
          </p>
        )}
      </div>
      {total > 0 ? (
        <fieldset
          aria-label="Approximate self work distribution"
          className="mt-3"
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Inspect self work distribution"
                  presentation="plan-work"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <span
                aria-hidden="true"
                className="flex h-2.5 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-sm"
              >
                {ranked.map((node) => (
                  <span
                    className={cn(
                      "h-full w-(--plan-share) shrink",
                      node.id === hotspot?.id ? "bg-chart-4" : "bg-chart-2/55",
                      node.id === selectedId &&
                        "ring-foreground ring-1 ring-inset"
                    )}
                    key={node.id}
                    style={{
                      "--plan-share": `${((node.exclusiveMs ?? 0) / total) * PERCENT}%`,
                    }}
                  />
                ))}
              </span>
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              aria-label="Self work operations"
              render={(menuProps) => (
                <section aria-label="Self work selection">
                  <div {...menuProps} />
                </section>
              )}
            >
              <DropdownMenuRadioGroup
                onValueChange={(value: unknown) => {
                  const node = ranked.find(
                    (candidate) => candidate.id === value
                  );
                  if (node) {
                    onSelect(node);
                  }
                }}
                value={selectedId}
              >
                {ranked.map((node) => (
                  <DropdownMenuRadioItem
                    aria-label={`Inspect work for ${planNodeTitle(node)}: ${formatPlanMs(node.exclusiveMs ?? 0)}`}
                    closeOnClick={true}
                    key={node.id}
                    value={node.id}
                  >
                    {planNodeTitle(node)}
                    <span className="text-muted-foreground ml-auto pl-4 font-mono text-xs">
                      {formatPlanMs(node.exclusiveMs ?? 0)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </fieldset>
      ) : null}
    </div>
  );
}

function SummaryNumbers({ plan, count }: { plan: ExplainPlan; count: number }) {
  const rows = plan.root.actualRows ?? plan.root.planRows;
  const cost =
    plan.root.totalCost === undefined ? "—" : formatCount(plan.root.totalCost);
  return (
    <div className="flex items-center gap-6">
      <div>
        <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
          {plan.executionTimeMs === undefined
            ? "Estimated cost"
            : "Execution time"}
        </p>
        <p className="text-2xl font-medium tracking-tight tabular-nums">
          {plan.executionTimeMs === undefined
            ? cost
            : formatPlanMs(plan.executionTimeMs)}
        </p>
      </div>
      <div className="border-l pl-6 text-xs">
        <p className="font-medium tabular-nums">
          {rows === undefined ? "—" : formatCount(rows)}{" "}
          <span className="text-muted-foreground font-normal">
            rows {plan.root.actualRows === undefined ? "estimated" : "returned"}
          </span>
        </p>
        <p className="text-muted-foreground mt-2">
          {count} operations
          {plan.planningTimeMs === undefined
            ? ""
            : ` · ${formatPlanMs(plan.planningTimeMs)} planning`}
        </p>
      </div>
    </div>
  );
}

export { PlanOverview };
