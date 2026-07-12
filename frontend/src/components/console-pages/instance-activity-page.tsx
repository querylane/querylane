"use client";

import {
  Activity,
  AlertTriangle,
  LockKeyhole,
  MoreHorizontal,
  SearchX,
} from "lucide-react";
import { useState } from "react";
import { AsyncSectionState } from "@/components/async-section-state";
import {
  EMPTY_FILTER_VALUE,
  getActivityBlockingChain,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
} from "@/components/console-pages/instance-activity-model";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DbConnectionStatus } from "@/lib/console-resources";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { cn } from "@/lib/utils";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type { InstanceHealth } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type ActivityStat = ReturnType<typeof presentActivityStats>[number];
type ActivitySessionRow = ReturnType<typeof presentActivitySessionRows>[number];
type BlockingChain = NonNullable<ReturnType<typeof getActivityBlockingChain>>;

type FilterKey = "app" | "database" | "state";

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

function ActivityFilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <Select onValueChange={(next) => next && onChange(next)} value={value}>
      <SelectTrigger
        aria-label={label}
        className="h-7 min-w-28 text-xs"
        size="sm"
      >
        <SelectValue>
          {label}: {value === EMPTY_FILTER_VALUE ? "any" : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option} label={option} value={option}>
            {option === EMPTY_FILTER_VALUE ? "any" : option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BlockingChainCard({ chain }: { chain: BlockingChain }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-amber-500/40 bg-amber-500/5">
      <div className="flex flex-wrap items-center gap-2 px-[18px] py-3">
        <LockKeyhole className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-sm">Blocking chain</span>
        <span className="text-muted-foreground text-xs">
          1 session holds locks that {chain.blocked.length} others are waiting
          on
        </span>
      </div>
      <div className="px-[18px] pb-3.5">
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
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-6">
            {chain.blocker.query}
          </pre>
        </div>
        {chain.blocked.map((row) => (
          <div
            className="mt-2 ml-6 flex items-center gap-2 rounded-[9px] border border-border bg-background px-3 py-2"
            key={row.pid}
          >
            <Badge className="h-[17px] text-[9.5px]" variant="outline">
              waiting · pid {row.pid}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">
              {row.query}
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-amber-700 dark:text-amber-300">
              waiting {row.duration}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionActionsButton({ pid }: { pid: number }) {
  return (
    <Button
      aria-label={`Open session actions for pid ${pid}`}
      disabled={true}
      size="icon-xs"
      title="Session actions need a backend action API"
      type="button"
      variant="ghost"
    >
      <MoreHorizontal className="size-3.5" />
    </Button>
  );
}

function ActivitySessionsTable({
  rows,
  search,
}: {
  rows: ActivitySessionRow[];
  search: string;
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

  const blockerPid =
    rows.find((candidate) => candidate.blockedByPid > 0)?.blockedByPid ?? 0;

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-[18px]">PID</TableHead>
            <TableHead>User · app</TableHead>
            <TableHead>DB</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Query</TableHead>
            <TableHead className="w-11 pr-3" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              className={cn(
                row.blockedByPid > 0 && "bg-muted/40",
                row.pid === blockerPid && "bg-amber-500/5"
              )}
              key={row.pid}
            >
              <TableCell className="pl-[18px] font-mono text-xs tabular-nums">
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
              <TableCell className="max-w-[340px] truncate font-mono text-[11px]">
                {row.query}
              </TableCell>
              <TableCell className="pr-2 text-right">
                <SessionActionsButton pid={row.pid} />
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
  connectionStatus,
  health,
  partialErrors,
  pending,
  refreshing,
}: {
  connectionStatus: DbConnectionStatus;
  health: InstanceHealth | undefined;
  partialErrors: Status[] | undefined;
  pending: boolean;
  refreshing: boolean;
}) {
  const [search, setSearch] = useUrlTableSearch();
  const [stateFilter, setStateFilter] = useState(EMPTY_FILTER_VALUE);
  const [appFilter, setAppFilter] = useState(EMPTY_FILTER_VALUE);
  const [databaseFilter, setDatabaseFilter] = useState(EMPTY_FILTER_VALUE);
  const activity = health?.connectionActivity;
  const stats = presentActivityStats(activity);
  const allRows = presentActivitySessionRows(activity, {
    app: EMPTY_FILTER_VALUE,
    database: EMPTY_FILTER_VALUE,
    search: "",
    state: EMPTY_FILTER_VALUE,
  });
  const rows = presentActivitySessionRows(activity, {
    app: appFilter,
    database: databaseFilter,
    search,
    state: stateFilter,
  });
  const blockingChain = getActivityBlockingChain(allRows);
  const hasActivity = connectionStatus === "connected" && Boolean(activity);
  const filterOptions: Record<FilterKey, string[]> = {
    app: presentActivityFilterOptions(allRows, "app"),
    database: presentActivityFilterOptions(allRows, "database"),
    state: presentActivityFilterOptions(allRows, "state"),
  };

  return (
    <section aria-label="Activity" className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div>
          <h2 className="font-bold text-[22px] tracking-[-0.01em]">Activity</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Live sessions from pg_stat_activity — refreshed every 5 s
          </p>
        </div>
        <div className="hidden flex-1 lg:block" />
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {stats.map((stat) => (
            <ActivityHeaderStat key={stat.label} {...stat} />
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
        isPending={pending}
        isRefreshing={refreshing}
        loadingMessage="Loading activity..."
        refreshingMessage="Refreshing activity..."
      >
        {blockingChain ? <BlockingChainCard chain={blockingChain} /> : null}

        <div className="overflow-hidden rounded-[14px] bg-card shadow-xs ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2 px-[18px] py-3">
            <DataTableFilter
              onChange={setSearch}
              placeholder="Search query, user, app…"
              value={search}
            />
            <div className="flex-1" />
            <ActivityFilterSelect
              label="State"
              onChange={setStateFilter}
              options={filterOptions.state}
              value={stateFilter}
            />
            <ActivityFilterSelect
              label="App"
              onChange={setAppFilter}
              options={filterOptions.app}
              value={appFilter}
            />
            <ActivityFilterSelect
              label="DB"
              onChange={setDatabaseFilter}
              options={filterOptions.database}
              value={databaseFilter}
            />
          </div>
          <ActivitySessionsTable rows={rows} search={search} />
          <div className="flex items-center gap-2 border-border border-t px-[18px] py-2.5">
            <span className="text-muted-foreground text-xs">
              {rows.length.toLocaleString()} sessions shown ·{" "}
              {activity?.totalConnections.toLocaleString() ?? "0"} total on the
              server
            </span>
            <div className="flex-1" />
            <span className="font-mono text-muted-foreground text-xs">
              Page 1 of 1
            </span>
            <Button
              aria-label="Previous activity page"
              disabled={true}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              ‹
            </Button>
            <Button
              aria-label="Next activity page"
              disabled={true}
              size="icon-xs"
              type="button"
              variant="outline"
            >
              ›
            </Button>
          </div>
        </div>
      </AsyncSectionState>
    </section>
  );
}

export { InstanceActivityPage };
