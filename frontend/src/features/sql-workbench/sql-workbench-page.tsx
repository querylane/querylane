"use client";

import {
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  Maximize2,
  Plus,
  Sparkles,
} from "lucide-react";
import { useId, useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { executeWorkbenchQuery, explainWorkbenchQuery } from "@/hooks/api/sql";
import { assertNever } from "@/lib/assert-never";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import {
  ExplainQueryRequest_Format,
  type ExplainQueryResponse,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import {
  buildWorkbenchParent,
  collectExecuteQueryStream,
  type ExecuteQueryTableState,
  type ExplainPlanNode,
  type ExplainPlanSummary,
  formatCellValue,
  formatDurationMs,
  isReadOnlyStatementCandidate,
  parseExplainTextPlan,
} from "./sql-workbench-model";

const DEFAULT_SQL = `SELECT s.ref, c.name AS carrier, s.status,
       s.origin_port, s.dest_port, s.eta
FROM shipping.shipments s
JOIN shipping.carriers c ON c.id = s.carrier_id
WHERE s.status = 'customs_hold'
ORDER BY s.eta ASC
LIMIT 50;`;

const EDITOR_LINE_COUNT = 7;
const FIRST_EDITOR_LINE_NUMBER = 1;
const EDITOR_LINE_NUMBERS = Array.from(
  { length: EDITOR_LINE_COUNT },
  (_, index) => index + FIRST_EDITOR_LINE_NUMBER
);

const GUARD_ALLOWED = [
  {
    note: "joins, CTE reads, aggregates, and filters",
    what: "SELECT / WITH / VALUES",
  },
  { note: "server settings only", what: "SHOW" },
  { note: "Querylane wraps the statement itself", what: "Explain button" },
];

const GUARD_BLOCKED = [
  { note: "and every DDL statement", what: "INSERT · UPDATE · DELETE · MERGE" },
  { note: "creates a table", what: "SELECT INTO" },
  { note: "takes row locks", what: "SELECT … FOR UPDATE / SHARE" },
  { note: "transaction and session control", what: "BEGIN · COMMIT · SET" },
];

interface SqlWorkbenchPageProps {
  databaseId: string;
  instanceId: string;
}

type WorkbenchMode = "editor" | "builder" | "english";
type ResultTab = "results" | "explain";
type ExplainView = "graph" | "timeline" | "table" | "text";
type PlanInsightKind = "buffers" | "estimates" | "slowest";

const PERCENT = 100;
const HEALTHY_ESTIMATE_DELTA_PERCENT = 20;
const MINIMUM_NODE_BAR_PERCENT = 2;
const MAX_GRAPH_DEPTH = 6;
const GRAPH_DEPTH_OFFSET_PX = 40;
const SMALL_PLAN_MS_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const LARGE_PLAN_MS_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 1,
});
const WORKBENCH_MODE_OPTIONS = [
  { label: "SQL editor", value: "editor" },
  { label: "Visual builder", value: "builder" },
  { label: "Ask in English", value: "english" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: WorkbenchMode;
}>;

function planInsightKinds(summary: ExplainPlanSummary): PlanInsightKind[] {
  const [root] = summary.nodes;
  const kinds: PlanInsightKind[] = [];
  if (root?.actualRows !== null && root?.actualRows !== undefined) {
    kinds.push("estimates");
  }
  if (summary.sharedHitBlocks > 0 || summary.sharedReadBlocks > 0) {
    kinds.push("buffers");
  }
  if (slowestExplainNode(summary)) {
    kinds.push("slowest");
  }
  return kinds;
}

function withOccurrenceKeys(values: string[]) {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const occurrence = (occurrences.get(value) ?? 0) + 1;
    occurrences.set(value, occurrence);
    return { key: `${value}-${occurrence}`, value };
  });
}

function WorkbenchSidebar() {
  const savedQueriesHeadingId = useId();
  const historyHeadingId = useId();
  return (
    <aside className="hidden w-[270px] shrink-0 border-white/10 border-r bg-zinc-950/60 px-3 py-5 text-zinc-400 xl:block">
      <section aria-labelledby={savedQueriesHeadingId} className="space-y-4">
        <h2
          className="font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]"
          id={savedQueriesHeadingId}
        >
          Saved queries
        </h2>
        <p className="text-sm text-zinc-500">No saved queries yet</p>
      </section>
      <section aria-labelledby={historyHeadingId} className="mt-8 space-y-4">
        <h2
          className="font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]"
          id={historyHeadingId}
        >
          History
        </h2>
        <p className="text-sm text-zinc-500">No query history yet</p>
      </section>
    </aside>
  );
}

