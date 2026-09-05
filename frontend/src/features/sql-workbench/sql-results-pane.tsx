"use client";

import {
  AlertTriangle,
  Ban,
  Download,
  Loader2,
  MessageSquareText,
  Table2,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";
import { AppInlineError } from "@/components/app-error-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildExport,
  type ExportFormat,
} from "@/features/data-explorer/table-data/selection-formatters";
import { ExplainPlanView } from "@/features/sql-workbench/explain-plan-view";
import { SqlResultsGrid } from "@/features/sql-workbench/sql-results-grid";
import {
  parseResultsTab,
  type ResultsTab,
} from "@/features/sql-workbench/sql-results-tab";
import {
  formatCount,
  formatDurationMs,
  formatRowCount,
} from "@/features/sql-workbench/sql-workbench-format";
import type {
  SqlExecution,
  SqlExplain,
} from "@/features/sql-workbench/use-sql-execution";
import { downloadBlob } from "@/lib/download-blob";
import { cn } from "@/lib/utils";

const EXPORT_RESOURCE_NAME =
  "instances/workbench/databases/workbench/schemas/workbench/tables/query_result";

function ResultsPlaceholder({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof Table2;
  title: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Icon aria-hidden="true" className="size-6 text-muted-foreground/60" />
      <p className="font-medium text-sm">{title}</p>
      <p className="max-w-md text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function elapsedMs(execution: SqlExecution): number {
  if (execution.stats) {
    return execution.stats.latencyMs;
  }
  return execution.finishedAt ? execution.finishedAt - execution.startedAt : 0;
}

function RunningStatus({ execution }: { execution: SqlExecution }) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      Running…
      {execution.rows.length > 0
        ? ` ${formatCount(execution.rows.length)} rows so far`
        : null}
    </span>
  );
}

function SuccessStatus({ execution }: { execution: SqlExecution }) {
  const rowCount = execution.stats?.rowCount ?? execution.rows.length;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-medium">{formatRowCount(rowCount)}</span>
      <span className="text-muted-foreground">
        {formatDurationMs(elapsedMs(execution))}
      </span>
      {execution.stats?.truncated ? (
        <span className="flex items-center gap-1 text-chart-4">
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          Stopped at the {formatCount(execution.rowLimit)} row limit
        </span>
      ) : null}
    </span>
  );
}

function CancelledStatus({ execution }: { execution: SqlExecution }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Ban aria-hidden="true" className="size-3.5" />
      Cancelled after {formatDurationMs(elapsedMs(execution))}
      {execution.rows.length > 0
        ? ` · ${formatRowCount(execution.rows.length)} received`
        : ""}
    </span>
  );
}

function ExecutionStatusLine({ execution }: { execution: SqlExecution }) {
  switch (execution.status) {
    case "running":
      return <RunningStatus execution={execution} />;
    case "success":
      return <SuccessStatus execution={execution} />;
    case "cancelled":
      return <CancelledStatus execution={execution} />;
    case "error":
      return (
        <span className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          {execution.error?.title ?? "Query failed"}
        </span>
      );
    default:
      return null;
  }
}

function exportExecution(execution: SqlExecution, exportFormat: ExportFormat) {
  const result = buildExport({
    columns: execution.columns,
    exportFormat,
    resourceName: EXPORT_RESOURCE_NAME,
    rows: execution.rows.map((row) => ({
      cells: new Map(
        execution.columns.map((column, index) => [
          column.columnName,
          row.values[index],
        ])
      ),
    })),
  });
  if (!result.ok) {
    toast.error("Export skipped", {
      description: `${formatCount(result.truncatedRowCount)} rows contain values the server shortened for display. Narrow the query to export them intact.`,
    });
    return;
  }
  downloadBlob(
    result.payload.filename,
    result.payload.contents,
    result.payload.mimeType
  );
}

function ExportMenu({ execution }: { execution: SqlExecution }) {
  const disabled =
    execution.status !== "success" || execution.rows.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button disabled={disabled} size="xs" type="button" variant="ghost">
            <Download aria-hidden="true" className="size-3.5" />
            Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportExecution(execution, "csv")}>
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportExecution(execution, "json")}>
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportExecution(execution, "sql")}>
          SQL inserts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResultsBody({
  execution,
  onRetry,
}: {
  execution: SqlExecution | undefined;
  onRetry: () => Promise<unknown> | undefined;
}) {
  if (!execution) {
    return (
      <ResultsPlaceholder
        description="Write a statement above and press ⌘/Ctrl + Enter. Results appear here, capped at the row limit."
        icon={Table2}
        title="No results yet"
      />
    );
  }
  if (execution.status === "error" && execution.error) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <AppInlineError error={execution.error} onRetry={onRetry} />
      </div>
    );
  }
  if (execution.columns.length > 0) {
    return <SqlResultsGrid columns={execution.columns} rows={execution.rows} />;
  }
  if (execution.status === "running") {
    return (
      <ResultsPlaceholder
        description="Waiting for the first rows from PostgreSQL."
        icon={Loader2}
        title="Running"
      />
    );
  }
  if (execution.status === "cancelled") {
    return (
      <ResultsPlaceholder
        description="The statement was cancelled before PostgreSQL returned any rows."
        icon={Ban}
        title="Cancelled"
      />
    );
  }
  return (
    <ResultsPlaceholder
      description="The statement completed without returning columns."
      icon={Table2}
      title="No result set"
    />
  );
}

