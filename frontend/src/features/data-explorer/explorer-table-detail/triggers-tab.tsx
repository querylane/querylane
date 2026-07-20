import { useEffect, useState } from "react";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import { RefreshControl } from "@/components/ui/refresh-control";
import { SqlSyntaxHighlight } from "@/components/ui/sql-code-block";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  isTriggerStateFilter,
  PILL_TONE_CLASSES,
  presentTriggerStateOptions,
} from "@/features/data-explorer/explorer-table-detail/options";
import {
  FacetFilterBar,
  TabError,
  TableResourceEmptyState,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { filterTableTriggers } from "@/features/data-explorer/explorer-table-detail-filters";
import type { useListTableTriggersQuery } from "@/hooks/api/table";
import {
  PAGE_SIZE_OPTIONS,
  pageIndexForPageSizeChange,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { TableTrigger } from "@/protogen/querylane/console/v1alpha1/table_pb";

const TRIGGER_PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
const [DEFAULT_TRIGGER_PAGE_SIZE] = TRIGGER_PAGE_SIZE_OPTIONS;
const SIMPLE_SQL_IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const CREATE_TRIGGER_RE = /^CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/i;
const EXECUTE_FUNCTION_RE = /EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([^;]+);?$/i;
const EXECUTE_FUNCTION_PREFIX_RE = /^EXECUTE\s+(?:FUNCTION|PROCEDURE)\b/i;
const TRIGGER_SQL_FOR_EACH_RE = /\s+FOR\s+EACH\s+/i;
const TRIGGER_SCOPE_RE = /FOR\s+EACH\s+(ROW|STATEMENT)\b/i;
const TRIGGER_WHEN_RE =
  /\bWHEN\s*\(([\s\S]+)\)\s+EXECUTE\s+(?:FUNCTION|PROCEDURE)\b/i;
const TRIGGER_SQL_COPY_FEEDBACK_MS = 1500;

/** Leaves simple names bare to mirror pg_get_triggerdef output. */
function formatTriggerSqlIdentifier(identifier: string) {
  if (SIMPLE_SQL_IDENTIFIER_RE.test(identifier)) {
    return identifier;
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatTriggerTableName(schemaName: string, tableName: string) {
  return `${formatTriggerSqlIdentifier(schemaName)}.${formatTriggerSqlIdentifier(
    tableName
  )}`;
}

function ensureSqlTerminator(sql: string) {
  const trimmed = sql.trim();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

function formatTriggerFunctionCall(trigger: TableTrigger) {
  const definition = trigger.definition.trim();
  if (EXECUTE_FUNCTION_PREFIX_RE.test(definition)) {
    return ensureSqlTerminator(definition).slice(0, -1);
  }
  if (!trigger.functionName) {
    return "EXECUTE FUNCTION unknown_trigger_function()";
  }
  const functionName = trigger.functionName.includes("(")
    ? trigger.functionName
    : `${trigger.functionName}()`;
  return `EXECUTE FUNCTION ${functionName}`;
}

function formatTriggerSql({
  schemaName,
  tableName,
  trigger,
}: {
  schemaName: string;
  tableName: string;
  trigger: TableTrigger;
}) {
  if (CREATE_TRIGGER_RE.test(trigger.definition.trim())) {
    return ensureSqlTerminator(trigger.definition);
  }
  const events =
    trigger.events.length > 0 ? trigger.events.join(" OR ") : "UPDATE";
  const timing = trigger.timing || "AFTER";
  const tableLabel = formatTriggerTableName(schemaName, tableName);
  return ensureSqlTerminator(
    `CREATE TRIGGER ${formatTriggerSqlIdentifier(
      trigger.triggerName
    )} ${timing} ${events} ON ${tableLabel} FOR EACH ROW ${formatTriggerFunctionCall(
      trigger
    )}`
  );
}

function formatTriggerSqlForDisplay(sql: string) {
  return ensureSqlTerminator(sql).replace(
    TRIGGER_SQL_FOR_EACH_RE,
    "\n  FOR EACH "
  );
}

function triggerFunctionLabel(trigger: TableTrigger) {
  const match = trigger.definition.trim().match(EXECUTE_FUNCTION_RE);
  if (match?.[1]) {
    return `→ ${match[1].trim()}`;
  }
  if (!trigger.functionName) {
    return "→ unknown_trigger_function()";
  }
  const functionName = trigger.functionName.includes("(")
    ? trigger.functionName
    : `${trigger.functionName}()`;
  return `→ ${functionName}`;
}

function triggerEventsLabel(trigger: TableTrigger) {
  const events = trigger.events.filter(Boolean);
  return events.length > 0 ? events.join(" OR ") : "UPDATE";
}

function triggerLevelLabel(trigger: TableTrigger) {
  const match = trigger.definition.match(TRIGGER_SCOPE_RE);
  if (!match?.[1]) {
    return "ROW";
  }
  return match[1].toUpperCase();
}

function triggerWhenExpression(trigger: TableTrigger) {
  const match = trigger.definition.match(TRIGGER_WHEN_RE);
  return match?.[1]?.trim() ?? "";
}

function TriggerSqlCopyButton({
  sql,
  triggerName,
}: {
  sql: string;
  triggerName: string;
}) {
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">(
    "idle"
  );

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timeout = window.setTimeout(function resetTriggerSqlCopyState() {
      setCopyState("idle");
    }, TRIGGER_SQL_COPY_FEEDBACK_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyState]);

  async function handleCopyTriggerSql() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  let buttonLabel = "Copy";
  if (copyState === "copied") {
    buttonLabel = "Copied";
  } else if (copyState === "error") {
    buttonLabel = "Copy failed";
  }
  let statusMessage = "";
  if (copyState === "copied") {
    statusMessage = `SQL for ${triggerName} copied.`;
  } else if (copyState === "error") {
    statusMessage = `Could not copy SQL for ${triggerName}.`;
  }

  return (
    <>
      <Button
        aria-label={`Copy SQL for ${triggerName}`}
        className="h-6 px-2 text-xs"
        onClick={handleCopyTriggerSql}
        size="xs"
        type="button"
        variant="ghost"
      >
        {buttonLabel}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {statusMessage}
      </span>
    </>
  );
}

function TriggerCard({
  schemaName,
  tableName,
  trigger,
}: {
  schemaName: string;
  tableName: string;
  trigger: TableTrigger;
}) {
  const sql = formatTriggerSql({ schemaName, tableName, trigger });
  const whenExpression = triggerWhenExpression(trigger);
  return (
    <div
      className="flex-none rounded-[10px] border bg-card px-[14px] py-[11px] shadow-xs"
      data-trigger-name={trigger.triggerName}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-[7px] flex-none rounded-full",
            trigger.enabled ? "bg-success" : "bg-muted-foreground"
          )}
        />
        <span className="sr-only">
          {trigger.enabled ? "Enabled trigger" : "Disabled trigger"}
        </span>
        <span className="font-mono font-semibold text-[12.5px]">
          {trigger.triggerName}
        </span>
        {trigger.timing ? (
          <Badge
            className="h-[18px] rounded-full px-2 text-[10px]"
            variant="secondary"
          >
            {trigger.timing}
          </Badge>
        ) : null}
        <Badge
          className="h-[18px] rounded-full px-2 font-mono text-[10px]"
          variant="outline"
        >
          {triggerEventsLabel(trigger)}
        </Badge>
        <Badge
          className="h-[18px] rounded-full px-2 text-[10px] text-muted-foreground"
          variant="ghost"
        >
          {triggerLevelLabel(trigger)}
        </Badge>
        {trigger.enabled ? null : (
          <span
            className={cn(
              "inline-flex h-[18px] items-center rounded-full px-2 font-medium text-[10px]",
              PILL_TONE_CLASSES.amber
            )}
          >
            disabled
          </span>
        )}
        <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
          {triggerFunctionLabel(trigger)}
        </span>
      </div>
      {whenExpression ? (
        <div className="mt-[7px] font-mono text-[11px] text-muted-foreground">
          WHEN ({whenExpression})
        </div>
      ) : null}
      <div className="mt-[9px] flex items-start gap-2 border-t pt-2">
        <pre className="m-0 min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.55]">
          <SqlSyntaxHighlight sql={formatTriggerSqlForDisplay(sql)} />
        </pre>
        <TriggerSqlCopyButton sql={sql} triggerName={trigger.triggerName} />
      </div>
    </div>
  );
}

function TriggersTab({
  query,
  schemaName,
  tableName,
}: {
  query: ReturnType<typeof useListTableTriggersQuery>;
  schemaName: string;
  tableName: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TRIGGER_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [stateFilters, setStateFilters] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTableTriggers",
            error: query.error,
            label: "Triggers",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="triggers"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const { triggers } = query.data;
  const filteredTriggers = filterTableTriggers(triggers, {
    search,
    states: stateFilters.filter(isTriggerStateFilter),
  });
  const pageCount = Math.max(1, Math.ceil(filteredTriggers.length / pageSize));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPageIndex * pageSize;
  const paginatedTriggers = filteredTriggers.slice(
    pageStart,
    pageStart + pageSize
  );

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    setPageIndex(0);
  }

  function handleStateFiltersChange(nextStateFilters: string[]) {
    setStateFilters(nextStateFilters);
    setPageIndex(0);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageIndex(
      pageIndexForPageSizeChange({
        nextPageSize,
        pageIndex: currentPageIndex,
        pageSize,
      })
    );
    setPageSize(nextPageSize);
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-table-key="data-explorer-table-triggers"
      data-testid="data-explorer-table-triggers"
    >
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <DataTableFilter
            onChange={handleSearchChange}
            placeholder="Search triggers…"
            value={search}
          />
          <FacetFilterBar
            filters={[
              {
                handleSelectedValuesChange: handleStateFiltersChange,
                label: "State",
                options: presentTriggerStateOptions(triggers),
                selectedValues: stateFilters,
              },
            ]}
          />
        </div>
        <RefreshControl
          className="text-muted-foreground text-xs"
          isRefreshing={toolbar.isRefreshing}
          labelClassName="sm:not-sr-only"
          lastFetchedLabel={toolbar.lastFetchedLabel}
          onRefresh={toolbar.handleRefresh}
        />
      </div>
      {triggers.length === 0 ? (
        <TableResourceEmptyState category="triggers" toolbar={toolbar} />
      ) : null}
      {triggers.length > 0 && filteredTriggers.length === 0 ? (
        <SearchEmptyState
          className="rounded-[10px] border"
          resourceName="triggers"
        />
      ) : null}
      {filteredTriggers.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {paginatedTriggers.map((trigger) => (
            <TriggerCard
              key={trigger.triggerName}
              schemaName={schemaName}
              tableName={tableName}
              trigger={trigger}
            />
          ))}
        </div>
      ) : null}
      <PaginationFooter
        hasNext={currentPageIndex < pageCount - 1}
        hasPrev={currentPageIndex > 0}
        onNext={() => {
          setPageIndex(Math.min(currentPageIndex + 1, pageCount - 1));
        }}
        onPageSizeChange={handlePageSizeChange}
        onPrev={() => {
          setPageIndex(Math.max(currentPageIndex - 1, 0));
        }}
        pageLabel={`Page ${currentPageIndex + 1} of ${pageCount}`}
        pageSize={pageSize}
        pageSizeLabel="Triggers per page"
        pageSizeOptions={TRIGGER_PAGE_SIZE_OPTIONS}
      />
    </div>
  );
}

export { TriggersTab };
