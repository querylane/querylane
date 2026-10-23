"use client";

import { ChevronDown, ChevronRight, Crosshair } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/querylane-ui/dialog";
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
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import { PlanMap } from "@/features/query-plan/plan-map";
import { PlanNodeInspector } from "@/features/query-plan/plan-node-inspector";
import { PlanOverview } from "@/features/query-plan/plan-overview";
import { PlanSearch } from "@/features/query-plan/plan-search";
import { PlanTiming } from "@/features/query-plan/plan-timing";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";
import { isNonEmptyString } from "@/lib/value-guards";

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
const LARGE_PLAN_SIZE = 40;
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
        className="bg-muted h-2 w-20 overflow-hidden rounded-sm"
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

/** Dependency rails share the metric rows; they do not encode timing. */
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
  const center = ROW_HEIGHT / 2;
  const paths = continuations.flatMap((continues, index) =>
    continues
      ? [`M ${index * LANE_WIDTH + LANE_WIDTH / 2} 0 V ${ROW_HEIGHT}`]
      : []
  );
  if (depth > 0) {
    paths.push(
      `M ${x - LANE_WIDTH} 0 V ${center - LANE_WIDTH / 2} Q ${x - LANE_WIDTH} ${center} ${x - LANE_WIDTH / 2} ${center} H ${x}`
    );
  }
  if (expanded) {
    paths.push(`M ${x} ${center} V ${ROW_HEIGHT}`);
  }
  return (
    <svg
      aria-hidden="true"
      className="text-border shrink-0 overflow-visible"
      height={ROW_HEIGHT}
      width={(depth + 1) * LANE_WIDTH}
    >
      <path
        d={paths.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        className={
          selected
            ? "fill-primary stroke-primary"
            : "fill-background stroke-muted-foreground"
        }
        cx={x}
        cy={center}
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
  const title = planNodeTitle(node);
  return (
    <>
      <tr
        className={cn(
          "hover:bg-muted/30 border-b",
          node.id === selectedId && "bg-muted/70"
        )}
        data-plan-node={node.id}
      >
        <td className="py-0 pr-2 pl-4">
          <div className="flex min-w-64 items-center gap-1">
            <TopologyRail
              continuations={continuations}
              expanded={expanded}
              selected={node.id === selectedId}
            />
            {node.children.length > 0 ? (
              <Button
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${title} branch`}
                className="shrink-0"
                onClick={() => {
                  onToggle(node);
                }}
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
              aria-label={`Inspect ${title}`}
              aria-pressed={node.id === selectedId}
              className="h-auto min-w-0 justify-start"
              onClick={() => {
                onSelect(node);
              }}
              presentation="sql-plan-node"
              type="button"
              variant="ghost"
            >
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="text-xs font-medium">{node.nodeType}</span>
                {isNonEmptyString(node.relationName) ? (
                  <span
                    className="text-muted-foreground max-w-64 truncate font-mono text-xs"
                    title={title}
                  >
                    {node.relationName}
                  </span>
                ) : null}
              </span>
            </Button>
          </div>
        </td>
        {[node.actualRows, node.planRows, node.actualLoops].map(
          (value, index) => (
            <td
              className="text-muted-foreground p-2 text-right font-mono text-xs tabular-nums"
              key={index.toString()}
            >
              {value === undefined ? "—" : formatCount(value)}
            </td>
          )
        )}
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
  visible,
  analyze,
  hotspot,
  metric,
  nodes,
  onMetric,
  onSelect,
}: {
  visible: boolean;
  analyze: boolean;
  hotspot: PlanNode | undefined;
  metric: PlanMetric;
  nodes: PlanNode[];
  onMetric: (metric: PlanMetric) => void;
  onSelect: (node: PlanNode) => void;
}) {
  if (!visible) {
    return null;
  }
  const active = METRICS.find((item) => item.value === metric);
  return (
    <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
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
          onClick={() => {
            onSelect(hotspot);
          }}
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
function largestMetricNode(nodes: PlanNode[], metric: PlanMetric) {
  return nodes.reduce<PlanNode | undefined>(
    (largest, node) =>
      (planMetricValue(node, metric) ?? 0) >
      (largest ? (planMetricValue(largest, metric) ?? 0) : 0)
        ? node
        : largest,
    undefined
  );
}
function PlanExplorer({
  analyze,
  plan,
  rawPlan,
}: {
  analyze: boolean;
  plan: ExplainPlan;
  rawPlan: string;
}) {
  const nodes = flattenPlan(plan.root);
  const initialMetric = defaultPlanMetric(nodes, analyze);
  const initialHotspot =
    initialMetric === "self"
      ? largestMetricNode(nodes, initialMetric)
      : undefined;
  const [metric, setMetric] = useState<PlanMetric>(initialMetric);
  const hotspot = largestMetricNode(nodes, metric);
  const [selection, setSelection] = useState({
    id: initialHotspot?.id ?? plan.root.id,
    inspect: false,
  });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState(
    nodes.length > LARGE_PLAN_SIZE ? "tree" : "map"
  );
  const [focused, setFocused] = useState(false);
  const focusButtonRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  useEffect(
    function revealSelectedNode() {
      const layout = layoutRef.current;
      const stacked =
        layout && getComputedStyle(layout).flexDirection === "column";
      if (selection.inspect && stacked === true) {
        layout.querySelector("aside")?.scrollIntoView({ block: "nearest" });
      } else if (mode === "tree") {
        tableRef.current
          ?.querySelector(`[data-plan-node="${selection.id}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [selection, mode]
  );
  const selected = nodes.find((node) => node.id === selection.id) ?? plan.root;
  const maximum = Math.max(
    0,
    ...nodes.map((node) => planMetricValue(node, metric) ?? 0)
  );
  function selectNode(node: PlanNode) {
    setSelection({ id: node.id, inspect: true });
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
      if (selection.id?.startsWith(`${node.id}.`)) {
        setSelection({ id: node.id, inspect: false });
      }
    }
    setCollapsed(next);
  }
  const content = (
    <Tabs
      aria-label="Query plan"
      className="@container flex min-h-0 flex-1 flex-col"
      onValueChange={(value: string) => {
        setMode(value);
        setSelection({ id: selection.id, inspect: false });
        layoutRef.current?.scrollTo({ top: 0, left: 0 });
      }}
      presentation="flush"
      role="region"
      value={mode}
    >
      {!focused && <h2 className="sr-only">Query plan</h2>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <TabsList aria-label="Plan display" className="h-7">
          <TabsTrigger className="h-6" presentation="sql-plan-mode" value="map">
            Map
          </TabsTrigger>
          <TabsTrigger
            className="h-6"
            presentation="sql-plan-mode"
            value="tree"
          >
            Operators
          </TabsTrigger>
          <TabsTrigger
            className="h-6"
            presentation="sql-plan-mode"
            value="timing"
          >
            Timing
          </TabsTrigger>
          <TabsTrigger className="h-6" presentation="sql-plan-mode" value="raw">
            JSON
          </TabsTrigger>
        </TabsList>
        {focused ? (
          <span className="text-muted-foreground mr-8 text-xs">
            Plan analysis
          </span>
        ) : (
          <Button
            onClick={() => {
              setFocused(true);
            }}
            presentation="compact"
            ref={focusButtonRef}
            size="xs"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">↗</span>
            Focus plan
          </Button>
        )}
      </div>
      {mode === "raw" ? null : (
        <>
          <PlanOverview
            nodes={nodes}
            onSelect={selectNode}
            plan={plan}
            selectedId={selected?.id ?? plan.root.id}
          />
          <PlanMetricControls
            analyze={analyze}
            hotspot={hotspot}
            metric={metric}
            nodes={nodes}
            onMetric={setMetric}
            onSelect={selectNode}
            visible={mode !== "timing"}
          />
          <PlanSearch nodes={nodes} onSelect={selectNode} />
        </>
      )}
      <TabsContent className="flex min-h-0 flex-1 flex-col" value={mode}>
        <PlanBody
          layoutRef={layoutRef}
          mode={mode}
          onViewJson={() => {
            setMode("raw");
          }}
          plan={plan}
          rawPlan={rawPlan}
          rows={{
            collapsed,
            continuations: [],
            maximum,
            metric,
            node: plan.root,
            onSelect: selectNode,
            onToggle: toggleNode,
            selectedId: selected.id,
          }}
          selected={selected}
          selection={selection}
          tableRef={tableRef}
        />
      </TabsContent>
    </Tabs>
  );
  return (
    <Dialog onOpenChange={setFocused} open={focused}>
      {!focused && content}
      <DialogContent finalFocus={focusButtonRef} presentation="query-plan">
        <DialogTitle className="sr-only">Query plan</DialogTitle>
        {focused ? content : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanBody({
  plan,
  mode,
  rawPlan,
  selected,
  selection,
  rows,
  onViewJson,
  layoutRef,
  tableRef,
}: {
  plan: ExplainPlan;
  mode: string;
  rawPlan: string;
  selected: PlanNode;
  selection: { id: string; inspect: boolean };
  rows: PlanRowsProps;
  onViewJson: () => void;
  layoutRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  if (mode === "raw") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="px-4 py-3 font-mono text-xs leading-relaxed">
          {formatRawPlan(rawPlan)}
        </pre>
      </div>
    );
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-auto @4xl:flex-row @4xl:overflow-hidden"
      ref={layoutRef}
    >
      <PlanVisualization
        mode={mode}
        plan={plan}
        rows={rows}
        selection={selection}
        tableRef={tableRef}
      />
      <PlanNodeInspector
        node={selected}
        onViewJson={onViewJson}
        parallel={Boolean(plan.root.parallel)}
      />
    </div>
  );
}

function PlanVisualization({
  mode,
  plan,
  rows,
  selection,
  tableRef,
}: {
  mode: string;
  plan: ExplainPlan;
  rows: PlanRowsProps;
  selection: { id: string; inspect: boolean };
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  const { onSelect: handleSelect } = rows;
  if (mode === "timing") {
    return (
      <PlanTiming
        nodes={flattenPlan(plan.root)}
        onSelect={handleSelect}
        selectedId={rows.selectedId}
      />
    );
  }
  if (mode === "map") {
    return (
      <PlanMap
        metric={rows.metric}
        onSelect={handleSelect}
        root={plan.root}
        selection={selection}
      />
    );
  }
  const heading = METRICS.find((item) => item.value === rows.metric)?.heading;
  return (
    <div className="min-h-48 min-w-0 flex-1 overflow-auto" ref={tableRef}>
      <table
        aria-label="Execution plan"
        className="w-full min-w-2xl border-collapse text-xs"
      >
        <thead className="bg-background sticky top-0 z-10">
          <tr className="border-b text-left">
            {["Operation", "Rows / loop", "Est. rows", "Loops", heading].map(
              (label, index) => (
                <th
                  className={cn(
                    "h-9 px-2 text-right font-medium whitespace-nowrap last:pr-4",
                    index === 0 && "w-full pl-4 text-left"
                  )}
                  key={label}
                  scope="col"
                >
                  {label}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          <PlanRows {...rows} />
        </tbody>
      </table>
    </div>
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
  if (!plan) {
    return (
      <Tabs
        aria-label="Query plan"
        className="flex min-h-0 flex-1 flex-col"
        presentation="flush"
        role="region"
        value="raw"
      >
        <TabsList aria-label="Plan display">
          <TabsTrigger value="raw">JSON</TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0 flex-1 overflow-auto" value="raw">
          <p className="text-muted-foreground px-4 pt-3 text-xs">
            Unrecognized plan. Raw output preserved.
          </p>
          <pre className="px-4 py-3 font-mono text-xs leading-relaxed">
            {formatRawPlan(rawPlan)}
          </pre>
        </TabsContent>
      </Tabs>
    );
  }
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
