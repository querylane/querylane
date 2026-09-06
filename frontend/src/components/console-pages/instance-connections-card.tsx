import { Link } from "@tanstack/react-router";
import { ChevronRight, Lock, Timer, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatElapsedDuration } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type {
  ApplicationConnections,
  ConnectionActivityHealth,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

interface InstanceConnectionsCardProps {
  activity: ConnectionActivityHealth | undefined;
  instanceId: string;
  isPending: boolean;
}

/**
 * The disjoint pg_stat_activity states the ledger has a column for. Lock
 * waiters are NOT a state — they are a subset of active backends — so they
 * surface as a signal row instead of a column.
 */
const CONNECTION_STATES = [
  {
    className: "bg-chart-1",
    key: "activeConnections",
    label: "Active",
    short: "Active",
  },
  {
    className: "bg-muted-foreground/45",
    key: "idleConnections",
    label: "Idle",
    short: "Idle",
  },
  {
    className: "bg-chart-4",
    key: "idleInTransactionConnections",
    label: "Idle in transaction",
    short: "Idle in txn",
  },
] as const;

const PERCENT = 100;
const MS_PER_SECOND = 1000;
/** Rows beyond this fold into a "more on the Activity page" line. */
const MAX_APPLICATION_ROWS = 10;
/** Sentinel the backend emits for backends that set no application_name. */
const UNNAMED_APPLICATION = "(unnamed)";
const NUMERIC_CELL = "w-9 px-1 py-1.5 text-right text-xs";
const NAME_CELL = "w-full max-w-0 py-1.5 pr-2 pl-0 text-xs";
const LEDGER_COLUMNS = CONNECTION_STATES.length + 2;

function sharePercent(count: number, total: number): number {
  return total <= 0 ? 0 : Math.round((count / total) * PERCENT);
}

function widthPercent(count: number, denominator: number): string {
  return denominator <= 0 ? "0%" : `${(count / denominator) * PERCENT}%`;
}

function Swatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-[3px]", className)}
    />
  );
}

/** One sentence with a meter: how much of max_connections is spoken for. */
function CapacityLine({ activity }: { activity: ConnectionActivityHealth }) {
  const label = `${activity.totalConnections} of ${activity.maxConnections} connections in use`;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="whitespace-nowrap">
        <span className="font-semibold text-base tabular-nums leading-none">
          {activity.totalConnections}
        </span>
        <span className="text-muted-foreground">
          {" "}
          of {activity.maxConnections} in use
        </span>
      </span>
      <div
        aria-label={label}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        role="img"
      >
        <div
          className="h-full rounded-full bg-chart-1"
          style={{
            width: widthPercent(
              activity.totalConnections,
              activity.maxConnections
            ),
          }}
        />
      </div>
      <span className="text-muted-foreground tabular-nums">
        {sharePercent(activity.totalConnections, activity.maxConnections)}%
      </span>
    </div>
  );
}

interface ActivitySignal {
  icon: typeof Lock;
  key: string;
  text: string;
  toneClassName: string;
}

function collectSignals(activity: ConnectionActivityHealth): ActivitySignal[] {
  const signals: ActivitySignal[] = [];

  const waiting = activity.waitingForLockConnections;
  if (waiting > 0) {
    signals.push({
      icon: Lock,
      key: "waiting",
      text:
        waiting === 1
          ? "1 connection waiting on a lock"
          : `${waiting} connections waiting on locks`,
      toneClassName: "bg-destructive/8 text-destructive",
    });
  }

  const longRunning = activity.longRunningTransactionConnections;
  if (longRunning > 0) {
    const longest = formatElapsedDuration(
      Number(activity.longestTransactionSeconds) * MS_PER_SECOND
    );
    signals.push({
      icon: Timer,
      key: "long-running",
      text:
        longRunning === 1
          ? `1 transaction open for ${longest}`
          : `${longRunning} long transactions, longest open ${longest}`,
      toneClassName: "bg-chart-4/12 text-chart-4",
    });
  }

  return signals;
}

/**
 * Lock waits and long-running transactions overlap the state counts, so they
 * render as tinted rows — loud when present, absent when healthy.
 */
function ActivitySignals({ activity }: { activity: ConnectionActivityHealth }) {
  const signals = collectSignals(activity);
  if (signals.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {signals.map((signal) => (
        <li
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-xs",
            signal.toneClassName
          )}
          key={signal.key}
        >
          <signal.icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="text-foreground">{signal.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Names the swatch-only column headers below. */
function StateLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {CONNECTION_STATES.map((state) => (
        <span className="flex items-center gap-1.5" key={state.key}>
          <Swatch className={state.className} />
          {state.short}
        </span>
      ))}
    </div>
  );
}

function ApplicationLabel({ name }: { name: string }) {
  if (name === UNNAMED_APPLICATION) {
    return (
      <span
        className="block truncate text-muted-foreground italic"
        title="Clients that don't set application_name"
      >
        no name set
      </span>
    );
  }

  return (
    <span className="block truncate font-mono" title={name}>
      {name}
    </span>
  );
}

function Count({ bold = false, value }: { bold?: boolean; value: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        bold && "font-medium",
        value === 0 && "text-muted-foreground/50"
      )}
    >
      {value}
    </span>
  );
}

/**
 * Swatch-only state headers: at the card's fixed column width, text headers
 * left no room for application names.
 */