function GuardPill() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className="h-8 rounded-full border-0 bg-emerald-500/15 px-3 font-medium text-emerald-200 text-sm hover:bg-emerald-500/20"
            type="button"
            variant="ghost"
          >
            <span className="size-1.5 rounded-full bg-yellow-300" />
            read-only guard
            <ChevronDown className="size-3" />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[460px] max-w-[calc(100vw-2rem)] gap-3 border-white/10 bg-zinc-950 p-4 text-zinc-100"
      >
        <PopoverHeader>
          <PopoverTitle>How the guard works</PopoverTitle>
          <PopoverDescription className="text-zinc-400 leading-6">
            The workbench uses a server-side validator before execution, then
            runs approved SQL in a read-only PostgreSQL transaction. Querylane
            never commits a statement from this page.
          </PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-[11px] text-emerald-300 uppercase tracking-[0.18em]">
              Allowed
            </h3>
            <ul className="mt-2 space-y-2">
              {GUARD_ALLOWED.map((item) => (
                <li className="flex gap-2 text-xs leading-5" key={item.what}>
                  <span className="text-emerald-300">✓</span>
                  <span>
                    <span className="font-mono text-zinc-100">{item.what}</span>{" "}
                    <span className="text-zinc-500">{item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-[11px] text-red-300 uppercase tracking-[0.18em]">
              Rejected
            </h3>
            <ul className="mt-2 space-y-2">
              {GUARD_BLOCKED.map((item) => (
                <li className="flex gap-2 text-xs leading-5" key={item.what}>
                  <span className="text-red-300">×</span>
                  <span>
                    <span className="font-mono text-zinc-100">{item.what}</span>{" "}
                    <span className="text-zinc-500">{item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FileTabs() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-zinc-500">
      <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/12 px-3 py-2 font-mono text-sm text-zinc-100">
        <FileText className="size-3.5" />
        query.sql
      </div>
      <Button
        aria-label="Open new SQL tab (coming soon)"
        disabled={true}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function ModeTabs({
  idPrefix,
  mode,
  setMode,
}: {
  idPrefix: string;
  mode: WorkbenchMode;
  setMode: (mode: WorkbenchMode) => void;
}) {
  return (
    <div
      aria-label="Workbench mode"
      className="inline-flex rounded-xl bg-white/12 p-1 text-sm text-zinc-400"
      role="tablist"
    >
      {WORKBENCH_MODE_OPTIONS.map(({ label, value }) => (
        <Button
          aria-controls={`${idPrefix}-${value}-panel`}
          aria-selected={mode === value}
          className={cn(
            "h-8 rounded-lg px-4",
            mode === value ? "bg-zinc-950 text-white shadow" : "text-zinc-400"
          )}
          id={`${idPrefix}-${value}-tab`}
          key={value}
          onClick={() => setMode(value)}
          role="tab"
          type="button"
          variant="ghost"
        >
          {value === "english" ? <Sparkles className="size-4" /> : null}
          {label}
        </Button>
      ))}
    </div>
  );
}

function SqlTextEditor({
  statement,
  setStatement,
}: {
  statement: string;
  setStatement: (statement: string) => void;
}) {
  const isReadOnly = isReadOnlyStatementCandidate(statement);
  return (
    <section
      aria-label="SQL editor"
      className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/30"
    >
      <div className="grid min-h-[210px] grid-cols-[52px_1fr]">
        <div className="border-white/10 border-r bg-zinc-950/20 py-5 text-right font-mono text-sm text-zinc-600 leading-8">
          {EDITOR_LINE_NUMBERS.map((lineNumber) => (
            <div className="pr-4" key={`line-${lineNumber}`}>
              {lineNumber}
            </div>
          ))}
        </div>
        <Textarea
          aria-invalid={!isReadOnly}
          aria-label="SQL statement"
          className="min-h-[210px] resize-none border-0 bg-transparent p-5 font-mono text-base text-zinc-100 leading-8 shadow-none ring-0 placeholder:text-zinc-600 focus-visible:ring-0"
          onChange={(event) => setStatement(event.currentTarget.value)}
          spellCheck={false}
          value={statement}
        />
      </div>
      <div className="flex items-center justify-between border-white/10 border-t px-5 py-3 text-sm text-zinc-500">
        <span>
          {isReadOnly
            ? "Read-only transaction · maximum 1,000 rows · 60 second timeout"
            : "Only read-only SELECT, WITH, VALUES, and SHOW statements can run"}
        </span>
        <span className="font-mono">server-side validation</span>
      </div>
    </section>
  );
}

function VisualBuilderPreview() {
  return (
    <section
      aria-label="Visual query builder preview"
      className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/30"
    >
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-20 font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
            From
          </span>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 font-mono text-zinc-100">
            logistics.shipping.shipments
          </span>
          <span className="text-zinc-500">join:</span>
          <span className="rounded-full bg-zinc-100 px-4 py-2 font-mono text-zinc-950">
            carriers on carrier_id
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
            Columns
          </span>
          {[
            "id",
            "ref",
            "carrier_id",
            "status",
            "origin_port",
            "dest_port",
            "weight_kg",
            "eta",
            "created_at",
          ].map((column) => (
            <span
              className={cn(
                "rounded-full border border-white/10 px-3 py-1.5 font-mono text-sm",
                ["ref", "status", "origin_port", "dest_port", "eta"].includes(
                  column
                )
                  ? "bg-zinc-100 text-zinc-950"
                  : "bg-zinc-950 text-zinc-500"
              )}
              key={column}
            >
              {column}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
            Where
          </span>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 font-mono">
            status
          </span>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 font-mono">
            =
          </span>
          <span className="rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 font-mono text-zinc-100">
            &apos;customs_hold&apos;
          </span>
        </div>
      </div>
      <div className="border-white/10 border-t bg-zinc-950/40 p-5">
        <h3 className="mb-3 font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
          Query pipeline
        </h3>
        <div className="flex flex-wrap items-center gap-4">
          {[
            "From\nshipping.shipments",
            "Join\nshipping.carriers",
            "Filter\nstatus =",
            "Sort\neta ASC",
            "Limit\n50 rows",
          ].map((step, index) => (
            <div
              className={cn(
                "min-w-36 rounded-lg border bg-zinc-950 p-3 font-mono text-sm",
                index === 2
                  ? "border-blue-400 text-blue-300"
                  : "border-white/10 text-zinc-100"
              )}
              key={step}
            >
              {step.split("\n").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorToolbar({
  canRun,
  databaseId,
  instanceId,
  isBusy,
  onExplain,
  onFormat,
  onRun,
}: {
  canRun: boolean;
  databaseId: string;
  instanceId: string;
  isBusy: boolean;
  onExplain: () => void;
  onFormat: () => void;
  onRun: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-b-xl border-white/10 border-t bg-white/12 p-3">
      <Button
        className="h-11 rounded-xl bg-zinc-100 px-5 text-lg text-zinc-950 hover:bg-white"
        disabled={!canRun || isBusy}
        onClick={onRun}
        type="button"
      >
        Run
        <kbd className="ml-2 rounded-md bg-zinc-300 px-2 py-1 text-xs">⌘ ↵</kbd>
      </Button>
      <Button
        className="h-11 rounded-xl bg-zinc-950 px-5 text-lg text-white hover:bg-zinc-900"
        disabled={!canRun || isBusy}
        onClick={onExplain}
        type="button"
      >
        Explain
      </Button>
      <Button
        className="h-11 rounded-xl bg-zinc-950 px-5 text-lg text-white hover:bg-zinc-900"
        onClick={onFormat}
        type="button"
      >
        Format
      </Button>
      <Button
        className="h-11 rounded-xl bg-zinc-950 px-5 text-lg text-white hover:bg-zinc-900"
        disabled={true}
        type="button"
      >
        Save query
      </Button>
      <div className="h-8 w-px bg-white/10" />
      <span className="font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.18em]">
        Engine
      </span>
      <span className="inline-flex rounded-lg bg-zinc-950 p-1 text-sm">
        <span className="rounded-md bg-zinc-800 px-3 py-1 text-white">
          postgres
        </span>
        <span className="px-3 py-1 text-zinc-500">duckdb</span>
      </span>
      <span className="ml-auto hidden font-mono text-zinc-500 md:inline">
        Ln 1, Col 1 · {instanceId} / {databaseId} · read-only
      </span>
    </div>
  );
}

function ResultsTable({
  result,
  statement,
}: {
  result: ExecuteQueryTableState | null;
  statement: string;
}) {
  if (!result) {
    return (
      <section className="rounded-xl border border-white/10 bg-zinc-900/80 px-6 py-14 text-center">
        <h2 className="font-semibold text-zinc-100">
          Run a read-only query to see results
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Querylane returns at most 1,000 rows and never commits database
          changes.
        </p>
      </section>
    );
  }

  const columns = withOccurrenceKeys(
    result.columns.map((column) => column.columnName)
  );
  const notices = withOccurrenceKeys(result.notices);
  const rows = result.rows.map((row, index) => ({
    key: row.rowKey || String(index),
    values: row.values.map((cell) => formatCellValue(cell)),
  }));
  const rowCount = result.stats?.rowCount ?? BigInt(rows.length);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80">
      <div className="flex items-center justify-between gap-4 border-white/10 border-b px-4 py-3 font-mono text-sm text-zinc-400">
        <output aria-label="Executed statement" className="min-w-0 truncate">
          <span className="text-emerald-400">●</span>{" "}
          {statement.replace(/\s+/g, " ").trim()}
        </output>
        <span className="shrink-0">
          {rowCount.toLocaleString()} rows ·{" "}
          {formatDurationMs(result.stats?.latency)}
        </span>
      </div>
      {result.stats?.truncated ? (
        <p className="border-amber-400/20 border-b bg-amber-400/10 px-4 py-2 text-amber-200 text-sm">
          Results limited to {rowCount.toLocaleString()} rows
        </p>
      ) : null}
      {result.notices.length > 0 ? (
        <ul className="border-white/10 border-b bg-white/5 px-4 py-2 text-sm text-zinc-300">
          {notices.map((notice) => (
            <li key={notice.key}>{notice.value}</li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-auto">
        <table className="w-full min-w-[760px] text-left font-mono text-sm">
          <thead className="bg-white/5 text-zinc-200">
            <tr>
              {columns.map((column) => (
                <th
                  className="px-4 py-3 font-semibold"
                  key={column.key}
                  scope="col"
                >
                  {column.value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-200">
            {rows.map((row) => (
              <tr key={row.key}>
                {columns.map((column, cellIndex) => (
                  <td className="px-4 py-3" key={column.key}>
                    {row.values[cellIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPlanMs(value: number | null): string {
  if (value === null) {
    return "—";
  }

  const formatter =
    value < 10 ? SMALL_PLAN_MS_FORMATTER : LARGE_PLAN_MS_FORMATTER;
  return `${formatter.format(value)} ms`;
}

function slowestExplainNode(
  summary: ExplainPlanSummary
): ExplainPlanNode | null {
  let slowest: ExplainPlanNode | null = null;
  for (const node of summary.nodes) {
    if (
      node.exclusiveTimeMs !== null &&
      (slowest?.exclusiveTimeMs === null ||
        slowest?.exclusiveTimeMs === undefined ||
        node.exclusiveTimeMs > slowest.exclusiveTimeMs)
    ) {
      slowest = node;
    }
  }
  return slowest;
}

function MetricCards({
  explain,
  summary,
}: {
  explain: ExplainQueryResponse;
  summary: ExplainPlanSummary;
}) {
  const root = summary.nodes[0] ?? null;
  const slowest = slowestExplainNode(summary);
  const totalBuffers = summary.sharedHitBlocks + summary.sharedReadBlocks;
  const cards: [string, string, string][] = [
    [
      "Execution",
      summary.executionTimeMs === null
        ? formatDurationMs(explain.latency)
        : formatPlanMs(summary.executionTimeMs),
      "live EXPLAIN ANALYZE",
    ],
    [
      "Planning",
      formatPlanMs(summary.planningTimeMs),
      "reported by PostgreSQL",
    ],
    [
      "Slowest node",
      slowest ? `#${slowest.id} ${slowest.label}` : "—",
      slowest ? formatPlanMs(slowest.exclusiveTimeMs) : "No timed nodes",
    ],
    [
      "Rows returned",
      root?.actualRows?.toLocaleString() ?? "—",
      root
        ? `${root.estimatedRows.toLocaleString()} planned`
        : "No row estimate",
    ],
    [
      "Buffers",
      totalBuffers.toLocaleString(),
      `${summary.sharedReadBlocks.toLocaleString()} read from disk`,
    ],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([label, value, detail]) => (
        <div
          className="min-w-0 rounded-xl border border-white/10 bg-zinc-900/90 p-4"
          key={label}
        >
          <p className="font-semibold text-[11px] text-zinc-500 uppercase tracking-[0.14em]">
            {label}
          </p>
          <p className="mt-1 truncate font-bold font-mono text-xl text-zinc-100">
            {value}
          </p>
          <p
            className={cn(
              "text-sm",
              detail.includes("disk") && summary.sharedReadBlocks > 0
                ? "text-amber-300"
                : "text-zinc-400"
            )}
          >
            {detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExplainControls({
  insightCount,
  insightsOpen,
  onToggleInsights,
  setView,
  view,
}: {
  insightCount: number;
  insightsOpen: boolean;
  onToggleInsights: () => void;
  setView: (view: ExplainView) => void;
  view: ExplainView;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-xl bg-white/12 p-1 text-sm text-zinc-400">
        {[
          ["graph", "Graph"],
          ["timeline", "Timeline"],
          ["table", "Table"],
          ["text", "Text"],
        ].map(([value, label]) => (
          <Button
            className={cn(
              "h-8 rounded-lg px-4",
              view === value ? "bg-zinc-950 text-white" : "text-zinc-400"
            )}
            key={value}
            onClick={() => setView(value as ExplainView)}
            type="button"
            variant="ghost"
          >
            {label}
          </Button>
        ))}
      </div>
      <Button
        aria-pressed={insightsOpen}
        className="rounded-full border-white/10 bg-white/5"
        disabled={insightCount === 0}
        onClick={onToggleInsights}
        type="button"
        variant="outline"
      >
        <Lightbulb className="size-4" />
        Insights {insightCount}
      </Button>
    </div>
  );
}

function EstimateInsight({ root }: { root: ExplainPlanNode }) {
  const estimateDelta =
    root.actualRows === null
      ? null
      : Math.abs(root.actualRows - root.estimatedRows);
  const estimatePercent =
    estimateDelta !== null && root.estimatedRows > 0
      ? Math.round((estimateDelta / root.estimatedRows) * PERCENT)
      : null;
  const estimatesHealthy =
    estimatePercent !== null &&
    estimatePercent <= HEALTHY_ESTIMATE_DELTA_PERCENT;

  return (
    <article className="px-5 py-4">
      <p className="font-semibold text-zinc-100">
        <span
          className={cn(
            "mr-2",
            estimatesHealthy ? "text-emerald-400" : "text-amber-300"
          )}
        >
          ●
        </span>
        {estimatesHealthy ? "Estimates are healthy" : "Check row estimates"}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        Actual {root.actualRows?.toLocaleString() ?? "—"} rows vs{" "}
        {root.estimatedRows.toLocaleString()} planned (
        {estimatePercent?.toLocaleString() ?? "—"}% off).
      </p>
    </article>
  );
}

function BufferInsight({ summary }: { summary: ExplainPlanSummary }) {
  return (
    <article className="px-5 py-4">
      <p className="font-semibold text-zinc-100">
        <span
          className={cn(
            "mr-2",
            summary.sharedReadBlocks > 0 ? "text-amber-300" : "text-emerald-400"
          )}
        >
          ●
        </span>
        {summary.sharedReadBlocks.toLocaleString()} buffers read from disk
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        PostgreSQL reported {summary.sharedHitBlocks.toLocaleString()} shared
        buffer hits and {summary.sharedReadBlocks.toLocaleString()} reads.
      </p>
    </article>
  );
}

function SlowestNodeInsight({ node }: { node: ExplainPlanNode }) {
  return (
    <article className="px-5 py-4">
      <p className="font-semibold text-zinc-100">
        <span className="mr-2 text-blue-400">●</span>
        Slowest node: {node.label}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        PostgreSQL reported {formatPlanMs(node.exclusiveTimeMs)} of its own
        execution time for this node.
      </p>
    </article>
  );
}

function PlanInsights({
  kinds,
  onDismiss,
  summary,
}: {
  kinds: PlanInsightKind[];
  onDismiss: () => void;
  summary: ExplainPlanSummary;
}) {
  const [root] = summary.nodes;
  const slowest = slowestExplainNode(summary);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/90">
      <div className="flex items-center justify-between border-white/10 border-b px-5 py-4">
        <h3 className="font-semibold text-zinc-100">
          Plan insights{" "}
          <span className="ml-2 font-normal text-sm text-zinc-500">
            derived from this read-only EXPLAIN
          </span>
        </h3>
        <Button
          aria-label="Dismiss plan insights"
          onClick={onDismiss}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          ×
        </Button>
      </div>
      <div className="divide-y divide-white/10">
        {kinds.includes("estimates") && root ? (
          <EstimateInsight root={root} />
        ) : null}
        {kinds.includes("buffers") ? <BufferInsight summary={summary} /> : null}
        {kinds.includes("slowest") && slowest ? (
          <SlowestNodeInsight node={slowest} />
        ) : null}
      </div>
    </section>
  );
}

function nodePercent(node: ExplainPlanNode, maxTimeMs: number): number {
  if (node.exclusiveTimeMs === null || maxTimeMs <= 0) {
    return 0;
  }
  return Math.max(
    MINIMUM_NODE_BAR_PERCENT,
    Math.round((node.exclusiveTimeMs / maxTimeMs) * PERCENT)
  );
}

function ExplainGraph({ summary }: { summary: ExplainPlanSummary }) {
  const slowest = slowestExplainNode(summary);
  const maxTimeMs = slowest?.exclusiveTimeMs ?? 0;

  return (
    <div className="min-h-[540px] overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-8 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:24px_24px]">
      <div className="mx-auto grid max-w-4xl gap-4">
        {summary.nodes.map((node) => {
          const offset =
            Math.min(node.depth, MAX_GRAPH_DEPTH) * GRAPH_DEPTH_OFFSET_PX;
          return (
            <article
              className={cn(
                "rounded-xl border bg-zinc-950 p-4 shadow-2xl",
                node.id === slowest?.id
                  ? "border-orange-400 shadow-[0_0_0_2px_rgba(251,146,60,0.2)]"
                  : "border-white/15"
              )}
              key={node.id}
              style={{
                marginLeft: offset,
                width: `calc(100% - ${offset}px)`,
              }}
            >
              <div className="flex justify-between gap-4 font-mono">
                <span>
                  #{node.id} <b>{node.label}</b>
                </span>
                <span>{formatPlanMs(node.exclusiveTimeMs)}</span>
              </div>
              <p className="mt-2 font-mono text-zinc-400">
                rows={node.actualRows?.toLocaleString() ?? "—"} /{" "}
                {node.estimatedRows.toLocaleString()} · loops=
                {node.loops?.toLocaleString() ?? "—"}
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-zinc-700">
                <div
                  className={cn(
                    "h-full rounded-full",
                    node.id === slowest?.id ? "bg-amber-300" : "bg-zinc-400"
                  )}
                  style={{ width: `${nodePercent(node, maxTimeMs)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ExplainTimeline({ summary }: { summary: ExplainPlanSummary }) {
  const maxTimeMs = slowestExplainNode(summary)?.exclusiveTimeMs ?? 0;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950 p-5">
      <div className="grid gap-4">
        {summary.nodes.map((node) => (
          <div
            className="grid items-center gap-3 md:grid-cols-[minmax(220px,1fr)_3fr_90px]"
            key={node.id}
          >
            <span className="truncate font-mono text-sm text-zinc-200">
              #{node.id} {node.label}
            </span>
            <div className="h-3 rounded-full bg-zinc-800">
              <div
                aria-label={`${node.label} took ${formatPlanMs(node.exclusiveTimeMs)} of its own time`}
                className="h-full rounded-full bg-blue-400"
                role="img"
                style={{ width: `${nodePercent(node, maxTimeMs)}%` }}
              />
            </div>
            <span className="text-right font-mono text-sm text-zinc-400">
              {formatPlanMs(node.exclusiveTimeMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplainTable({ summary }: { summary: ExplainPlanSummary }) {
  return (
    <div className="overflow-auto rounded-xl border border-white/10 bg-zinc-950">
      <table className="w-full min-w-[880px] text-left font-mono text-sm">
        <thead className="text-zinc-500 uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3" scope="col">
              #
            </th>
            <th className="px-4 py-3" scope="col">
              Node
            </th>
            <th className="px-4 py-3 text-right" scope="col">
              Own time
            </th>
            <th className="px-4 py-3 text-right" scope="col">
              Rows act / est
            </th>
            <th className="px-4 py-3 text-right" scope="col">
              Loops
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {summary.nodes.map((node) => (
            <tr key={node.id}>
              <td className="px-4 py-3 text-zinc-500">#{node.id}</td>
              <td className="px-4 py-3 text-zinc-100">{node.label}</td>
              <td className="px-4 py-3 text-right text-zinc-100">
                {formatPlanMs(node.exclusiveTimeMs)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-100">
                {node.actualRows?.toLocaleString() ?? "—"} /{" "}
                {node.estimatedRows.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {node.loops?.toLocaleString() ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExplainText({ explain }: { explain: ExplainQueryResponse }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(explain.plan);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function copyLabel() {
    switch (copyStatus) {
      case "copied":
        return "Copied";
      case "failed":
        return "Copy failed";
      case "idle":
        return "Copy";
      default:
        return assertNever(copyStatus);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/90">
      <div className="flex items-center justify-between border-white/10 border-b px-5 py-4">
        <h3 className="font-semibold text-zinc-100">
          EXPLAIN (ANALYZE, BUFFERS){" "}
          <span className="ml-2 font-normal text-sm text-zinc-500">
            text format: paste anywhere
          </span>
        </h3>
        <Button onClick={copyPlan} size="sm" type="button" variant="secondary">
          <Copy className="size-4" />
          {copyLabel()}
        </Button>
      </div>
      <pre className="max-h-[560px] overflow-auto p-5 font-mono text-sm text-zinc-300 leading-7">
        <code>{explain.plan}</code>
      </pre>
    </section>
  );
}

function ExplainPanel({
  explain,
  summary,
  view,
}: {
  explain: ExplainQueryResponse;
  summary: ExplainPlanSummary;
  view: ExplainView;
}) {
  if (view !== "text" && summary.nodes.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-zinc-900/80 px-6 py-14 text-center">
        <h3 className="font-semibold text-zinc-100">
          PostgreSQL returned no structured plan nodes
        </h3>
        <p className="mt-2 text-sm text-zinc-500">
          Open Text to inspect the raw EXPLAIN response.
        </p>
      </section>
    );
  }

  switch (view) {
    case "graph":
      return <ExplainGraph summary={summary} />;
    case "timeline":
      return <ExplainTimeline summary={summary} />;
    case "table":
      return <ExplainTable summary={summary} />;
    case "text":
      return <ExplainText explain={explain} />;
    default:
      return assertNever(view);
  }
}

function WorkbenchOutput({
  explainResult,
  explainSummary,
  explainView,
  insightKinds,
  insightsOpen,
  onDismissInsights,
  queryResult,
  resultTab,
  statement,
}: {
  explainResult: ExplainQueryResponse | null;
  explainSummary: ExplainPlanSummary;
  explainView: ExplainView;
  insightKinds: PlanInsightKind[];
  insightsOpen: boolean;
  onDismissInsights: () => void;
  queryResult: ExecuteQueryTableState | null;
  resultTab: ResultTab;
  statement: string;
}) {
  if (resultTab === "results") {
    return <ResultsTable result={queryResult} statement={statement} />;
  }
  if (!explainResult) {
    return (
      <section className="rounded-xl border border-white/10 bg-zinc-900/80 px-6 py-14 text-center">
        <h2 className="font-semibold text-zinc-100">
          Explain a read-only query to inspect its plan
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          Querylane runs EXPLAIN ANALYZE inside a read-only transaction.
        </p>
      </section>
    );
  }
  return (
    <div className="grid gap-5">
      <MetricCards explain={explainResult} summary={explainSummary} />
      {insightsOpen && insightKinds.length > 0 ? (
        <PlanInsights
          kinds={insightKinds}
          onDismiss={onDismissInsights}
          summary={explainSummary}
        />
      ) : null}
      <ExplainPanel
        explain={explainResult}
        summary={explainSummary}
        view={explainView}
      />
    </div>
  );
}

export function SqlWorkbenchPage({
  databaseId,
  instanceId,
}: SqlWorkbenchPageProps) {
  const parent = buildWorkbenchParent({ databaseId, instanceId });
  const modeId = useId();
  const [mode, setMode] = useState<WorkbenchMode>("editor");
  const [statement, setStatement] = useState(DEFAULT_SQL);
  const [resultTab, setResultTab] = useState<ResultTab>("results");
  const [explainView, setExplainView] = useState<ExplainView>("graph");
  const [queryResult, setQueryResult] = useState<ExecuteQueryTableState | null>(
    null
  );
  const [executedStatement, setExecutedStatement] = useState("");
  const [explainResult, setExplainResult] =
    useState<ExplainQueryResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const canRun = mode === "editor" && isReadOnlyStatementCandidate(statement);
  const explainSummary = parseExplainTextPlan(explainResult?.plan ?? "");
  const insightKinds = planInsightKinds(explainSummary);

  async function runQuery() {
    if (!canRun) {
      return;
    }
    setIsBusy(true);
    setError(null);
    const submittedStatement = statement;
    try {
      const stream = executeWorkbenchQuery({
        batchSize: 250,
        parent,
        rowLimit: 1000,
        statement: submittedStatement,
      });
      setQueryResult(await collectExecuteQueryStream(stream));
      setExecutedStatement(submittedStatement);
      setResultTab("results");
    } catch (caught) {
      setError(caught);
    } finally {
      setIsBusy(false);
    }
  }

  async function explainQuery() {
    if (!canRun) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const response = await explainWorkbenchQuery({
        analyze: true,
        buffers: true,
        format: ExplainQueryRequest_Format.TEXT,
        parent,
        statement,
      });
      setExplainResult(response);
      setInsightsOpen(true);
      setResultTab("explain");
    } catch (caught) {
      setError(caught);
    } finally {
      setIsBusy(false);
    }
  }

  function formatStatement() {
    setStatement(statement.trim());
  }

  return (
    <div className="dark flex h-full min-h-0 bg-[#050506] text-zinc-100">
      <WorkbenchSidebar />
      <section
        aria-label="SQL workbench content"
        className="min-w-0 flex-1 overflow-auto"
      >
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h1 className="font-semibold text-2xl tracking-tight">
                SQL workbench
              </h1>
              <GuardPill />
            </div>
            <div className="flex items-center gap-4">
              <ModeTabs idPrefix={modeId} mode={mode} setMode={setMode} />
              <Button
                aria-label="Enter full screen (coming soon)"
                disabled={true}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Maximize2 className="size-5" />
              </Button>
            </div>
          </header>

          <FileTabs />

          {mode === "builder" ? (
            <section
              aria-labelledby={`${modeId}-builder-tab`}
              id={`${modeId}-builder-panel`}
              role="tabpanel"
            >
              <VisualBuilderPreview />
            </section>
          ) : null}
          {mode === "english" ? (
            <section
              aria-labelledby={`${modeId}-english-tab`}
              className="rounded-xl border border-white/10 bg-zinc-900/80 p-5"
              id={`${modeId}-english-panel`}
              role="tabpanel"
            >
              <div className="flex items-center gap-3 text-lg text-zinc-500">
                <Sparkles className="size-5 text-blue-400" />
                Describe what you want to see, for example, shipments held in
                customs arriving this month
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-zinc-500 uppercase tracking-wider">
                  Try
                </span>
                {[
                  "shipments held in customs arriving this month",
                  "top 5 carriers by shipment count",
                  "how many overdue shipments",
                  "unpaid invoices over 20k, newest first",
                ].map((suggestion) => (
                  <span
                    className="rounded-full bg-zinc-950 px-3 py-1.5 text-zinc-400"
                    key={suggestion}
                  >
                    {suggestion}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          {mode === "editor" ? (
            <div
              aria-labelledby={`${modeId}-editor-tab`}
              id={`${modeId}-editor-panel`}
              role="tabpanel"
            >
              <SqlTextEditor
                setStatement={setStatement}
                statement={statement}
              />
            </div>
          ) : null}

          <EditorToolbar
            canRun={canRun}
            databaseId={databaseId}
            instanceId={instanceId}
            isBusy={isBusy}
            onExplain={explainQuery}
            onFormat={formatStatement}
            onRun={runQuery}
          />

          {error ? (
            <AppInlineError
              error={normalizeAppUiError(error, {
                area: "sql-workbench",
                surface: "route",
              })}
              onRetry={resultTab === "explain" ? explainQuery : runQuery}
            />
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-4 border-white/10 border-b">
            <Tabs
              onValueChange={(value) => setResultTab(value as ResultTab)}
              value={resultTab}
            >
              <TabsList className="bg-transparent" variant="line">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="explain">Explain</TabsTrigger>
              </TabsList>
              <TabsContent value="results" />
              <TabsContent value="explain" />
            </Tabs>
            <div className="flex items-center gap-4 pb-2">
              <span className="font-mono text-zinc-500">
                planning {formatPlanMs(explainSummary.planningTimeMs)} ·
                execution{" "}
                {resultTab === "results"
                  ? formatDurationMs(queryResult?.stats?.latency)
                  : formatPlanMs(explainSummary.executionTimeMs)}
              </span>
              {resultTab === "explain" && explainResult ? (
                <ExplainControls
                  insightCount={insightKinds.length}
                  insightsOpen={insightsOpen}
                  onToggleInsights={() => setInsightsOpen(!insightsOpen)}
                  setView={setExplainView}
                  view={explainView}
                />
              ) : null}
            </div>
          </div>

          <WorkbenchOutput
            explainResult={explainResult}
            explainSummary={explainSummary}
            explainView={explainView}
            insightKinds={insightKinds}
            insightsOpen={insightsOpen}
            onDismissInsights={() => setInsightsOpen(false)}
            queryResult={queryResult}
            resultTab={resultTab}
            statement={executedStatement}
          />
        </div>
      </section>
    </div>
  );
}
