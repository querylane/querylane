"use client";

import { Activity, AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AsyncSectionState } from "@/components/async-section-state";
import {
  InstanceStatItem,
  InstanceStatsBar,
} from "@/components/console-pages/console-layout";
import {
  EMPTY_FILTER_VALUE,
  getActivityBlockingChains,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
  presentSessionTimeline,
} from "@/components/console-pages/instance-activity-model";
import { EmptyState } from "@/components/empty-state";
import { WarningBadge } from "@/components/querylane-ui/warning-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import {
  DataTable,
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  type DataTableFilterFacet,
  DataTableFilterToolbar,
} from "@/components/ui/data-table-filter-toolbar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { useMinimumSpin } from "@/hooks/use-minimum-spin";
import type { DbConnectionStatus } from "@/lib/console-resources";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { cn } from "@/lib/utils";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type { ConnectionActivityHealth } from "@/protogen/querylane/console/v1alpha1/instance_pb";

type ActivityStat = ReturnType<typeof presentActivityStats>[number];
type ActivitySessionRow = ReturnType<typeof presentActivitySessionRows>[number];
type BlockingChain = ReturnType<typeof getActivityBlockingChains>[number];

// Status-badge tones layered on top of the shared `secondary` badge variant,
// mirroring how RoleKindBadge tints a status without overriding the component.
const STATE_TONE_CLASS: Record<ActivitySessionRow["stateTone"], string> = {
  default: "",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function ActivityStatValue({ tone, value }: ActivityStat) {
  return (
    <span
      className={cn(
        "font-bold font-mono text-xl tabular-nums tracking-tight",
        tone === "warning" && "text-amber-600 dark:text-amber-400",
        tone === "danger" && "text-destructive"
      )}
    >
      {value}
    </span>
  );
}

const UTILIZATION_PERCENT_SCALE = 100;

function ActivityStatsBar({
  activity,
  hasActivity,
  stats,
}: {
  activity: ConnectionActivityHealth | undefined;
  hasActivity: boolean;
  stats: ActivityStat[];
}) {
  const utilization = hasActivity
    ? Math.round((activity?.utilizationRatio ?? 0) * UTILIZATION_PERCENT_SCALE)
    : undefined;
  return (
    <InstanceStatsBar className="sm:grid-cols-3 lg:grid-cols-6">
      <InstanceStatItem
        hint="How many backends are connected, out of max_connections. It counts background processes too, so it can be higher than the sessions in the table."
        label="Connections"
        progress={utilization}
        suffix={
          hasActivity
            ? `/ ${(activity?.maxConnections ?? 0).toLocaleString()}`
            : undefined
        }
      >
        <span className="font-bold font-mono text-xl tabular-nums tracking-tight">
          {hasActivity
            ? (activity?.totalConnections ?? 0).toLocaleString()
            : "—"}
        </span>
      </InstanceStatItem>
      {stats.map((stat) => (
        <InstanceStatItem hint={stat.hint} key={stat.label} label={stat.label}>
          <ActivityStatValue {...stat} />
        </InstanceStatItem>
      ))}
    </InstanceStatsBar>
  );
}

function ActivityStateBadge({ row }: { row: ActivitySessionRow }) {
  return (
    <Badge
      className={cn("font-mono", STATE_TONE_CLASS[row.stateTone])}
      variant="secondary"
    >
      {row.state}
    </Badge>
  );
}

function BlockedSessionRow({ row }: { row: ActivitySessionRow }) {
  return (
    <div className="mt-2 ml-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Badge variant="outline">waiting · pid {row.pid}</Badge>
      <div className="min-w-0 flex-1 opacity-80">
        <SqlCodeBlock
          className="text-xs"
          copyable={false}
          sql={row.query}
          variant="inline"
        />
      </div>
      <span className="shrink-0 font-mono text-amber-700 text-xs tabular-nums dark:text-amber-300">
        waiting {row.duration}
      </span>
    </div>
  );
}

function BlockingChainGroup({ chain }: { chain: BlockingChain }) {
  if (!chain.blocker) {
    return (
      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            blocker unavailable · pid {chain.blockerPid}
          </Badge>
          <span className="text-muted-foreground text-sm">
            The blocking session is not in the list above.
          </span>
        </div>
        {chain.blocked.map((row) => (
          <BlockedSessionRow key={row.pid} row={row} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">blocker · pid {chain.blocker.pid}</Badge>
        <span className="font-mono text-muted-foreground text-xs">
          {chain.blocker.user} · {chain.blocker.app} · {chain.blocker.state}{" "}
          {chain.blocker.duration}
        </span>
      </div>
      <SqlCodeBlock
        className="mt-2 text-xs"
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
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <LockKeyhole className="size-4 text-amber-600 dark:text-amber-400" />
          <CardTitle>Blocking chains</CardTitle>
          <WarningBadge>
            {chains.length.toLocaleString()}{" "}
            {chains.length === 1 ? "chain" : "chains"} ·{" "}
            {waitingCount.toLocaleString()} waiting
          </WarningBadge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {chains.map((chain) => (
          <BlockingChainGroup chain={chain} key={chain.blockerPid} />
        ))}
      </CardContent>
    </Card>
  );
}

const ACTIVITY_COLUMNS: DataTableColumnDef<ActivitySessionRow>[] = [
  {
    accessorFn: (row) => row.pid,
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">{row.original.pid}</span>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>PID</SortableHeader>
    ),
    id: "pid",
    sortFn: "basic",
  },
  {
    accessorFn: (row) => `${row.user} ${row.app}`,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-mono text-sm">{row.original.user}</div>
        <div className="truncate text-muted-foreground text-xs">
          {row.original.app}
        </div>
      </div>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>User · app</SortableHeader>
    ),
    id: "user",
  },
  {
    accessorFn: (row) => row.database,
    cell: ({ row }) => row.original.database,
    header: ({ column }) => <SortableHeader column={column}>DB</SortableHeader>,
    id: "database",
    meta: { cellClassName: "font-mono text-sm text-muted-foreground" },
  },
  {
    accessorFn: (row) => row.state,
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <ActivityStateBadge row={row.original} />
        {row.original.blockedByPid > 0 ? (
          <WarningBadge>blocked</WarningBadge>
        ) : null}
      </div>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>State</SortableHeader>
    ),
    id: "state",
  },
  {
    accessorFn: (row) => row.durationSeconds,
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          row.original.durationHot
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground"
        )}
      >
        {row.original.duration}
      </span>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Duration</SortableHeader>
    ),
    id: "duration",
    sortFn: "basic",
  },
  {
    accessorFn: (row) => row.query,
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[420px] overflow-hidden">
        <SqlCodeBlock
          className="text-xs"
          copyable={false}
          sql={row.original.query}
          variant="inline"
        />
      </div>
    ),
    enableSorting: false,
    header: () => "Query",
    id: "query",
  },
];

function InspectorSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </h3>
  );
}

function SessionTimelineList({ row }: { row: ActivitySessionRow }) {
  return (
    <ol className="ml-1 space-y-2.5 border-border border-l pl-4">
      {presentSessionTimeline(row).map((item) => (
        <li
          className="relative flex items-baseline justify-between gap-3"
          key={item.label}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1 -left-[21px] size-2 rounded-full",
              item.hot ? "bg-amber-500" : "bg-border"
            )}
          />
          <span className="text-muted-foreground text-sm">{item.label}</span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              item.muted && "text-muted-foreground",
              item.hot && "text-amber-700 dark:text-amber-300"
            )}
          >
            {item.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SessionPeerCard({
  caption,
  onSelect,
  row,
}: {
  caption: string;
  onSelect: (pid: number) => void;
  row: ActivitySessionRow;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {caption} · pid {row.pid}
        </Badge>
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {row.user} · {row.app} · {row.state} {row.duration}
        </span>
        <Button
          className="ml-auto"
          onClick={() => onSelect(row.pid)}
          size="xs"
          variant="outline"
        >
          Inspect
        </Button>
      </div>
      <div className="opacity-80">
        <SqlCodeBlock
          className="text-xs"
          copyable={false}
          sql={row.query}
          variant="inline"
        />
      </div>
    </div>
  );
}

function SessionWaitEvent({ row }: { row: ActivitySessionRow }) {
  if (row.wait.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="font-mono text-sm">{row.wait}</div>
      {row.waitExplanation ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {row.waitExplanation}
        </p>
      ) : null}
    </div>
  );
}

function SessionBlocker({
  blocker,
  onSelectSession,
  row,
}: {
  blocker: ActivitySessionRow | null;
  onSelectSession: (pid: number) => void;
  row: ActivitySessionRow;
}) {
  if (row.blockedByPid === 0) {
    return null;
  }
  if (blocker) {
    return (
      <SessionPeerCard
        caption="blocked by"
        onSelect={onSelectSession}
        row={blocker}
      />
    );
  }
  return (
    <div className="rounded-lg border border-border p-3 text-muted-foreground text-sm">
      Blocked by PID {row.blockedByPid}, which is not in the session sample.
    </div>
  );
}

function BlockedSessions({
  onSelectSession,
  victims,
}: {
  onSelectSession: (pid: number) => void;
  victims: ActivitySessionRow[];
}) {
  if (victims.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        This session is blocking{" "}
        {victims.length === 1 ? "1 session" : `${victims.length} sessions`}.
      </p>
      {victims.map((victim) => (
        <SessionPeerCard
          caption="waiting"
          key={victim.pid}
          onSelect={onSelectSession}
          row={victim}
        />
      ))}
    </div>
  );
}

function SessionWaitSection({
  onSelectSession,
  row,
  rows,
}: {
  onSelectSession: (pid: number) => void;
  row: ActivitySessionRow;
  rows: ActivitySessionRow[];
}) {
  const blocker =
    row.blockedByPid > 0
      ? (rows.find((peer) => peer.pid === row.blockedByPid) ?? null)
      : null;
  const victims = rows.filter((peer) => peer.blockedByPid === row.pid);
  if (row.wait.length === 0 && row.blockedByPid === 0 && victims.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <InspectorSectionTitle>Locks &amp; waits</InspectorSectionTitle>
      <SessionWaitEvent row={row} />
      <SessionBlocker
        blocker={blocker}
        onSelectSession={onSelectSession}
        row={row}
      />
      <BlockedSessions onSelectSession={onSelectSession} victims={victims} />
    </section>
  );
}

function SessionInspector({
  onRefresh,
  onSelectSession,
  refreshing,
  row,
  rows,
}: {
  onRefresh: () => void;
  onSelectSession: (pid: number) => void;
  refreshing: boolean;
  row: ActivitySessionRow;
  rows: ActivitySessionRow[];
}) {
  const isSpinning = useMinimumSpin(refreshing);
  return (
    <>
      <SheetHeader className="border-border border-b pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="font-mono font-semibold text-sm">
            Session {row.pid}
          </SheetTitle>
          <CopyIconButton
            ariaLabel="Copy PID"
            size="icon-xs"
            value={String(row.pid)}
          />
          <ActivityStateBadge row={row} />
          {row.blockedByPid > 0 ? <WarningBadge>blocked</WarningBadge> : null}
          <Button
            aria-label="Refresh session"
            className="text-muted-foreground"
            disabled={refreshing}
            onClick={onRefresh}
            size="icon-xs"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={
                isSpinning
                  ? "size-3.5 animate-spin motion-reduce:animate-none"
                  : "size-3.5"
              }
            />
          </Button>
        </div>
        <SheetDescription className="break-words font-mono text-xs">
          {row.user} · {row.app} · {row.database} · {row.client}
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-2">
          <InspectorSectionTitle>Timeline</InspectorSectionTitle>
          <SessionTimelineList row={row} />
        </section>
        <SessionWaitSection
          onSelectSession={onSelectSession}
          row={row}
          rows={rows}
        />
        <section className="space-y-2">
          <InspectorSectionTitle>Query</InspectorSectionTitle>
          <SqlCodeBlock sql={row.query} wrap={true} />
        </section>
      </div>
    </>
  );
}

function SessionEndedContent({ pid }: { pid: number }) {
  return (
    <>
      <SheetHeader className="border-border border-b pr-12">
        <SheetTitle className="font-mono font-semibold text-sm">
          Session {pid}
        </SheetTitle>
        <SheetDescription>
          This session is no longer visible in pg_stat_activity.
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <EmptyState
          description="It finished or was disconnected while this panel was open."
          icon={Activity}
          title="Session ended"
        />
      </div>
    </>
  );
}

function SessionSheetContent({
  onRefresh,
  onSelectSession,
  pid,
  refreshing,
  row,
  rows,
}: {
  onRefresh: () => void;
  onSelectSession: (pid: number) => void;
  pid: number | null;
  refreshing: boolean;
  row: ActivitySessionRow | null;
  rows: ActivitySessionRow[];
}) {
  if (pid === null) {
    return null;
  }
  if (!row) {
    return <SessionEndedContent pid={pid} />;
  }
  return (
    <SessionInspector
      onRefresh={onRefresh}
      onSelectSession={onSelectSession}
      refreshing={refreshing}
      row={row}
      rows={rows}
    />
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

function ActivitySessionSheet({
  onRefresh,
  onSelectSession,
  refreshing,
  selectedPid,
  selectedSession,
  rows,
}: {
  onRefresh: () => void;
  onSelectSession: (pid: number | null) => void;
  refreshing: boolean;
  selectedPid: number | null;
  selectedSession: ActivitySessionRow | null;
  rows: ActivitySessionRow[];
}) {
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onSelectSession(null);
        }
      }}
      open={selectedPid !== null}
    >
      <SheetContent
        // Registry sheets cap at sm:max-w-sm; the session inspector needs a
        // wide drawer, and `ui/` must stay native shadcn output, so the width
        // override lives here.
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-[min(calc(100vw-1rem),clamp(34rem,45vw,60rem))] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SessionSheetContent
          onRefresh={onRefresh}
          onSelectSession={onSelectSession}
          pid={selectedPid}
          refreshing={refreshing}
          row={selectedSession}
          rows={rows}
        />
      </SheetContent>
    </Sheet>
  );
}

