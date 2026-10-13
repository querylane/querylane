"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/querylane-ui/tabs";
import { ExplainPlanAnalyzer } from "@/features/sql-workbench/explain-plan-analyzer";
import type {
  ExplainPlan,
  PlanNode,
} from "@/features/sql-workbench/explain-plan-model";
import {
  estimateMismatch,
  nodeTitle,
} from "@/features/sql-workbench/explain-plan-model";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";

const HOT_SHARE = 0.5;
const WARM_SHARE = 0.2;
const INDENT_PX = 18;
const ROW_BASE_PADDING_PX = 16;
const DETAILS_BASE_PADDING_PX = 48;
const PERCENT = 100;
const GRID_COLUMNS_CLASS = "grid-cols-[minmax(0,1fr)_7rem_7rem_9rem]";

function shareTone(share: number | undefined): string {
  if (share === undefined) {
    return "bg-muted-foreground/30";
  }
  if (share >= HOT_SHARE) {
    return "bg-destructive";
  }
  if (share >= WARM_SHARE) {
    return "bg-chart-4";
  }
  return "bg-chart-3";
}

function MismatchBadge({ node }: { node: PlanNode }) {
  const label = estimateMismatch(node);
  return label ? (
    <span
      className="rounded-sm bg-chart-4/15 px-1.5 py-0.5 font-medium text-foreground text-xs"
      title="Actual rows and estimates compared per loop. Inspect predicates and statistics."
    >
      {label}
    </span>
  ) : null;
}

function RowsCell({ node }: { node: PlanNode }) {
  const rows = node.actualRows ?? node.planRows;
  const loops =
    node.actualLoops && node.actualLoops > 1
      ? ` ×${formatCount(node.actualLoops)}`
      : "";
  return (
    <span className="text-right font-mono text-muted-foreground text-xs tabular-nums">
      {rows === undefined ? "—" : formatCount(rows)}
      {loops}
    </span>
  );
}

function TimeCell({
  hasTimings,
  node,
}: {
  hasTimings: boolean;
  node: PlanNode;
}) {
  if (!hasTimings) {
    return <span className="text-right text-muted-foreground text-xs">—</span>;
  }
  return (
    <span className="flex items-center justify-end gap-2 font-mono text-xs tabular-nums">
      <span
        aria-hidden="true"
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            "block h-full w-(--plan-share) rounded-full",
            shareTone(node.share)
          )}
          style={{
            "--plan-share": `${Math.round((node.share ?? 0) * PERCENT)}%`,
          }}
        />
      </span>
      <span className="w-16 text-right">
        {node.exclusiveMs === undefined ? "—" : formatPlanMs(node.exclusiveMs)}
      </span>
    </span>
  );
}

