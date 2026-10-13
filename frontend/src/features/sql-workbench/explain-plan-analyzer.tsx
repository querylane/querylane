import { Activity, Database, Info, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/querylane-ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/querylane-ui/popover";
import {
  type ExplainPlan,
  estimateMismatch,
  nodeTitle,
  type PlanNode,
  summarizeExplainPlan,
} from "@/features/sql-workbench/explain-plan-model";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";

const PERCENT = 100;

function measuredTime(ms: number | undefined) {
  return ms === undefined ? "Not measured" : formatPlanMs(ms);
}

function PlanMetrics({
  plan,
  nodeCount,
}: {
  plan: ExplainPlan;
  nodeCount: number;
}) {
  const metrics = [
    { label: "Execution", value: measuredTime(plan.executionTimeMs) },
    { label: "Planning", value: measuredTime(plan.planningTimeMs) },
    {
      label:
        plan.root.actualRows === undefined
          ? "Estimated output rows"
          : "Output rows / loop",
      value: plan.root.actualRows ?? plan.root.planRows,
    },
    { label: "Nodes", value: nodeCount },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 border-border border-b p-4 lg:grid-cols-4">
      {metrics.map(({ label, value }) => (
        <div className="rounded-lg border bg-card px-3 py-2.5" key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="mt-1 font-medium font-mono text-lg tabular-nums">
            {typeof value === "number"
              ? formatCount(value)
              : (value ?? "Not reported")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function WorkBar({ node, maxMs }: { node: PlanNode; maxMs: number }) {
  if (node.exclusiveMs === undefined) {
    return <span className="text-muted-foreground text-xs">Not measured</span>;
  }
  const width =
    maxMs > 0 ? Math.min(PERCENT, (node.exclusiveMs / maxMs) * PERCENT) : 0;
  return (
    <div
      aria-label={`${nodeTitle(node)}: ${formatPlanMs(node.exclusiveMs)} estimated self time across all loops`}
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="img"
    >
      <div
        className="h-full w-(--work-width) rounded-full bg-chart-1"
        style={{ "--work-width": `${width}%` }}
      />
    </div>
  );
}

function PlanMetricNotes() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label="About plan metrics"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent align="start" presentation="compact">
        <PopoverTitle>Plan metrics</PopoverTitle>
        <ul className="space-y-2 text-muted-foreground text-xs">
          <li>
            Self time ≈ total time × loops − child work, clamped at zero.
            Parallel work and subplans are approximate.
          </li>
          <li>Lines connect parents and children, not execution order.</li>
          <li>Rows and total time are per loop. Costs are not milliseconds.</li>
          <li>
            Root buffers include children. Reads may come from the operating
            system cache.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface NodeSelection {
  onSelect: (id: string) => void;
  selectedId: string;
}

function GraphNode({
  node,
  slowestId,
  maxMs,
  onSelect,
  selectedId,
}: NodeSelection & {
  node: PlanNode;
  slowestId: string | undefined;
  maxMs: number;
}) {
  const title = nodeTitle(node);
  const mismatch = estimateMismatch(node);
  return (
    <li className="min-w-64">
      <article
        className={cn(
          "rounded-lg border bg-card p-3 shadow-sm",
          node.id === selectedId && "border-primary ring-2 ring-primary/15"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            aria-label={`Inspect ${title}`}
            aria-pressed={node.id === selectedId}
            className="h-auto min-w-0 max-w-full justify-start"
            onClick={() => onSelect(node.id)}
            presentation="sql-plan-node"
            type="button"
            variant="ghost"
          >
            <Search aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="break-words text-left">{title}</span>
          </Button>
          {node.id === slowestId ? (
            <span className="rounded bg-chart-4/15 px-2 py-0.5 font-medium text-foreground text-xs">
              Most self time
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-muted-foreground text-xs">
          <span>
            Rows{" "}
            {node.actualRows === undefined ? "—" : formatCount(node.actualRows)}{" "}
            / est.{" "}
            {node.planRows === undefined ? "—" : formatCount(node.planRows)}
          </span>
          <span>
            Loops{" "}
            {node.actualLoops === undefined
              ? "—"
              : formatCount(node.actualLoops)}
          </span>
          <span>Self {measuredTime(node.exclusiveMs)}</span>
        </div>
        {mismatch ? (
          <p className="mt-2 flex items-center gap-1 text-foreground text-xs">
            <TriangleAlert aria-hidden="true" className="size-3" />
            {mismatch}
          </p>
        ) : null}
        <div className="mt-3">
          <WorkBar maxMs={maxMs} node={node} />
        </div>
      </article>
      {node.children.length > 0 ? (
        <ul className="mt-3 space-y-3 border-border border-l-2 pl-4 sm:ml-4 sm:pl-5">
          {node.children.map((child) => (
            <GraphNode
              key={child.id}
              maxMs={maxMs}
              node={child}
              onSelect={onSelect}
              selectedId={selectedId}
              slowestId={slowestId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function PlanTiming({
  nodes,
  maxMs,
  onSelect,
  selectedId,
}: NodeSelection & { nodes: PlanNode[]; maxMs: number }) {
  const measured = nodes.some((node) => node.exclusiveMs !== undefined);
  if (!measured) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
        Run Explain analyze for timings.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {nodes.map((node) => (
          <li className="rounded-lg border bg-card p-3" key={node.id}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Button
                aria-label={`Inspect ${nodeTitle(node)}`}
                aria-pressed={node.id === selectedId}
                className="h-auto max-w-full justify-start"
                onClick={() => onSelect(node.id)}
                presentation="sql-plan-node"
                type="button"
                variant="ghost"
              >
                <span className="break-words text-left">{nodeTitle(node)}</span>
              </Button>
              <span className="font-mono text-sm tabular-nums">
                {measuredTime(node.exclusiveMs)}
              </span>
            </div>
            <WorkBar maxMs={maxMs} node={node} />
            <p className="mt-2 font-mono text-muted-foreground text-xs">
              Total / loop {measuredTime(node.actualTotalMs)} · loops{" "}
              {node.actualLoops === undefined
                ? "—"
                : formatCount(node.actualLoops)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BufferInsights({
  buffers,
}: {
  buffers: { hits: number; reads: number } | undefined;
}) {
  const accesses = buffers ? buffers.hits + buffers.reads : 0;
  return (
    <div className="space-y-1">
      <h4 className="flex items-center gap-1 font-medium text-xs">
        <Database aria-hidden="true" className="size-3" />
        Shared buffers
      </h4>
      {buffers ? (
        <>
          <p className="font-mono text-xs">
            {formatCount(buffers.hits)} hits · {formatCount(buffers.reads)}{" "}
            reads
          </p>
          <p className="text-muted-foreground text-xs">
            {accesses > 0
              ? `${Math.round((buffers.hits / accesses) * PERCENT)}% hits`
              : "No accesses"}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">Not reported</p>
      )}
    </div>
  );
}

function SlowestInsight({
  node,
  onSelect,
}: {
  node: PlanNode;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <h4 className="font-medium text-xs">Most self time</h4>
      <Button
        className="h-auto max-w-full justify-start"
        onClick={() => onSelect(node.id)}
        presentation="sql-plan-insight"
        type="button"
        variant="link"
      >
        <span className="break-words text-left">{nodeTitle(node)}</span>
      </Button>
      <p className="text-muted-foreground text-xs">
        {measuredTime(node.exclusiveMs)}
      </p>
    </div>
  );
}

function PlanInsights({
  plan,
  onSelect,
}: {
  plan: ExplainPlan;
  onSelect: (id: string) => void;
}) {
  const summary = summarizeExplainPlan(plan);
  const tempWrittenBlocks = summary.tempWrittenBlocks ?? 0;
  return (
    <section aria-label="Plan insights" className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-sm">
        <Activity aria-hidden="true" className="size-4" />
        Insights
      </h3>
      {summary.slowestNode ? (
        <SlowestInsight node={summary.slowestNode} onSelect={onSelect} />
      ) : (
        <p className="text-muted-foreground text-xs">
          {plan.root.actualTotalMs === undefined
            ? "Timings not measured"
            : "No measured self time"}
        </p>
      )}
      <div className="space-y-1">
        <h4 className="font-medium text-xs">Row estimates</h4>
        {summary.estimateMismatches.length > 0 ? (
          <ul className="space-y-2">
            {summary.estimateMismatches.map(({ node, label }) => (
              <li key={node.id}>
                <Button
                  className="h-auto max-w-full justify-start"
                  onClick={() => onSelect(node.id)}
                  presentation="sql-plan-insight"
                  type="button"
                  variant="link"
                >
                  <span className="break-words text-left">
                    {nodeTitle(node)}
                  </span>
                </Button>
                <p className="text-foreground text-xs">{label}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            {plan.root.actualRows === undefined
              ? "Not measured"
              : "No ≥10× mismatches"}
          </p>
        )}
      </div>
      <BufferInsights buffers={summary.sharedBuffers} />
      {tempWrittenBlocks > 0 ? (
        <div className="space-y-1">
          <h4 className="font-medium text-xs">Temporary writes</h4>
          <p className="text-muted-foreground text-xs">
            {formatCount(tempWrittenBlocks)} blocks
          </p>
        </div>
      ) : null}
      {summary.hasParallelWork ? (
        <p className="rounded-md border p-2 text-muted-foreground text-xs">
          Parallel timing is approximate.
        </p>
      ) : null}
    </section>
  );
}

function NodeInspector({ node }: { node: PlanNode }) {
  const metrics = [
    { label: "Rows / loop", value: node.actualRows },
    { label: "Estimated rows / loop", value: node.planRows },
    { label: "Loops", value: node.actualLoops },
    {
      label: "Total time / loop",
      value: measuredTime(node.actualTotalMs),
    },
    {
      label: "Self time (all loops)",
      value: measuredTime(node.exclusiveMs),
    },
    { label: "Planner cost (not ms)", value: node.totalCost },
  ];
  return (
    <section
      aria-label="Selected node"
      className="space-y-3 border-border border-t pt-4"
    >
      <h3 className="font-semibold text-sm">Node</h3>
      <p className="break-words font-medium font-mono text-sm">
        {nodeTitle(node)}
      </p>
      {node.actualLoops === 0 ? (
        <p className="text-muted-foreground text-xs">Never executed</p>
      ) : null}
      <dl className="space-y-2 text-xs">
        {metrics.map(({ label, value }) => (
          <div className="flex flex-wrap justify-between gap-2" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono tabular-nums">
              {typeof value === "number"
                ? formatCount(value)
                : (value ?? "Not reported")}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-2 border-border border-t pt-3 text-xs">
        {node.details.map((detail) => (
          <div key={detail.label}>
            <dt className="text-muted-foreground">{detail.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words font-mono">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ExplainPlanAnalyzer({
  plan,
  mode,
  selectedId,
  onSelect,
}: NodeSelection & { plan: ExplainPlan; mode: "graph" | "timing" }) {
  const summary = summarizeExplainPlan(plan);
  const selected =
    summary.nodes.find((node) => node.id === selectedId) ?? plan.root;
  const maxMs = summary.slowestNode?.exclusiveMs ?? 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <PlanMetrics nodeCount={summary.nodes.length} plan={plan} />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3 bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>Estimated self time · all loops</span>
            {mode === "timing" ? <span>Not a timeline.</span> : null}
            <PlanMetricNotes />
          </div>
          {mode === "graph" ? (
            <section
              aria-label="Query plan graph"
              className="overflow-x-auto p-1"
            >
              <ul>
                <GraphNode
                  maxMs={maxMs}
                  node={plan.root}
                  onSelect={onSelect}
                  selectedId={selected.id}
                  slowestId={summary.slowestNode?.id}
                />
              </ul>
            </section>
          ) : (
            <PlanTiming
              maxMs={maxMs}
              nodes={summary.nodes}
              onSelect={onSelect}
              selectedId={selected.id}
            />
          )}
        </div>
        <aside className="min-w-0 space-y-4 border-border border-t bg-background p-4 lg:border-t-0 lg:border-l">
          <PlanInsights onSelect={onSelect} plan={plan} />
          <NodeInspector node={selected} />
        </aside>
      </div>
    </div>
  );
}

export { ExplainPlanAnalyzer };
