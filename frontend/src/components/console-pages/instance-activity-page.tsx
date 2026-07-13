"use client";

import {
  Activity,
  AlertTriangle,
  Copy,
  Eye,
  LockKeyhole,
  MoreHorizontal,
  SearchX,
  X,
} from "lucide-react";
import { useState } from "react";
import { AsyncSectionState } from "@/components/async-section-state";
import {
  EMPTY_FILTER_VALUE,
  getActivityBlockingChains,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
} from "@/components/console-pages/instance-activity-model";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DbConnectionStatus } from "@/lib/console-resources";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  pageIndexForPageSizeChange,
} from "@/lib/pagination";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { cn } from "@/lib/utils";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type { ConnectionActivityHealth } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type ActivityStat = ReturnType<typeof presentActivityStats>[number];
type ActivitySessionRow = ReturnType<typeof presentActivitySessionRows>[number];
type BlockingChain = ReturnType<typeof getActivityBlockingChains>[number];

type FilterKey = "app" | "database" | "state";

function activityPaginationSummary({
  filteredCount,
  first,
  hasActiveFiltering,
  last,
  sampledCount,
  totalConnections,
}: {
  filteredCount: number;
  first: number;
  hasActiveFiltering: boolean;
  last: number;
  sampledCount: number;
  totalConnections: number;
}) {
  const visibleRange = first === 0 ? "0" : `${first}–${last}`;
  const scope = hasActiveFiltering
    ? `${filteredCount} matches · ${sampledCount} sampled sessions`
    : `${filteredCount} sampled sessions`;

  return `Showing ${visibleRange} of ${scope} · ${totalConnections} total on server`;
}

