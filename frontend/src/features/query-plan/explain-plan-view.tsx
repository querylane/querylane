"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Crosshair,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/querylane-ui/select";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/querylane-ui/tabs";
import {
  type ExplainPlan,
  flattenPlan,
  type PlanMetric,
  type PlanNode,
  parseExplainPlan,
  planMetricValue,
  planNodeInsights,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import { PlanNodeInspector } from "@/features/query-plan/plan-node-inspector";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";

const METRICS = [
  {
    value: "self",
    label: "Self time",
    heading: "Self time ≈",
    hint: "Estimated; not a timeline",
  },
  {
    value: "time",
    label: "Total time",
    heading: "Time × loops",
    hint: "Includes children; not a timeline",
  },
  { value: "rows", label: "Rows", heading: "Rows / loop", hint: "Per loop" },
  {
    value: "buffers",
    label: "Shared buffers",
    heading: "Shared blocks",
    hint: "Hits + reads, including children",
  },
  {
    value: "cost",
    label: "Estimated cost",
    heading: "Est. cost",
    hint: "Planner units, including children",
  },
] as const;
const LANE_WIDTH = 16;
const ROW_HEIGHT = 44;
const HOT_SHARE = 0.5;
const PERCENT = 100;
const DOT_RADIUS = 3;
const SELECTED_DOT_RADIUS = 4;

function MetricBar({
  node,
  metric,
  maximum,
}: {
  node: PlanNode;
  metric: PlanMetric;
  maximum: number;
}) {
  const value = planMetricValue(node, metric);
  const share =
    maximum > 0 && value !== undefined ? Math.min(1, value / maximum) : 0;
  let label = "—";
  if (value !== undefined) {
    label =
      metric === "self" || metric === "time"
        ? formatPlanMs(value)
        : formatCount(value);
  }
  return (
    <div className="flex items-center justify-end gap-3 font-mono text-xs tabular-nums">
      <span
        aria-hidden="true"
        className="h-2 w-20 overflow-hidden rounded-sm bg-muted"
      >
        <span
          className={cn(
            "block h-full w-(--plan-share) rounded-sm",
            share >= HOT_SHARE ? "bg-chart-4" : "bg-primary/60"
          )}
          style={{ "--plan-share": `${share * PERCENT}%` }}
        />
      </span>
      <span className="w-20 text-right">{label}</span>
    </div>
  );
}

/** Dependency connectors share the same rows as the metrics; never a time axis. */
function TopologyRail({
  continuations,
  expanded,
  selected,
}: {
  continuations: boolean[];
  expanded: boolean;
  selected: boolean;
}) {
  const depth = continuations.length;
  const x = depth * LANE_WIDTH + LANE_WIDTH / 2;
  const centerY = ROW_HEIGHT / 2;
  const bend = LANE_WIDTH / 2;
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 overflow-visible text-border"
      height={ROW_HEIGHT}
      width={(depth + 1) * LANE_WIDTH}
    >
      {continuations.map((continues, index) =>
        continues ? (
          <path
            d={`M ${index * LANE_WIDTH + LANE_WIDTH / 2} 0 V ${ROW_HEIGHT}`}
            key={`lane-${index.toString()}`}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ) : null
      )}
      {depth > 0 ? (
        <path
          d={`M ${x - LANE_WIDTH} 0 V ${centerY - bend} Q ${x - LANE_WIDTH} ${centerY} ${x - LANE_WIDTH + bend} ${centerY} H ${x}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ) : null}
      {expanded ? (
        <path
          d={`M ${x} 22 V ${ROW_HEIGHT}`}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ) : null}
      <circle
        className={
          selected
            ? "fill-primary stroke-primary"
            : "fill-background stroke-muted-foreground"
        }
        cx={x}
        cy="22"
        r={selected ? SELECTED_DOT_RADIUS : DOT_RADIUS}
        strokeWidth="1.5"
      />
    </svg>
  );
}

interface PlanRowsProps {
  collapsed: ReadonlySet<string>;
  continuations: boolean[];
  maximum: number;
  metric: PlanMetric;
  node: PlanNode;
  onSelect: (node: PlanNode) => void;
  onToggle: (node: PlanNode) => void;
  selectedId: string;
}

function PlanOperation({
  node,
  continuations,
  expanded,
  selected,
  onSelect,
  onToggle,
}: {
  node: PlanNode;
  continuations: boolean[];
  expanded: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const insights = planNodeInsights(node);
  const title = planNodeTitle(node);
  return (
    <td className="py-0 pr-2 pl-4">
      <div className="flex min-w-64 items-center gap-1">
        <TopologyRail
          continuations={continuations}
          expanded={expanded}
          selected={selected}
        />
        {node.children.length > 0 ? (
          <Button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title} branch`}
            className="shrink-0"
            onClick={onToggle}
            presentation="muted"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <Button
          aria-description={`Level ${continuations.length + 1}. ${insights.map((insight) => insight.label).join(". ")}`}
          aria-label={`Inspect ${title}`}
          aria-pressed={selected}
          className="h-auto min-w-0 justify-start"
          onClick={onSelect}
          presentation="sql-plan-node"
          type="button"
          variant="ghost"
        >
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="font-medium">{node.nodeType}</span>
              {insights.length > 0 ? (
                <CircleAlert
                  aria-label={insights
                    .map((insight) => insight.label)
                    .join("; ")}
                  className="size-3 text-chart-4"
                />
              ) : null}
            </span>
            {node.relationName ? (
              <span
                className="max-w-64 truncate font-mono text-muted-foreground text-xs"
                title={title}
              >
                {node.relationName}
                {node.indexName ? ` · ${node.indexName}` : ""}
              </span>
            ) : null}
          </span>
        </Button>
      </div>
    </td>
  );
}

function PlanRows(props: PlanRowsProps) {
  const {
    node,
    continuations,
    collapsed,
    selectedId,
    metric,
    maximum,
    onSelect,
    onToggle,
  } = props;
  const expanded = !collapsed.has(node.id) && node.children.length > 0;
  const selected = node.id === selectedId;
  return (
    <>
      <tr
        className={cn("border-b hover:bg-muted/30", selected && "bg-muted/70")}
        data-plan-node={node.id}
      >
        <PlanOperation
          continuations={continuations}
          expanded={expanded}
          node={node}
          onSelect={() => onSelect(node)}
          onToggle={() => onToggle(node)}
          selected={selected}
        />
        {[
          { label: "rows", value: node.actualRows },
          { label: "estimate", value: node.planRows },
          { label: "loops", value: node.actualLoops },
        ].map((cell) => (
          <td
            className="px-2 py-2 text-right font-mono text-muted-foreground text-xs tabular-nums"
            key={cell.label}
          >
            {cell.value === undefined ? "—" : formatCount(cell.value)}
          </td>
        ))}
        <td className="py-2 pr-4 pl-2">
          <MetricBar maximum={maximum} metric={metric} node={node} />
        </td>
      </tr>
      {expanded
        ? node.children.map((child, index) => (
            <PlanRows
              {...props}
              continuations={[
                ...continuations,
                index < node.children.length - 1,
              ]}
              key={child.id}
              node={child}
            />
          ))
        : null}
    </>
  );
}

function formatRawPlan(rawPlan: string): string {
  try {
    return JSON.stringify(JSON.parse(rawPlan), null, 2);
  } catch {
    return rawPlan;
  }
}

function PlanMetricControls({
  analyze,
  hotspot,
  metric,
  nodes,
  onMetric,
  onSelect,
}: {
  analyze: boolean;
  hotspot: PlanNode | undefined;
  metric: PlanMetric;
  nodes: PlanNode[];
  onMetric: (metric: PlanMetric) => void;
  onSelect: (node: PlanNode) => void;
}) {
  const active = METRICS.find((item) => item.value === metric);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Select
          items={METRICS}
          onValueChange={(value) => {
            if (value) {
              onMetric(value);
            }
          }}
          value={metric}
        >
          <SelectTrigger
            aria-label="Plan metric"
            className="h-7 w-36"
            presentation="compact"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRICS.map((item) => (
              <SelectItem
                disabled={
                  (!analyze &&
                    (item.value === "self" || item.value === "time")) ||
                  !nodes.some(
                    (node) => planMetricValue(node, item.value) !== undefined
                  )
                }
                key={item.value}
                value={item.value}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">{active?.hint}</span>
      </div>
      {hotspot ? (
        <Button
          onClick={() => onSelect(hotspot)}
          presentation="muted"
          size="xs"
          type="button"
          variant="ghost"
        >
          <Crosshair className="size-3" />
          Find hotspot
        </Button>
      ) : null}
    </div>
  );
}

function PlanSummary({
  analyze,
  plan,
  nodes,
}: {
  analyze: boolean;
  plan: ExplainPlan | undefined;
  nodes: PlanNode[];
}) {
  if (!plan) {
    return (
      <p className="text-muted-foreground text-xs">
        Unrecognized plan. Raw output preserved.
      </p>
    );
  }
  const parts = [`${nodes.length} nodes`];
  if (plan.executionTimeMs !== undefined) {
    parts.unshift(`Execution ${formatPlanMs(plan.executionTimeMs)}`);
  }
  if (plan.planningTimeMs !== undefined) {
    parts.push(`Planning ${formatPlanMs(plan.planningTimeMs)}`);
  }
  const findings = nodes.reduce(
    (sum, node) => sum + planNodeInsights(node).length,
    0
  );
  if (findings > 0) {
    parts.push(`${findings} findings`);
  }
  if (!analyze) {
    parts.push("Estimates only");
  }
  return <p className="text-muted-foreground text-xs">{parts.join(" · ")}</p>;
}

function defaultPlanMetric(nodes: PlanNode[], analyze: boolean): PlanMetric {
  if (!analyze) {
    return "cost";
  }
  if (nodes.some((node) => node.exclusiveMs !== undefined)) {
    return "self";
  }
  if (nodes.some((node) => node.inclusiveMs !== undefined)) {
    return "time";
  }
  return "cost";
}
function PlanExplorer({
  analyze,
  plan,
  rawPlan,
}: {
  analyze: boolean;
  plan: ExplainPlan | undefined;
  rawPlan: string;
}) {
  const nodes = plan ? flattenPlan(plan.root) : [];
  const initialMetric = defaultPlanMetric(nodes, analyze);
  const hasSelfTime = initialMetric === "self";
  const [metric, setMetric] = useState<PlanMetric>(initialMetric);
  const [selection, setSelection] = useState({
    id: plan?.root.id,
    inspect: false,
  });
  const selectedId = selection.id;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState(plan ? "tree" : "raw");
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(
    function revealSelectedNode() {
      if (mode !== "tree") {
        return;
      }
      const layout = tableRef.current?.parentElement;
      const stacked =
        layout && getComputedStyle(layout).flexDirection === "column";
      // On narrow layouts, selecting a row brings its inspector into view.
      const target =
        selection.inspect && stacked
          ? layout.querySelector("aside")
          : tableRef.current?.querySelector(
              `[data-plan-node="${selection.id}"]`
            );
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [selection, mode]
  );
  const selected = nodes.find((node) => node.id === selectedId) ?? plan?.root;
  const maximum = Math.max(
    0,
    ...nodes.map((node) => planMetricValue(node, metric) ?? 0)
  );
  const hotspot = hasSelfTime
    ? nodes.reduce<PlanNode | undefined>(
        (current, node) =>
          (node.exclusiveMs ?? 0) > (current?.exclusiveMs ?? 0)
            ? node
            : current,
        undefined
      )
    : undefined;
  const heading = METRICS.find((item) => item.value === metric)?.heading;
  function selectNode(node: PlanNode) {
    setSelection({ id: node.id, inspect: true });
    // Selecting a hotspot reveals its ancestors, without discarding other folds.
    setCollapsed(
      new Set([...collapsed].filter((id) => !node.id.startsWith(`${id}.`)))
    );
  }
  function toggleNode(node: PlanNode) {
    const next = new Set(collapsed);
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
      if (selectedId?.startsWith(`${node.id}.`)) {
        setSelection({ id: node.id, inspect: false });
      }
    }
    setCollapsed(next);
  }
  return (
    <Tabs
      aria-label="Query plan"
      className="flex min-h-0 flex-1 flex-col"
      onValueChange={setMode}
      presentation="flush"
      role="region"
      value={mode}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
        <PlanSummary analyze={analyze} nodes={nodes} plan={plan} />
        <TabsList aria-label="Plan display" className="h-7">
          <TabsTrigger
            className="h-6"
            disabled={!plan}
            presentation="sql-plan-mode"
            value="tree"
          >
            Tree
          </TabsTrigger>
          <TabsTrigger className="h-6" presentation="sql-plan-mode" value="raw">
            JSON
          </TabsTrigger>
        </TabsList>
      </div>
      {plan ? (
        <TabsContent className="flex min-h-0 flex-1 flex-col" value="tree">
          <PlanMetricControls
            analyze={analyze}
            hotspot={hotspot}
            metric={metric}
            nodes={nodes}
            onMetric={setMetric}
            onSelect={selectNode}
          />
          <div className="@container min-h-0 flex-1">
            <div className="flex h-full @4xl:flex-row flex-col overflow-auto @4xl:overflow-hidden">
              <div
                className="min-h-48 min-w-0 flex-1 overflow-auto"
                ref={tableRef}
              >
                <table
                  aria-label="Execution plan"
                  className="w-full min-w-2xl border-collapse text-xs"
                >
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b text-left">
                      {[
                        "Operation",
                        "Rows / loop",
                        "Est. rows",
                        "Loops",
                        heading,
                      ].map((label, index) => (
                        <th
                          className={cn(
                            "h-9 whitespace-nowrap px-2 text-right font-medium last:pr-4",
                            index === 0 && "w-full pl-4 text-left"
                          )}
                          key={label}
                          scope="col"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <PlanRows
                      collapsed={collapsed}
                      continuations={[]}
                      maximum={maximum}
                      metric={metric}
                      node={plan.root}
                      onSelect={selectNode}
                      onToggle={toggleNode}
                      selectedId={selected?.id ?? plan.root.id}
                    />
                  </tbody>
                </table>
              </div>
              {selected ? (
                <PlanNodeInspector
                  node={selected}
                  onViewJson={() => setMode("raw")}
                  parallel={Boolean(plan.root.parallel)}
                />
              ) : null}
            </div>
          </div>
        </TabsContent>
      ) : null}
      <TabsContent className="min-h-0 flex-1 overflow-auto" value="raw">
        <pre className="px-4 py-3 font-mono text-xs leading-relaxed">
          {formatRawPlan(rawPlan)}
        </pre>
      </TabsContent>
    </Tabs>
  );
}

function ExplainPlanView({
  analyze,
  rawPlan,
}: {
  analyze: boolean;
  rawPlan: string;
}) {
  const plan = parseExplainPlan(rawPlan) ?? undefined;
  // A new EXPLAIN result must never inherit a previous plan's selection or folds.
  return (
    <PlanExplorer
      analyze={analyze}
      key={rawPlan}
      plan={plan}
      rawPlan={rawPlan}
    />
  );
}

export { ExplainPlanView };