function ActivityPageHeader({
  lastRefreshedLabel,
  onRefresh,
  refreshing,
}: {
  lastRefreshedLabel: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const isSpinning = useMinimumSpin(refreshing);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-2xl tracking-tight">Activity</h2>
        <div className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
          {lastRefreshedLabel ? (
            <span className="hidden sm:inline">{lastRefreshedLabel}</span>
          ) : null}
          <Button
            aria-label="Refresh activity"
            disabled={refreshing}
            onClick={onRefresh}
            size="icon-xs"
            variant="ghost"
          >
            <RefreshCw
              aria-hidden="true"
              className={
                isSpinning
                  ? "size-3.5 animate-spin motion-reduce:animate-none"
                  : "size-3.5"
              }
            />
          </Button>
        </div>
      </div>
      <p className="max-w-3xl text-muted-foreground text-sm">
        Shows who is connected to this server right now, what they are running,
        and whether anything is stuck waiting on a lock. It lists up to 50
        sessions, riskiest first: refresh to take a new snapshot.
      </p>
    </div>
  );
}

function InstanceActivityPage({
  activity,
  connectionStatus,
  lastRefreshedLabel,
  onRefresh,
  partialErrors,
  pending,
  refreshing,
}: {
  activity: ConnectionActivityHealth | undefined;
  connectionStatus: DbConnectionStatus;
  lastRefreshedLabel: string | null;
  onRefresh: () => void;
  partialErrors: Status[] | undefined;
  pending: boolean;
  refreshing: boolean;
}) {
  const [search, setSearch] = useUrlTableSearch();
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [appFilter, setAppFilter] = useState<string[]>([]);
  const [databaseFilter, setDatabaseFilter] = useState<string[]>([]);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

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
  // Resolve the open drawer's session from the freshest snapshot instead of
  // capturing the row at click time, so a refresh updates the drawer in place
  // and a vanished session gets an explicit "ended" state.
  const selectedSession =
    selectedPid === null
      ? null
      : (allRows.find((row) => row.pid === selectedPid) ?? null);

  const facets = [
    {
      label: "State",
      onChange: setStateFilter,
      options: presentActivityFilterOptions(allRows, "state").map((value) => ({
        label: value,
        value,
      })),
      selected: stateFilter,
      singleSelect: true,
    },
    {
      label: "App",
      onChange: setAppFilter,
      options: presentActivityFilterOptions(allRows, "app").map((value) => ({
        label: value,
        value,
      })),
      selected: appFilter,
      singleSelect: true,
    },
    {
      label: "DB",
      onChange: setDatabaseFilter,
      options: presentActivityFilterOptions(allRows, "database").map(
        (value) => ({ label: value, value })
      ),
      selected: databaseFilter,
      singleSelect: true,
    },
  ] satisfies DataTableFilterFacet[];

  function handleClearAll() {
    setSearch("");
    setStateFilter([]);
    setAppFilter([]);
    setDatabaseFilter([]);
  }

  return (
    <section
      aria-busy={refreshing}
      aria-label="Activity"
      className="flex flex-col gap-6"
    >
      <ActivityPageHeader
        lastRefreshedLabel={lastRefreshedLabel}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <ActivityStatsBar
        activity={activity}
        hasActivity={hasActivity}
        stats={stats}
      />

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

        <section className="flex flex-col gap-3">
          <DataTableFilterToolbar
            dataSlot="activity-filter-bar"
            facets={facets}
            onClearAll={handleClearAll}
            onSearchChange={setSearch}
            searchPlaceholder="Search query, user, app…"
            searchValue={search}
          />
          <DataTable
            columns={ACTIVITY_COLUMNS}
            data={rows}
            emptyResourceName="sessions"
            initialSorting={[{ desc: true, id: "duration" }]}
            onRowClick={(row) => setSelectedPid(row.pid)}
            tableKey="instance-activity-sessions"
          />
        </section>
      </AsyncSectionState>

      <ActivitySessionSheet
        onRefresh={onRefresh}
        onSelectSession={setSelectedPid}
        refreshing={refreshing}
        rows={allRows}
        selectedPid={selectedPid}
        selectedSession={selectedSession}
      />
    </section>
  );
}

export { InstanceActivityPage };
