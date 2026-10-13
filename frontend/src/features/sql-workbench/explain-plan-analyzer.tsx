import { ChevronDown, ChevronRight, Info, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import { Input } from "@/components/querylane-ui/input";
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
const MAX_GRAPH_INDENT = 2;
const WORK_LEGEND_LIMIT = 5;
const WORK_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

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
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-border border-b px-4 py-3 lg:grid-cols-4">
      {metrics.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="font-medium font-mono text-lg tabular-nums">
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
      className="h-1.5 overflow-hidden rounded-full bg-muted"
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
          <li>
            Lines show plan structure, not execution order. Shares compare
            derived work, not wall time.
          </li>
          <li>
            Row differences can reflect partial execution under a Limit or join,
            not bad statistics.
          </li>
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

function WorkDistribution({
  nodes,
  onSelect,
  selectedId,
}: NodeSelection & { nodes: PlanNode[] }) {
  const measured = nodes.filter((node) => (node.exclusiveMs ?? 0) > 0);
  const [slowest] = measured;
  return (
    <section
      aria-label="Work distribution"
      className="space-y-2 border-border border-b px-4 py-3"
    >
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>Estimated self time · all loops</span>
        <PlanMetricNotes />
      </div>
      {slowest ? (
        <>
          <div className="flex h-5 overflow-hidden rounded-md">
            {measured.map((node, index) => (
              <div
                className={cn(
                  "w-(--work-width) min-w-px",
                  WORK_COLORS[index % WORK_COLORS.length]
                )}
                key={node.id}
                style={{ "--work-width": `${(node.share ?? 0) * PERCENT}%` }}
              >
                <Button
                  aria-label={`Select ${nodeTitle(node)} · ${Math.round((node.share ?? 0) * PERCENT)}% of derived work`}
                  aria-pressed={node.id === selectedId}
                  className="h-full w-full"
                  onClick={() => onSelect(node.id)}
                  presentation="unpadded"
                  title={`${nodeTitle(node)} · ${measuredTime(node.exclusiveMs)}`}
                  type="button"
                  variant="ghost"
                />{" "}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {measured.slice(0, WORK_LEGEND_LIMIT).map((node, index) => (
              <Button
                aria-label={`Inspect work for ${nodeTitle(node)}`}
                className="h-auto max-w-full justify-start"
                key={node.id}
                onClick={() => onSelect(node.id)}
                presentation="sql-plan-insight"
                type="button"
                variant="ghost"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-sm",
                    WORK_COLORS[index % WORK_COLORS.length]
                  )}
                />
                <span className="truncate">
                  {node.nodeType}
                  {node.relationName ? ` · ${node.relationName}` : ""} ·{" "}
                  {Math.round((node.share ?? 0) * PERCENT)}%
                </span>
              </Button>
            ))}
            {measured.length > WORK_LEGEND_LIMIT ? (
              <span className="text-muted-foreground text-xs">
                +{measured.length - WORK_LEGEND_LIMIT} nodes
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function GraphNodeMetrics({
  node,
  maxMs,
  depth,
  expanded,
}: {
  node: PlanNode;
  maxMs: number;
  depth: number;
  expanded: boolean;
}) {
  const mismatch = estimateMismatch(node);
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-muted-foreground text-xs">
        <span>
          Rows{" "}
          {node.actualRows === undefined ? "—" : formatCount(node.actualRows)} /
          est. {node.planRows === undefined ? "—" : formatCount(node.planRows)}
        </span>
        <span>
          Loops{" "}
          {node.actualLoops === undefined ? "—" : formatCount(node.actualLoops)}
        </span>
        {depth > MAX_GRAPH_INDENT ? <span>Depth {depth}</span> : null}
        {expanded ? null : <span>{node.children.length} branches hidden</span>}
      </div>
      {mismatch ? (
        <p className="mt-1 text-muted-foreground text-xs">{mismatch}</p>
      ) : null}
      <div className="mt-2">
        <WorkBar maxMs={maxMs} node={node} />
      </div>
    </>
  );
}
function BranchToggle({
  node,
  expanded,
  disabled,
  onToggle,
}: {
  node: PlanNode;
  expanded: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  if (node.children.length === 0) {
    return null;
  }
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <Button
      aria-controls={`plan-children-${node.id}`}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${nodeTitle(node)}`}
      disabled={disabled}
      onClick={() => onToggle(node.id)}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
function GraphNode({
  node,
  maxMs,
  onSelect,
  selectedId,
  collapsed,
  onToggle,
  depth = 0,
  visibleIds,
}: NodeSelection & {
  node: PlanNode;
  maxMs: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
  visibleIds?: Set<string> | undefined;
}) {
  const title = nodeTitle(node);
  const expanded = visibleIds !== undefined || !collapsed.has(node.id);
  const selected = node.id === selectedId;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(
    function revealSelectedNode() {
      if (selected) {
        ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    },
    [selected]
  );
  if (visibleIds && !visibleIds.has(node.id)) {
    return null;
  }
  return (
    <li>
      <article
        className={cn(
          "rounded-lg border bg-card p-3",
          selected && "border-primary ring-2 ring-primary/15"
        )}
      >
        <div className="flex items-start gap-2">
          <BranchToggle
            disabled={visibleIds !== undefined}
            expanded={expanded}
            node={node}
            onToggle={onToggle}
          />
          <Button
            aria-label={`Inspect ${title}`}
            aria-pressed={selected}
            className="h-auto min-w-0 flex-1 justify-start"
            onClick={() => onSelect(node.id)}
            presentation="sql-plan-node"
            ref={ref}
            type="button"
            variant="ghost"
          >
            <span className="break-words text-left">{title}</span>
          </Button>
          <span className="shrink-0 font-mono text-xs tabular-nums">
            {measuredTime(node.exclusiveMs)}
          </span>
        </div>
        <GraphNodeMetrics
          depth={depth}
          expanded={expanded}
          maxMs={maxMs}
          node={node}
        />
      </article>
      {node.children.length > 0 ? (
        <ul
          className={cn(
            "mt-2 space-y-2",
            depth < MAX_GRAPH_INDENT &&
              "ml-2 border-border border-l pl-2 lg:ml-3 lg:pl-3"
          )}
          hidden={!expanded}
          id={`plan-children-${node.id}`}
        >
          {expanded
            ? node.children.map((child) => (
                <GraphNode
                  collapsed={collapsed}
                  depth={depth + 1}
                  key={child.id}
                  maxMs={maxMs}
                  node={child}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  selectedId={selectedId}
                  visibleIds={visibleIds}
                />
              ))
            : null}
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
  if (!nodes.some((node) => node.exclusiveMs !== undefined)) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-muted-foreground text-sm">
        Run Explain analyze for timings.
      </p>
    );
  }
  return (
    <section aria-label="Ranked plan work" className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Slowest first · Not a timeline.
      </p>
      <ol className="space-y-2">
        {nodes.map((node) => (
          <li
            className={cn(
              "rounded-lg border bg-card p-3",
              node.id === selectedId && "border-primary ring-2 ring-primary/15"
            )}
            key={node.id}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <Button
                aria-label={`Inspect ${nodeTitle(node)}`}
                aria-pressed={node.id === selectedId}
                className="h-auto min-w-0 justify-start"
                onClick={() => onSelect(node.id)}
                presentation="sql-plan-node"
                type="button"
                variant="ghost"
              >
                <span className="break-words text-left">{nodeTitle(node)}</span>
              </Button>
              <span className="shrink-0 font-mono text-xs tabular-nums">
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
    </section>
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
  return (
    <section aria-label="Plan insights" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <h3 className="font-semibold">
          Findings{" "}
          <span className="text-muted-foreground">
            {summary.findings.length}
          </span>
        </h3>
        {summary.sharedBuffers ? (
          <span className="font-mono text-muted-foreground">
            {formatCount(summary.sharedBuffers.hits)} hits ·{" "}
            {formatCount(summary.sharedBuffers.reads)} reads
          </span>
        ) : null}
      </div>
      {summary.findings.length > 0 ? (
        <ul className="grid gap-2 xl:grid-cols-2">
          {summary.findings.map(({ node, kind, label }) => (
            <li
              className="min-w-0 rounded-md border border-chart-4/30 bg-chart-4/5 p-2"
              key={`${node.id}-${kind}`}
            >
              <Button
                aria-label={`${label} · ${nodeTitle(node)}`}
                className="h-auto w-full justify-start"
                onClick={() => onSelect(node.id)}
                presentation="sql-plan-insight"
                type="button"
                variant="ghost"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-chart-4"
                />
                <span className="min-w-0 text-left">
                  <span className="block font-medium">{label}</span>
                  <span className="block truncate text-muted-foreground">
                    {nodeTitle(node)}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          {plan.root.actualRows === undefined
            ? "Run Explain analyze for findings."
            : "No spill, heavy filtering or ≥10× row differences reported."}
        </p>
      )}
      {summary.hasParallelWork ? (
        <p className="text-muted-foreground text-xs">
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
    { label: "Total time / loop", value: measuredTime(node.actualTotalMs) },
    { label: "Self time (all loops)", value: measuredTime(node.exclusiveMs) },
    { label: "Planner cost (not ms)", value: node.totalCost },
  ];
  return (
    <section aria-label="Selected node" className="space-y-4">
      <div>
        <h3 className="text-muted-foreground text-xs">Selected node</h3>
        <p className="mt-1 break-words font-medium font-mono text-sm">
          {nodeTitle(node)}
        </p>
      </div>
      {node.actualLoops === 0 ? (
        <p className="text-muted-foreground text-xs">Never executed</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono tabular-nums">
              {typeof value === "number"
                ? formatCount(value)
                : (value ?? "Not reported")}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="space-y-3 border-border border-t pt-3 text-xs">
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
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [search, setSearch] = useState("");
  const summary = summarizeExplainPlan(plan);
  const selected =
    summary.nodes.find((node) => node.id === selectedId) ?? plan.root;
  const maxMs = summary.slowestNode?.exclusiveMs ?? 0;
  const query = search.trim().toLowerCase();
  const matches = summary.nodes.filter((node) =>
    nodeTitle(node).toLowerCase().includes(query)
  );
  const visibleIds = query
    ? new Set(
        summary.nodes.flatMap((node) =>
          matches.some(
            (match) =>
              match.id === node.id || match.id.startsWith(`${node.id}.`)
          )
            ? [node.id]
            : []
        )
      )
    : undefined;
  function selectNode(id: string) {
    setSearch("");
    setCollapsed(
      (current) =>
        new Set([...current].filter((parent) => !id.startsWith(`${parent}.`)))
    );
    onSelect(id);
  }
  function toggleNode(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:overflow-hidden">
      <PlanMetrics nodeCount={summary.nodes.length} plan={plan} />
      <WorkDistribution
        nodes={summary.workNodes}
        onSelect={selectNode}
        selectedId={selected.id}
      />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 bg-muted/20 p-4 lg:overflow-auto">
          <PlanInsights onSelect={selectNode} plan={plan} />
          {mode === "graph" ? (
            <section aria-label="Query plan graph" className="space-y-2 p-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-xs">Plan shape</h3>
                <Input
                  aria-label="Find an operator"
                  className="h-7 w-48 max-w-full"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find an operator"
                  presentation="compact"
                  type="search"
                  value={search}
                />
              </div>
              {matches.length === 0 ? (
                <div className="space-y-2 p-3">
                  <p className="text-muted-foreground text-xs">
                    No operators match.
                  </p>
                  <Button
                    onClick={() => setSearch("")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Clear search
                  </Button>
                </div>
              ) : null}
              <ul>
                <GraphNode
                  collapsed={collapsed}
                  maxMs={maxMs}
                  node={plan.root}
                  onSelect={selectNode}
                  onToggle={toggleNode}
                  selectedId={selected.id}
                  visibleIds={visibleIds}
                />
              </ul>
            </section>
          ) : (
            <PlanTiming
              maxMs={maxMs}
              nodes={summary.workNodes}
              onSelect={selectNode}
              selectedId={selected.id}
            />
          )}
        </div>
        <aside className="min-w-0 border-border border-t bg-background p-4 lg:overflow-auto lg:border-t-0 lg:border-l">
          <NodeInspector node={selected} />
        </aside>
      </div>
    </div>
  );
}

export { ExplainPlanAnalyzer };
