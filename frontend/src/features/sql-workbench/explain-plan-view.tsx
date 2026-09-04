"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ExplainPlan,
  PlanNode,
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
const MISMATCH_RATIO = 10;
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

function nodeTitle(node: PlanNode): string {
  let title = node.nodeType;
  if (node.relationName) {
    title += ` on ${node.relationName}`;
  }
  if (node.indexName) {
    title += ` using ${node.indexName}`;
  }
  return title;
}

function estimateRatio(node: PlanNode): number | undefined {
  if (node.planRows === undefined || node.actualRows === undefined) {
    return;
  }
  const actual = node.actualRows * (node.actualLoops ?? 1);
  if (node.planRows === 0 || actual === 0) {
    return;
  }
  return actual / node.planRows;
}

function MismatchBadge({ node }: { node: PlanNode }) {
  const ratio = estimateRatio(node);
  if (
    ratio === undefined ||
    (ratio < MISMATCH_RATIO && ratio > 1 / MISMATCH_RATIO)
  ) {
    return null;
  }
  const label =
    ratio >= 1
      ? `${Math.round(ratio)}× more`
      : `${Math.round(1 / ratio)}× fewer`;
  return (
    <span
      className="rounded-sm bg-chart-4/15 px-1.5 py-0.5 font-medium text-[11px] text-chart-4"
      title="Actual rows differ from the planner's estimate by more than 10×. Stale statistics are the usual cause; ANALYZE the table."
    >
      {label} than estimated
    </span>
  );
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
          className={cn("block h-full rounded-full", shareTone(node.share))}
          style={{ width: `${Math.round((node.share ?? 0) * PERCENT)}%` }}
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
      className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 border-border border-b bg-muted/40 px-4 py-2 font-mono text-xs"
      style={{
        paddingLeft: `${DETAILS_BASE_PADDING_PX + depth * INDENT_PX}px`,
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
          "grid items-center gap-3 border-border border-b px-4 py-1.5 text-sm",
          GRID_COLUMNS_CLASS
        )}
        style={{ paddingLeft: `${ROW_BASE_PADDING_PX + depth * INDENT_PX}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${title}`}
            className="size-6 shrink-0 text-muted-foreground"
            onClick={() => setExpanded((current) => !current)}
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
          <span className="truncate font-medium font-mono text-[13px]">
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
          "sticky top-0 z-10 grid gap-3 border-border border-b bg-background px-4 py-1.5 text-[11px] text-muted-foreground uppercase tracking-wide",
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

function ExplainPlanView({
  analyze,
  plan,
  rawPlan,
}: {
  analyze: boolean;
  plan: ExplainPlan | undefined;
  rawPlan: string;
}) {
  const [mode, setMode] = useState<"raw" | "tree">(plan ? "tree" : "raw");
  const hasTimings = analyze && plan?.root.actualTotalMs !== undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-2">
        {plan ? (
          <PlanSummary analyze={analyze} plan={plan} />
        ) : (
          <p className="text-muted-foreground text-xs">
            The plan could not be parsed into a tree; showing the raw output.
          </p>
        )}
        <Tabs
          onValueChange={(value) => setMode(value === "raw" ? "raw" : "tree")}
          value={mode}
        >
          <TabsList className="h-7">
            <TabsTrigger
              className="h-6 px-2 text-xs"
              disabled={!plan}
              value="tree"
            >
              Tree
            </TabsTrigger>
            <TabsTrigger className="h-6 px-2 text-xs" value="raw">
              JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode === "tree" && plan ? (
        <PlanTree hasTimings={hasTimings} plan={plan} />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
          {formatRawPlan(rawPlan)}
        </pre>
      )}
    </div>
  );
}

export { ExplainPlanView };
