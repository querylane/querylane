interface ActivitySessionLike {
  applicationName: string;
  blockedByPid?: number | undefined;
  databaseName: string;
  durationSeconds: bigint | number;
  pid: number;
  query: string;
  state: string;
  username: string;
  waitEvent?: string | undefined;
  waitEventType?: string | undefined;
}

interface ActivityLike {
  activeConnections?: number | undefined;
  idleConnections?: number | undefined;
  idleInTransactionConnections?: number | undefined;
  longestTransactionSeconds?: bigint | number | undefined;
  sessions?: readonly ActivitySessionLike[] | undefined;
  waitingForLockConnections?: number | undefined;
}

interface ActivityStat {
  label: string;
  tone: "default" | "danger" | "warning";
  value: string;
}

interface ActivitySessionFilters {
  app: string;
  database: string;
  search: string;
  state: string;
}

interface ActivitySessionRow {
  app: string;
  blockedByPid: number;
  database: string;
  duration: string;
  durationHot: boolean;
  pid: number;
  query: string;
  state: string;
  stateTone: "default" | "success" | "warning";
  user: string;
  wait: string;
}

interface ActivityBlockingChain {
  blocked: ActivitySessionRow[];
  blocker: ActivitySessionRow;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const LONG_TRANSACTION_WARNING_SECONDS = 300;
const EMPTY_FILTER_VALUE = "All";

function safeCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function formatCount(value: number | undefined) {
  return safeCount(value).toLocaleString();
}

function formatActivityDuration(value: bigint | number | undefined): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value ?? 0)));
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${totalSeconds}s`;
  }

  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function presentActivityStats(
  activity: ActivityLike | undefined
): ActivityStat[] {
  const idleInTransaction = safeCount(activity?.idleInTransactionConnections);
  const waiting = safeCount(activity?.waitingForLockConnections);

  return [
    {
      label: "Active",
      tone: "default",
      value: formatCount(activity?.activeConnections),
    },
    {
      label: "Idle",
      tone: "default",
      value: formatCount(activity?.idleConnections),
    },
    {
      label: "Idle in transaction",
      tone: idleInTransaction > 0 ? "warning" : "default",
      value: formatCount(idleInTransaction),
    },
    {
      label: "Waiting",
      tone: waiting > 0 ? "danger" : "default",
      value: formatCount(waiting),
    },
    {
      label: "Oldest transaction",
      tone:
        Number(activity?.longestTransactionSeconds ?? 0) >=
        LONG_TRANSACTION_WARNING_SECONDS
          ? "warning"
          : "default",
      value: formatActivityDuration(activity?.longestTransactionSeconds),
    },
  ];
}

function normalizeApplicationName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "(unnamed)";
}

function normalizeActivityValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "—";
}

function getSessionStateTone(state: string): ActivitySessionRow["stateTone"] {
  if (state === "active") {
    return "success";
  }
  if (state.startsWith("idle in transaction")) {
    return "warning";
  }
  return "default";
}

function getSessionWait(session: ActivitySessionLike): string {
  const waitEventType = normalizeActivityValue(session.waitEventType ?? "");
  const waitEvent = normalizeActivityValue(session.waitEvent ?? "");
  if (waitEventType === "—" && waitEvent === "—") {
    return "";
  }
  if (waitEventType === "—") {
    return waitEvent;
  }
  if (waitEvent === "—") {
    return waitEventType;
  }
  return `${waitEventType} · ${waitEvent}`;
}

function presentActivitySessionRow(
  session: ActivitySessionLike
): ActivitySessionRow {
  const durationSeconds = Math.max(
    0,
    Math.floor(Number(session.durationSeconds))
  );
  const state = normalizeActivityValue(session.state);
  return {
    app: normalizeApplicationName(session.applicationName),
    blockedByPid: safeCount(session.blockedByPid),
    database: normalizeActivityValue(session.databaseName),
    duration: formatActivityDuration(durationSeconds),
    durationHot:
      durationSeconds >= LONG_TRANSACTION_WARNING_SECONDS ||
      state.startsWith("idle in transaction") ||
      Boolean(session.blockedByPid),
    pid: safeCount(session.pid),
    query: normalizeActivityValue(session.query),
    state,
    stateTone: getSessionStateTone(state),
    user: normalizeActivityValue(session.username),
    wait: getSessionWait(session),
  };
}

function matchesFilter(value: string, filterValue: string) {
  return filterValue === EMPTY_FILTER_VALUE || value === filterValue;
}

function presentActivitySessionRows(
  activity: ActivityLike | undefined,
  filters: ActivitySessionFilters
): ActivitySessionRow[] {
  const normalizedSearch = filters.search.trim().toLowerCase();
  return (activity?.sessions ?? [])
    .map(presentActivitySessionRow)
    .filter(
      (session) =>
        matchesFilter(session.state, filters.state) &&
        matchesFilter(session.app, filters.app) &&
        matchesFilter(session.database, filters.database) &&
        (normalizedSearch.length === 0 ||
          [
            String(session.pid),
            session.user,
            session.app,
            session.database,
            session.state,
            session.query,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch))
    );
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function presentActivityFilterOptions(
  rows: readonly ActivitySessionRow[],
  key: "app" | "database" | "state"
): string[] {
  return [EMPTY_FILTER_VALUE, ...uniqueSorted(rows.map((row) => row[key]))];
}

function getActivityBlockingChain(
  rows: readonly ActivitySessionRow[]
): ActivityBlockingChain | null {
  const blocked = rows.filter((row) => row.blockedByPid > 0);
  if (blocked.length === 0) {
    return null;
  }

  const blockerPid = blocked[0]?.blockedByPid ?? 0;
  const blocker = rows.find((row) => row.pid === blockerPid);
  if (!blocker) {
    return null;
  }

  return {
    blocked: blocked.filter((row) => row.blockedByPid === blockerPid),
    blocker,
  };
}

export type { ActivityStat };
export {
  EMPTY_FILTER_VALUE,
  formatActivityDuration,
  getActivityBlockingChain,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
};
