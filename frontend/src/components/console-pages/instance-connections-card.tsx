import { Lock, Timer, Users } from "lucide-react";
import { SectionCard } from "@/components/console-pages/console-layout";
import { EmptyState } from "@/components/empty-state";
import { formatElapsedDuration } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type {
  ApplicationConnections,
  ConnectionActivityHealth,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

interface InstanceConnectionsCardProps {
  activity: ConnectionActivityHealth | undefined;
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

function StateLegend({ activity }: { activity: ConnectionActivityHealth }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {CONNECTION_STATES.map((state) => (
        <span className="flex items-center gap-1.5 text-xs" key={state.key}>
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-[3px]", state.className)}
          />
          <span className="text-muted-foreground">{state.label}</span>
          <span className="font-medium tabular-nums">
            {activity[state.key]}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The hero: a meter whose full track is max_connections, filled with the live
 * state composition. The bar itself answers "how close to the limit, and what
 * is the usage made of" with a single denominator.
 */
function CapacityMeter({ activity }: { activity: ConnectionActivityHealth }) {
  const denominator = Math.max(
    activity.maxConnections,
    activity.totalConnections,
    1
  );
  const free = Math.max(0, activity.maxConnections - activity.totalConnections);

  return (
    <div className="space-y-2.5">
      <SegmentedBar
        className="h-2.5"
        counts={activity}
        denominator={denominator}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <StateLegend activity={activity} />
        {activity.maxConnections > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {free} free · max {activity.maxConnections}
          </span>
        ) : null}
      </div>
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
 * Lock waits and long-running transactions overlap the state counts above, so
 * they render as standalone signals — loud when present, absent when healthy.
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
        className="w-36 shrink-0 truncate text-muted-foreground text-xs italic"
        title="Clients that don't set application_name"
      >
        no name set
      </span>
    );
  }

  return (
    <span className="w-36 shrink-0 truncate font-mono text-xs" title={name}>
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

/**
 * With a single application a ranking bar is a chart with nothing to compare
 * — its one bar is always full width. A sentence carries the same fact
 * honestly, and spells out what an unnamed application means.
 */
function SingleApplicationSummary({ app }: { app: ApplicationConnections }) {
  const count = app.totalConnections;
  const subject =
    count === 1 ? "The only connection" : `All ${count} connections`;
  const verb = count === 1 ? "comes" : "come";

  if (app.applicationName === UNNAMED_APPLICATION) {
    return (
      <p className="text-muted-foreground text-sm">
        {subject} {verb} from clients that don't set an application name.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-sm">
      {subject} {verb} from{" "}
      <span className="font-mono text-foreground text-xs">
        {app.applicationName}
      </span>
      .
    </p>
  );
}

function ByApplication({ apps }: { apps: ApplicationConnections[] }) {
  const maxTotal = apps.reduce(
    (max, app) => Math.max(max, app.totalConnections),
    0
  );
  const [onlyApp] = apps;

  return (
    <div className="space-y-3">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        By application
      </span>
      {apps.length === 1 && onlyApp ? (
        <SingleApplicationSummary app={onlyApp} />
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <ApplicationRow
              app={app}
              key={app.applicationName}
              maxTotal={maxTotal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Live connection pressure from a pg_stat_activity snapshot
 * (CheckInstanceHealth). One visual language throughout: every bar is
 * connections colored by state, first at instance capacity, then per
 * application. Overlapping signals (lock waits, long transactions) render as
 * alert pills rather than stack segments.
 */
export function InstanceConnectionsCard({
  activity,
  isPending,
}: InstanceConnectionsCardProps) {
  if (isPending && !activity) {
    return (
      <SectionCard title="Connections">
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted/40" />
      </SectionCard>
    );
  }

  // The card only renders for connected instances, so a missing payload means
  // the health check failed or pg_stat_activity was unreadable — never that
  // the instance is disconnected.
  if (!activity) {
    return (
      <SectionCard title="Connections">
        <EmptyState
          description="The health check did not return connection activity. Refresh to retry; if it keeps failing, the monitoring role may lack access to pg_stat_activity."
          icon={Users}
          title="Connection activity unavailable"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Connections">
      <div className="space-y-5">
        <CapacityMeter activity={activity} />
        <ActivityAlerts activity={activity} />
        {activity.byApplication.length > 0 ? (
          <ByApplication apps={activity.byApplication} />
        ) : null}
      </div>
    </SectionCard>
  );
}