function ActivityHeaderStat({ label, tone, value }: ActivityStat) {
  return (
    <div className="px-2 text-right">
      <div
        className={cn(
          "font-bold font-mono text-base tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.04em]">
        {label}
      </div>
    </div>
  );
}

function ActivityStateBadge({ row }: { row: ActivitySessionRow }) {
  const variant = row.stateTone === "default" ? "ghost" : "secondary";
  return (
    <Badge
      className={cn(
        "h-[18px] font-mono text-[9.5px]",
        row.stateTone === "success" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        row.stateTone === "warning" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      )}
      variant={variant}
    >
      {row.state}
    </Badge>
  );
}

function BlockedSessionRow({ row }: { row: ActivitySessionRow }) {
  return (
    <div className="mt-2 ml-6 flex items-center gap-2 rounded-[9px] border border-border bg-background px-3 py-2">
      <Badge className="h-[17px] text-[9.5px]" variant="outline">
        waiting · pid {row.pid}
      </Badge>
      <div className="min-w-0 flex-1 opacity-70">
        <SqlCodeBlock
          className="text-[10.5px]"
          copyable={false}
          sql={row.query}
          variant="inline"
        />
      </div>
      <span className="shrink-0 font-mono text-[10.5px] text-amber-700 dark:text-amber-300">
        waiting {row.duration}
      </span>
    </div>
  );
}

function BlockingChainGroup({ chain }: { chain: BlockingChain }) {
  if (!chain.blocker) {
    return (
      <div className="rounded-[10px] border border-amber-500/50 border-dashed bg-background px-[13px] py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="h-[18px] text-[10px]" variant="secondary">
            blocker unavailable · pid {chain.blockerPid}
          </Badge>
          <span className="text-muted-foreground text-xs">
            Blocking session is outside the sampled client sessions.
          </span>
        </div>
        {chain.blocked.map((row) => (
          <BlockedSessionRow key={row.pid} row={row} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-background px-[13px] py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="h-[18px] text-[10px]" variant="secondary">
          blocker · pid {chain.blocker.pid}
        </Badge>
        <span className="font-mono text-muted-foreground text-xs">
          {chain.blocker.user} · {chain.blocker.app} · {chain.blocker.state}{" "}
          {chain.blocker.duration}
        </span>
        <Button
          className="ml-auto"
          disabled={true}
          size="xs"
          title="Requires a backend action API"
          variant="destructive"
        >
          Terminate…
        </Button>
      </div>
      <SqlCodeBlock
        className="mt-2 rounded-none border-0 bg-transparent p-0 text-[11px] leading-6"
        copyable={false}
        sql={chain.blocker.query}
        wrap={true}
      />
      {chain.blocked.map((row) => (
        <BlockedSessionRow key={row.pid} row={row} />
      ))}
    </div>
  );
}

function BlockingChainCard({ chains }: { chains: BlockingChain[] }) {
  const waitingCount = chains.reduce(
    (total, chain) => total + chain.blocked.length,
    0
  );

  return (
    <div className="overflow-hidden rounded-[14px] border border-amber-500/40 bg-amber-500/5">
      <div className="flex flex-wrap items-center gap-2 px-[18px] py-3">
        <LockKeyhole className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-sm">Blocking chain</span>
        <span className="text-muted-foreground text-xs">
          {chains.length.toLocaleString()}{" "}
          {chains.length === 1 ? "chain" : "chains"} ·{" "}
          {waitingCount.toLocaleString()} waiting{" "}
          {waitingCount === 1 ? "session" : "sessions"}
        </span>
      </div>
      <div className="grid gap-2 px-[18px] pb-3.5">
        {chains.map((chain) => (
          <BlockingChainGroup chain={chain} key={chain.blockerPid} />
        ))}
      </div>
    </div>
  );
}

function SessionActionsButton({
  onSelectSession,
  row,
}: {
  onSelectSession: (row: ActivitySessionRow) => void;
  row: ActivitySessionRow;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Open session actions for pid ${row.pid}`}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => onSelectSession(row)}>
          <Eye />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => writeClipboard(String(row.pid))}>
          <Copy />
          Copy PID
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => writeClipboard(row.query)}>
          <Copy />
          Copy query
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionDetails({ row }: { row: ActivitySessionRow }) {
  const facts = [
    { label: "User", value: row.user },
    { label: "Application", value: row.app },
    { label: "Database", value: row.database },
    { label: "State", value: row.state },
    { label: "Duration", value: row.duration },
    { label: "Wait event", value: row.wait || "Not waiting" },
    ...(row.blockedByPid > 0
      ? [{ label: "Blocked by", value: `PID ${row.blockedByPid}` }]
      : []),
  ];

  return (
    <>
      <SheetHeader className="border-border border-b pr-12">
        <SheetTitle className="font-mono font-semibold text-sm">
          Session {row.pid}
        </SheetTitle>
        <SheetDescription>
          Live PostgreSQL session details from pg_stat_activity.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <dl className="grid grid-cols-2 gap-2">
          {facts.map((fact) => (
            <div
              className="rounded-lg border border-border p-3"
              key={fact.label}
            >
              <dt className="font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-wide">
                {fact.label}
              </dt>
              <dd className="mt-1 break-words font-mono text-sm">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Query
          </h3>
          <SqlCodeBlock sql={row.query} wrap={true} />
        </div>
      </div>
    </>
  );
}

function ActivitySessionsTable({
  onSelectSession,
  rows,
  search,
  selectedPid,
}: {
  onSelectSession: (row: ActivitySessionRow) => void;
  rows: ActivitySessionRow[];
  search: string;
  selectedPid: number | undefined;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        className="min-h-56 rounded-none border-0 border-t bg-transparent"
        description={
          search.trim()
            ? "No live sessions match this search."
            : "No live client sessions are visible from pg_stat_activity yet."
        }
        icon={SearchX}
        title="No activity sessions"
      />
    );
  }

  const blockerPids = new Set<number>();
  for (const candidate of rows) {
    if (candidate.blockedByPid > 0) {
      blockerPids.add(candidate.blockedByPid);
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-[18px]">PID</TableHead>
            <TableHead>User · app</TableHead>
            <TableHead>DB</TableHead>
            <TableHead>State</TableHead>
            <TableHead title="Idle in transaction uses transaction age; other rows use current query duration.">
              Duration
            </TableHead>
            <TableHead>Query</TableHead>
            <TableHead className="w-11 pr-3" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              className={cn(
                "relative cursor-pointer",
                row.blockedByPid > 0 && "bg-muted/40",
                blockerPids.has(row.pid) && "bg-amber-500/5"
              )}
              key={row.pid}
            >
              <TableCell className="pl-[18px] font-mono text-xs tabular-nums">
                <Button
                  aria-expanded={selectedPid === row.pid}
                  aria-haspopup="dialog"
                  aria-label={`View session ${row.pid} details`}
                  className="absolute inset-0 z-10 h-full w-full rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-inset"
                  onClick={() => onSelectSession(row)}
                  type="button"
                  variant="ghost"
                />
                {row.pid}
              </TableCell>
              <TableCell>
                <div className="font-mono text-[11.5px]">{row.user}</div>
                <div className="text-[10px] text-muted-foreground">
                  {row.app}
                </div>
              </TableCell>
              <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                {row.database}
              </TableCell>
              <TableCell>
                <ActivityStateBadge row={row} />
              </TableCell>
              <TableCell
                className={cn(
                  "font-mono text-[11.5px] tabular-nums",
                  row.durationHot
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground"
                )}
              >
                {row.duration}
              </TableCell>
              <TableCell className="max-w-[340px] font-mono text-[11px]">
                <SqlCodeBlock
                  className="text-[11px]"
                  copyable={false}
                  sql={row.query}
                  variant="inline"
                />
              </TableCell>
              <TableCell className="relative z-20 pr-2 text-right">
                <SessionActionsButton
                  onSelectSession={onSelectSession}
                  row={row}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function activityPartialErrorMessage(partialErrors: Status[] | undefined) {
  const firstMessage = partialErrors?.find((error) =>
    error.message.trim()
  )?.message;
  return firstMessage ?? "Activity data is unavailable for this instance.";
}

function ActivityUnavailable({
  connectionStatus,
  partialErrors,
}: {
  connectionStatus: DbConnectionStatus;
  partialErrors: Status[] | undefined;
}) {
  if (connectionStatus !== "connected") {
    return (
      <EmptyState
        description="Connect the instance before Querylane can read pg_stat_activity."
        icon={Activity}
        title="Activity unavailable"
      />
    );
  }

  return (
    <EmptyState
      description={activityPartialErrorMessage(partialErrors)}
      icon={AlertTriangle}
      title="Activity data unavailable"
    />
  );
}

function InstanceActivityPage({
  activity,
  connectionStatus,
  partialErrors,
  pending,
  refreshing,
}: {
  activity: ConnectionActivityHealth | undefined;
  connectionStatus: DbConnectionStatus;
  partialErrors: Status[] | undefined;
  pending: boolean;
  refreshing: boolean;
}) {
  const [search, setSearch] = useUrlTableSearch();
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [appFilter, setAppFilter] = useState<string[]>([]);
  const [databaseFilter, setDatabaseFilter] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedSession, setSelectedSession] =
    useState<ActivitySessionRow | null>(null);
  const stats = presentActivityStats(
    connectionStatus === "connected" ? activity : undefined
  );
  const allRows = presentActivitySessionRows(activity, {
    app: EMPTY_FILTER_VALUE,
    database: EMPTY_FILTER_VALUE,
    search: "",
    state: EMPTY_FILTER_VALUE,
  });
  const rows = presentActivitySessionRows(activity, {
    app: appFilter[0] ?? EMPTY_FILTER_VALUE,
    database: databaseFilter[0] ?? EMPTY_FILTER_VALUE,
    search,
    state: stateFilter[0] ?? EMPTY_FILTER_VALUE,
  });
  const blockingChains = getActivityBlockingChains(allRows);
  const hasActivity = connectionStatus === "connected" && Boolean(activity);
  const filterOptions: Record<FilterKey, string[]> = {
    app: presentActivityFilterOptions(allRows, "app"),
    database: presentActivityFilterOptions(allRows, "database"),
    state: presentActivityFilterOptions(allRows, "state"),
  };
  const hasActiveFacet =
    stateFilter.length > 0 || appFilter.length > 0 || databaseFilter.length > 0;
  const hasActiveFiltering = search.trim().length > 0 || hasActiveFacet;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageRows = rows.slice(
    currentPageIndex * pageSize,
    (currentPageIndex + 1) * pageSize
  );
  const firstVisibleRow =
    rows.length === 0 ? 0 : currentPageIndex * pageSize + 1;
  const lastVisibleRow = Math.min(
    (currentPageIndex + 1) * pageSize,
    rows.length
  );

  function resetPage() {
    setPageIndex(0);
  }

  function handleSearchChange(nextSearch: string) {
    resetPage();
    setSearch(nextSearch);
  }

  function handleStateFilterChange(nextFilter: string[]) {
    resetPage();
    setStateFilter(nextFilter);
  }

  function handleAppFilterChange(nextFilter: string[]) {
    resetPage();
    setAppFilter(nextFilter);
  }

  function handleDatabaseFilterChange(nextFilter: string[]) {
    resetPage();
    setDatabaseFilter(nextFilter);
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
    <section
      aria-busy={refreshing}
      aria-label="Activity"
      className="flex flex-col gap-[18px]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div>
          <h2 className="font-bold text-[22px] tracking-[-0.01em]">Activity</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Live sessions from pg_stat_activity, refreshed every 5 s
          </p>
        </div>
        <div className="hidden flex-1 lg:block" />
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {stats.map((stat) => (
            <ActivityHeaderStat {...stat} key={stat.label} />
          ))}
        </div>
      </div>

      <AsyncSectionState
        emptyState={
          <ActivityUnavailable
            connectionStatus={connectionStatus}
            partialErrors={partialErrors}
          />
        }
        hasContent={hasActivity}
        isPending={connectionStatus === "connected" && pending}
        loadingMessage="Loading activity..."
      >
        {blockingChains.length > 0 ? (
          <BlockingChainCard chains={blockingChains} />
        ) : null}

        <div className="overflow-hidden rounded-[14px] bg-card shadow-xs ring-1 ring-border">
          <div className="overflow-x-auto px-[18px] py-3">
            <div className="flex min-w-max items-center gap-2">
              <DataTableFilter
                onChange={handleSearchChange}
                placeholder="Search query, user, app…"
                value={search}
              />
              <DataTableFacetedFilter
                onSelectedValuesChange={handleStateFilterChange}
                options={filterOptions.state.map((value) => ({
                  label: value,
                  value,
                }))}
                selectedValues={stateFilter}
                singleSelect={true}
                title="State"
              />
              <DataTableFacetedFilter
                onSelectedValuesChange={handleAppFilterChange}
                options={filterOptions.app.map((value) => ({
                  label: value,
                  value,
                }))}
                selectedValues={appFilter}
                singleSelect={true}
                title="App"
              />
              <DataTableFacetedFilter
                onSelectedValuesChange={handleDatabaseFilterChange}
                options={filterOptions.database.map((value) => ({
                  label: value,
                  value,
                }))}
                selectedValues={databaseFilter}
                singleSelect={true}
                title="DB"
              />
              {hasActiveFacet ? (
                <Button
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    resetPage();
                    setStateFilter([]);
                    setAppFilter([]);
                    setDatabaseFilter([]);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X data-icon="inline-start" />
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
          <ActivitySessionsTable
            onSelectSession={setSelectedSession}
            rows={pageRows}
            search={search}
            selectedPid={selectedSession?.pid}
          />
          <div className="overflow-x-auto border-border border-t px-[18px] py-1.5">
            <div className="flex min-w-[680px] items-center gap-4">
              {rows.length > 0 ? (
                <span className="shrink-0 text-muted-foreground text-xs">
                  {activityPaginationSummary({
                    filteredCount: rows.length,
                    first: firstVisibleRow,
                    hasActiveFiltering,
                    last: lastVisibleRow,
                    sampledCount: allRows.length,
                    totalConnections: activity?.totalConnections ?? 0,
                  })}
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <PaginationFooter
                  hasNext={currentPageIndex < pageCount - 1}
                  hasPrev={currentPageIndex > 0}
                  onNext={() => setPageIndex(currentPageIndex + 1)}
                  onPageSizeChange={handlePageSizeChange}
                  onPrev={() => setPageIndex(currentPageIndex - 1)}
                  pageLabel={`Page ${currentPageIndex + 1} of ${pageCount}`}
                  pageSize={pageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                />
              </div>
            </div>
          </div>
        </div>
      </AsyncSectionState>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
          }
        }}
        open={selectedSession !== null}
      >
        <SheetContent
          className="w-[min(34rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
          side="right"
        >
          {selectedSession ? <SessionDetails row={selectedSession} /> : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export { InstanceActivityPage };
