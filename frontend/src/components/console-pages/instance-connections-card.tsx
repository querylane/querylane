import { Link } from "@tanstack/react-router";
import { ChevronRight, Lock, Timer, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
 * The disjoint pg_stat_activity states every bar in this card is colored by.
 * Lock waiters are NOT a state — they are a subset of active backends — so
 * they surface as an alert pill instead of a stack segment.
 */
const CONNECTION_STATES = [
  { className: "bg-chart-1", key: "activeConnections", label: "Active" },
  {
    className: "bg-muted-foreground/50",
    key: "idleConnections",
    label: "Idle",
  },
  {
    className: "bg-chart-4",
    key: "idleInTransactionConnections",
    label: "Idle in txn",
  },
] as const;

/** Shape shared by the instance totals and each by-application row. */
interface ConnectionStateCounts {
  activeConnections: number;
  idleConnections: number;
  idleInTransactionConnections: number;
  totalConnections: number;
}

const PERCENT = 100;
const MS_PER_SECOND = 1000;

function widthPercent(count: number, denominator: number): string {
  if (denominator <= 0) {
    return "0%";
  }

  return `${(count / denominator) * PERCENT}%`;
}

/**
 * Connections drawn as stacked state segments over a track sized by
 * `denominator` — the same encoding at both zoom levels (instance capacity,
 * single application).
 */
function SegmentedBar({
  className,
  counts,
  denominator,
}: {
  className?: string;
  counts: ConnectionStateCounts;
  denominator: number;
}) {
  const known = CONNECTION_STATES.reduce(
    (sum, state) => sum + counts[state.key],
    0
  );
  const other = Math.max(0, counts.totalConnections - known);

  return (
    <div
      className={cn(
        "flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      {CONNECTION_STATES.map((state) =>
        counts[state.key] > 0 ? (
          <div
            className={cn("h-full min-w-[3px]", state.className)}
            key={state.key}
            style={{ width: widthPercent(counts[state.key], denominator) }}
          />
        ) : null
      )}
      {other > 0 ? (
        <div
          className="h-full min-w-[3px] bg-muted-foreground/25"
          style={{ width: widthPercent(other, denominator) }}
        />
      ) : null}
    </div>
  );
}

/**
 * The hero: a composition bar over the connections that exist right now
 * (denominator = total), so it is always fully filled. Capacity ("n of
 * max_connections") is the header stat tile's job — repeating it here left a
 * nearly empty track at typical single-digit utilization.
 */
function CompositionBar({ activity }: { activity: ConnectionActivityHealth }) {
  const parts = CONNECTION_STATES.map(
    (state) => `${activity[state.key]} ${state.label.toLowerCase()}`
  ).join(", ");

  return (
    <div
      aria-label={`${activity.totalConnections} connections: ${parts}`}
      role="img"
    >
      <SegmentedBar
        className="h-2.5"
        counts={activity}
        denominator={Math.max(activity.totalConnections, 1)}
      />
    </div>
  );
}

/** Compact legend items; one line at the card's fixed column width. */
function StateLegend({ activity }: { activity: ConnectionActivityHealth }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {CONNECTION_STATES.map((state) => {
        const count = activity[state.key];
        return (
          <span className="flex items-center gap-1.5 text-xs" key={state.key}>
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-[3px]",
                state.className,
                count === 0 && "opacity-40"
              )}
            />
            <span className="text-muted-foreground">{state.label}</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                count === 0 && "text-muted-foreground/60"
              )}
            >
              {count}
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface ActivityAlert {
  icon: typeof Lock;
  iconClassName: string;
  key: string;
  text: string;
}

function collectAlerts(activity: ConnectionActivityHealth): ActivityAlert[] {
  const alerts: ActivityAlert[] = [];

  const waiting = activity.waitingForLockConnections;
  if (waiting > 0) {
    alerts.push({
      icon: Lock,
      iconClassName: "text-destructive",
      key: "waiting",
      text:
        waiting === 1
          ? "1 connection waiting on a lock"
          : `${waiting} connections waiting on locks`,
    });
  }

  const longRunning = activity.longRunningTransactionConnections;
  if (longRunning > 0) {
    const longest = formatElapsedDuration(
      Number(activity.longestTransactionSeconds) * MS_PER_SECOND
    );
    alerts.push({
      icon: Timer,
      iconClassName: "text-chart-4",
      key: "long-running",
      text:
        longRunning === 1
          ? `1 transaction open for ${longest}`
          : `${longRunning} long transactions · longest open ${longest}`,
    });
  }

  return alerts;
}

/**
 * Lock waits and long-running transactions overlap the state counts, so they
 * render as standalone signals — loud when present, absent when healthy.
 */
function ActivityAlerts({ activity }: { activity: ConnectionActivityHealth }) {
  const alerts = collectAlerts(activity);
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-medium text-xs"
          key={alert.key}
        >
          <alert.icon
            aria-hidden="true"
            className={cn("size-3.5", alert.iconClassName)}
          />
          {alert.text}
        </span>
      ))}
    </div>
  );
}