function LedgerHeader() {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-7 pl-0 text-xs">Application</TableHead>
        {CONNECTION_STATES.map((state) => (
          <TableHead
            className="h-7 w-9 px-1 text-right text-xs"
            key={state.key}
            title={state.label}
          >
            <Swatch className={state.className} />
            <span className="sr-only">{state.label}</span>
          </TableHead>
        ))}
        <TableHead className="h-7 w-9 px-1 pr-0 text-right text-xs">
          Total
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

function LedgerRow({ app }: { app: ApplicationConnections }) {
  return (
    <TableRow>
      <TableCell className={NAME_CELL}>
        <ApplicationLabel name={app.applicationName} />
      </TableCell>
      {CONNECTION_STATES.map((state) => (
        <TableCell className={NUMERIC_CELL} key={state.key}>
          <Count value={app[state.key]} />
        </TableCell>
      ))}
      <TableCell className={cn(NUMERIC_CELL, "pr-0")}>
        <Count bold={true} value={app.totalConnections} />
      </TableCell>
    </TableRow>
  );
}

function LedgerFooter({ activity }: { activity: ConnectionActivityHealth }) {
  return (
    <TableFooter className="bg-transparent">
      <TableRow className="hover:bg-transparent">
        <TableCell className={cn(NAME_CELL, "font-medium")}>Total</TableCell>
        {CONNECTION_STATES.map((state) => (
          <TableCell
            className={cn(NUMERIC_CELL, "font-medium")}
            key={state.key}
          >
            <Count bold={true} value={activity[state.key]} />
          </TableCell>
        ))}
        <TableCell className={cn(NUMERIC_CELL, "pr-0 font-semibold")}>
          <Count bold={true} value={activity.totalConnections} />
        </TableCell>
      </TableRow>
    </TableFooter>
  );
}

/**
 * One row per application (top talkers first, as the backend orders them),
 * one column per state, instance totals in the footer. The totals row stays
 * authoritative even when by_application is capped or empty.
 */
function ApplicationLedger({
  activity,
}: {
  activity: ConnectionActivityHealth;
}) {
  const shown = activity.byApplication.slice(0, MAX_APPLICATION_ROWS);

  return (
    <Table className="text-xs">
      <LedgerHeader />
      <TableBody>
        {shown.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              className="py-4 pl-0 text-center text-muted-foreground text-xs"
              colSpan={LEDGER_COLUMNS}
            >
              No client connections right now.
            </TableCell>
          </TableRow>
        ) : (
          shown.map((app) => <LedgerRow app={app} key={app.applicationName} />)
        )}
      </TableBody>
      <LedgerFooter activity={activity} />
    </Table>
  );
}

/**
 * The card's one call to action, pinned to its bottom edge as a footer so it
 * reads as "where this leads" rather than a stray control in the title row.
 * Applications cut from the ledger are mentioned here, where the reader can
 * act on them. The focus ring is inset because the link bleeds to the card
 * edge and the card clips overflow.
 */
function SessionsFooterLink({
  activity,
  instanceId,
}: {
  activity: ConnectionActivityHealth | undefined;
  instanceId: string;
}) {
  const hidden = activity
    ? Math.max(0, activity.byApplication.length - MAX_APPLICATION_ROWS)
    : 0;
  return (
    <Link
      className="group -mx-6 mt-auto -mb-6 flex h-11 items-center justify-between gap-3 border-border border-t px-6 font-medium text-sm transition-colors hover:bg-foreground/[0.03] focus-visible:relative focus-visible:z-10 focus-visible:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      params={{ instanceId }}
      to="/instances/$instanceId/activity"
    >
      <span>View live sessions</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {hidden > 0 ? (
          <span className="font-normal text-xs">
            {hidden} more {hidden === 1 ? "application" : "applications"}
          </span>
        ) : null}
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </span>
    </Link>
  );
}

function ConnectionsCardBody({
  activity,
  isPending,
}: {
  activity: ConnectionActivityHealth | undefined;
  isPending: boolean;
}) {
  if (isPending && !activity) {
    return (
      <div className="h-full min-h-40 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
    );
  }

  // The card only renders for connected instances, so a missing payload means
  // the health check failed or pg_stat_activity was unreadable — never that
  // the instance is disconnected.
  if (!activity) {
    return (
      <EmptyState
        description="The health check did not return connection activity. Refresh to retry; if it keeps failing, the monitoring role may lack access to pg_stat_activity."
        icon={Users}
        title="Connection activity unavailable"
      />
    );
  }

  return (
    <>
      <CapacityLine activity={activity} />
      <ActivitySignals activity={activity} />
      <div className="flex flex-col gap-2">
        <StateLegend />
        <ApplicationLedger activity={activity} />
      </div>
    </>
  );
}

/**
 * Live connection composition from a pg_stat_activity snapshot
 * (CheckInstanceHealth), laid out as a ledger: a one-line capacity meter,
 * overlapping signals (lock waits, long transactions) as tinted rows, then a
 * table with one row per application and one column per state. Numbers over
 * bars, because the card has to read the same with two applications and with
 * thirty. The footer link routes to the Activity page, where sessions are
 * listed live.
 */
export function InstanceConnectionsCard({
  activity,
  instanceId,
  isPending,
}: InstanceConnectionsCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ConnectionsCardBody activity={activity} isPending={isPending} />
        <SessionsFooterLink activity={activity} instanceId={instanceId} />
      </CardContent>
    </Card>
  );
}