function keyedNotices(notices: string[]): Array<{ key: string; text: string }> {
  const seen = new Map<string, number>();
  return notices.map((text) => {
    const occurrence = seen.get(text) ?? 0;
    seen.set(text, occurrence + 1);
    return { key: `${occurrence}:${text}`, text };
  });
}

function MessagesBody({
  execution,
  explain,
}: {
  execution: SqlExecution | undefined;
  explain: SqlExplain | undefined;
}) {
  const notices = keyedNotices([
    ...(execution?.notices ?? []),
    ...(explain?.notices ?? []),
  ]);
  if (notices.length === 0) {
    return (
      <ResultsPlaceholder
        description="RAISE NOTICE output and other server messages from the last run show up here."
        icon={MessageSquareText}
        title="No messages"
      />
    );
  }
  return (
    <ol className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
      {notices.map((notice) => (
        <li
          className="border-border border-b py-1.5 last:border-b-0"
          key={notice.key}
        >
          {notice.text}
        </li>
      ))}
    </ol>
  );
}

function PlanBody({ explain }: { explain: SqlExplain | undefined }) {
  if (!explain) {
    return (
      <ResultsPlaceholder
        description="Use Explain to see how PostgreSQL will run the statement, or Explain analyze to run it and measure each step."
        icon={Waypoints}
        title="No plan yet"
      />
    );
  }
  if (explain.status === "running") {
    return (
      <ResultsPlaceholder
        description={
          explain.analyze
            ? "Running the statement to measure the plan."
            : "Asking PostgreSQL for the plan."
        }
        icon={Loader2}
        title="Explaining"
      />
    );
  }
  if (explain.status === "error" && explain.error) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <AppInlineError error={explain.error} />
      </div>
    );
  }
  return (
    <ExplainPlanView
      analyze={explain.analyze}
      plan={explain.plan}
      rawPlan={explain.rawPlan ?? ""}
    />
  );
}

function CountPill({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums">
      {count}
    </span>
  );
}

function SqlResultsPane({
  activeTab,
  execution,
  explain,
  onRetry,
  onTabChange,
}: {
  activeTab: ResultsTab;
  execution: SqlExecution | undefined;
  explain: SqlExplain | undefined;
  onRetry: () => Promise<unknown> | undefined;
  onTabChange: (tab: ResultsTab) => void;
}) {
  const messageCount =
    (execution?.notices.length ?? 0) + (explain?.notices.length ?? 0);
  return (
    <section
      aria-label="Query output"
      className="flex min-h-0 flex-1 flex-col bg-background"
    >
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-border border-b px-2">
        <Tabs
          onValueChange={(value) => onTabChange(parseResultsTab(value))}
          value={activeTab}
        >
          <TabsList className="h-8 bg-transparent p-0" variant="line">
            <TabsTrigger className="h-8 gap-1.5 px-2.5 text-xs" value="results">
              <Table2 aria-hidden="true" className="size-3.5" />
              Results
            </TabsTrigger>
            <TabsTrigger
              className="h-8 gap-1.5 px-2.5 text-xs"
              value="messages"
            >
              <MessageSquareText aria-hidden="true" className="size-3.5" />
              Messages
              <CountPill count={messageCount} />
            </TabsTrigger>
            <TabsTrigger className="h-8 gap-1.5 px-2.5 text-xs" value="plan">
              <Waypoints aria-hidden="true" className="size-3.5" />
              Plan
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3 pr-1 text-xs">
          {execution ? <ExecutionStatusLine execution={execution} /> : null}
          {execution ? <ExportMenu execution={execution} /> : null}
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          activeTab !== "results" && "hidden"
        )}
      >
        <ResultsBody execution={execution} onRetry={onRetry} />
      </div>
      {activeTab === "messages" ? (
        <MessagesBody execution={execution} explain={explain} />
      ) : null}
      {activeTab === "plan" ? <PlanBody explain={explain} /> : null}
    </section>
  );
}

export { SqlResultsPane };