/** Sentinel the backend emits for backends that set no application_name. */
const UNNAMED_APPLICATION = "(unnamed)";

function ApplicationLabel({ name }: { name: string }) {
  if (name === UNNAMED_APPLICATION) {
    return (
      <span
        className="w-24 shrink-0 truncate text-muted-foreground text-xs italic"
        title="Clients that don't set application_name"
      >
        {"no name set"}
      </span>
    );
  }

  return (
    <span className="w-24 shrink-0 truncate font-mono text-xs" title={name}>
      {name}
    </span>
  );
}

function ApplicationRow({
  app,
  maxTotal,
}: {
  app: ApplicationConnections;
  maxTotal: number;
}) {
  const split = `${app.activeConnections} active · ${app.idleConnections} idle · ${app.idleInTransactionConnections} idle in txn`;

  return (
    <div className="flex items-center gap-3" title={split}>
      <ApplicationLabel name={app.applicationName} />
      <SegmentedBar
        className="min-w-0 flex-1"
        counts={app}
        denominator={maxTotal}
      />
      <span className="w-8 shrink-0 text-right font-medium text-sm tabular-nums">
        {app.totalConnections}
      </span>
    </div>
  );
}

function ByApplication({ apps }: { apps: ApplicationConnections[] }) {
  const maxTotal = apps.reduce(
    (max, app) => Math.max(max, app.totalConnections),
    0
  );

  return (
    // mt-auto pins this section to the card's bottom edge, so a stretched
    // card distributes its sections instead of pooling empty space below.
    <div className="mt-auto space-y-3">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        {"By application"}
      </span>
      <div className="space-y-2">
        {apps.map((app) => (
          <ApplicationRow
            app={app}
            key={app.applicationName}
            maxTotal={maxTotal}
          />
        ))}
      </div>
    </div>
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
      <div className="h-full min-h-40 animate-pulse rounded-lg bg-muted/40" />
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
      <div className="space-y-2.5">
        <CompositionBar activity={activity} />
        <StateLegend activity={activity} />
      </div>
      <ActivityAlerts activity={activity} />
      {activity.byApplication.length > 0 ? (
        <ByApplication apps={activity.byApplication} />
      ) : null}
    </>
  );
}

/**
 * Live connection composition from a pg_stat_activity snapshot
 * (CheckInstanceHealth). One visual language throughout: every bar is the
 * current connections colored by state, first for the whole instance, then
 * per application. Capacity vs max_connections lives in the header stat
 * tile, not here. Overlapping signals (lock waits, long transactions) render
 * as alert pills rather than stack segments. The header action routes to the
 * Activity page, where sessions are listed live.
 */
export function InstanceConnectionsCard({
  activity,
  instanceId,
  isPending,
}: InstanceConnectionsCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{"Connections"}</CardTitle>
        <CardAction className="-my-1.5">
          <Link
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "text-muted-foreground"
            )}
            params={{ instanceId }}
            to="/instances/$instanceId/activity"
          >
            {"Activity"}
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <ConnectionsCardBody activity={activity} isPending={isPending} />
      </CardContent>
    </Card>
  );
}
