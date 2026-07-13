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
  getActivityBlockingChains,
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
import type { ConnectionActivityHealth } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type ActivityStat = ReturnType<typeof presentActivityStats>[number];
type ActivitySessionRow = ReturnType<typeof presentActivitySessionRows>[number];
type BlockingChain = ReturnType<typeof getActivityBlockingChains>[number];

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
  onChange: (value: string | null) => void;
  options: string[];
  value: string | null;
}) {
  const selectOptions = [
    { label: "any", selectValue: "all", value: EMPTY_FILTER_VALUE },
    ...options.map((option, index) => ({
      label: option,
      selectValue: `value-${index}`,
      value: option,
    })),
  ];
  const selectedOption =
    selectOptions.find((option) => option.value === value) ?? selectOptions[0];

  return (
    <Select
      onValueChange={(next) => {
        const option = selectOptions.find(
          (candidate) => candidate.selectValue === next
        );
        if (option) {
          onChange(option.value);
        }
      }}
      value={selectedOption?.selectValue}
    >
      <SelectTrigger
        aria-label={label}
        className="h-7 min-w-28 text-xs"
        size="sm"
      >
        <SelectValue>
          {label}: {selectedOption?.label ?? "any"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {selectOptions.map((option) => (
          <SelectItem
            key={option.selectValue}
            label={option.label}
            value={option.selectValue}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BlockedSessionRow({ row }: { row: ActivitySessionRow }) {
  return (
    <div className="mt-2 ml-6 flex items-center gap-2 rounded-[9px] border border-border bg-background px-3 py-2">
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
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-6">
        {chain.blocker.query}
      </pre>
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
                row.blockedByPid > 0 && "bg-muted/40",
                blockerPids.has(row.pid) && "bg-amber-500/5"
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
  const [stateFilter, setStateFilter] = useState<string | null>(
    EMPTY_FILTER_VALUE
  );
  const [appFilter, setAppFilter] = useState<string | null>(EMPTY_FILTER_VALUE);
  const [databaseFilter, setDatabaseFilter] = useState<string | null>(
    EMPTY_FILTER_VALUE
  );
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
    app: appFilter,
    database: databaseFilter,
    search,
    state: stateFilter,
  });
  const blockingChains = getActivityBlockingChains(allRows);
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
        isRefreshing={refreshing}
        loadingMessage="Loading activity..."
        refreshingMessage="Refreshing activity..."
      >
        {blockingChains.length > 0 ? (
          <BlockingChainCard chains={blockingChains} />
        ) : null}

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