function NodeDetails({ depth, node }: { depth: number; node: PlanNode }) {
  return (
    <dl
      className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 border-border border-b bg-muted/40 py-2 pr-4 pl-(--plan-indent) font-mono text-xs"
      style={{
        "--plan-indent": `${DETAILS_BASE_PADDING_PX + depth * INDENT_PX}px`,
      }}
    >
      {node.details.length === 0 ? (
        <dd className="col-span-2 text-muted-foreground">No extra details.</dd>
      ) : null}
      {node.details.map((detail) => (
        <div className="contents" key={detail.label}>
          <dt className="text-muted-foreground">{detail.label}</dt>
          <dd className="break-words">{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanRow({
  depth,
  hasTimings,
  node,
}: {
  depth: number;
  hasTimings: boolean;
  node: PlanNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = nodeTitle(node);
  return (
    <>
      <div
        className={cn(
          "grid items-center gap-3 border-border border-b py-1.5 pr-4 pl-(--plan-indent) text-sm",
          GRID_COLUMNS_CLASS
        )}
        style={{
          "--plan-indent": `${ROW_BASE_PADDING_PX + depth * INDENT_PX}px`,
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${title}`}
            className="size-6 shrink-0"
            onClick={() => setExpanded((current) => !current)}
            presentation="muted"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </Button>
          <span className="text-(length:--text-caption) truncate font-medium font-mono">
            {title}
          </span>
          <MismatchBadge node={node} />
        </div>
        <RowsCell node={node} />
        <span className="text-right font-mono text-muted-foreground text-xs tabular-nums">
          {node.totalCost === undefined ? "—" : node.totalCost.toFixed(2)}
        </span>
        <TimeCell hasTimings={hasTimings} node={node} />
      </div>
      {expanded ? <NodeDetails depth={depth} node={node} /> : null}
      {node.children.map((child) => (
        <PlanRow
          depth={depth + 1}
          hasTimings={hasTimings}
          key={child.id}
          node={child}
        />
      ))}
    </>
  );
}

function PlanSummary({
  analyze,
  plan,
}: {
  analyze: boolean;
  plan: ExplainPlan;
}) {
  const parts = [analyze ? "EXPLAIN ANALYZE" : "EXPLAIN"];
  if (plan.planningTimeMs !== undefined) {
    parts.push(`planning ${formatPlanMs(plan.planningTimeMs)}`);
  }
  if (plan.executionTimeMs !== undefined) {
    parts.push(`execution ${formatPlanMs(plan.executionTimeMs)}`);
  }
  return (
    <p className="text-muted-foreground text-xs">
      {parts.join(" · ")}
      {analyze
        ? null
        : " · Estimates only; use Explain analyze to measure actual time."}
    </p>
  );
}

function PlanTree({
  hasTimings,
  plan,
}: {
  hasTimings: boolean;
  plan: ExplainPlan;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div
        className={cn(
          "sticky top-0 z-10 grid gap-3 border-border border-b bg-background px-4 py-1.5 text-muted-foreground text-xs uppercase tracking-wide",
          GRID_COLUMNS_CLASS
        )}
      >
        <span>Node</span>
        <span className="text-right">{hasTimings ? "Rows" : "Est. rows"}</span>
        <span className="text-right">Cost</span>
        <span className="text-right">{hasTimings ? "Self time" : "Time"}</span>
      </div>
      <PlanRow depth={0} hasTimings={hasTimings} node={plan.root} />
    </div>
  );
}

function formatRawPlan(rawPlan: string): string {
  try {
    return JSON.stringify(JSON.parse(rawPlan), null, 2);
  } catch {
    return rawPlan;
  }
}

function ParsedPlanView({
  analyze,
  plan,
  rawPlan,
}: {
  analyze: boolean;
  plan: ExplainPlan;
  rawPlan: string;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const hasTimings = analyze && plan.root.actualTotalMs !== undefined;
  return (
    <Tabs
      className="flex min-h-0 flex-1 flex-col"
      defaultValue="graph"
      presentation="flush"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-2">
        <PlanSummary analyze={analyze} plan={plan} />
        <TabsList aria-label="Plan view" className="h-7">
          <TabsTrigger
            className="h-6"
            presentation="sql-plan-mode"
            value="graph"
          >
            Graph
          </TabsTrigger>
          <TabsTrigger
            className="h-6"
            presentation="sql-plan-mode"
            value="timing"
          >
            Timing
          </TabsTrigger>
          <TabsTrigger
            className="h-6"
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
      <TabsContent className="flex min-h-0 flex-1 flex-col" value="graph">
        <ExplainPlanAnalyzer
          mode="graph"
          onSelect={setSelectedId}
          plan={plan}
          selectedId={selectedId ?? plan.root.id}
        />
      </TabsContent>
      <TabsContent className="flex min-h-0 flex-1 flex-col" value="timing">
        <ExplainPlanAnalyzer
          mode="timing"
          onSelect={setSelectedId}
          plan={plan}
          selectedId={selectedId ?? plan.root.id}
        />
      </TabsContent>
      <TabsContent className="flex min-h-0 flex-1 flex-col" value="tree">
        <PlanTree hasTimings={hasTimings} plan={plan} />
      </TabsContent>
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
  plan,
  rawPlan,
}: {
  analyze: boolean;
  plan: ExplainPlan | undefined;
  rawPlan: string;
}) {
  if (!plan) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="border-border border-b px-4 py-2 text-muted-foreground text-xs">
          The plan could not be parsed into a tree; showing the raw output.
        </p>
        <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
          {formatRawPlan(rawPlan)}
        </pre>
      </div>
    );
  }
  // A new result resets selection and view, even when path-based node IDs repeat.
  return (
    <ParsedPlanView
      analyze={analyze}
      key={rawPlan}
      plan={plan}
      rawPlan={rawPlan}
    />
  );
}

export { ExplainPlanView };
