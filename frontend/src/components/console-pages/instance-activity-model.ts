interface ActivitySessionLike {
  applicationName: string;
  backendAgeSeconds?: bigint | number | undefined;
  blockedByPid?: number | undefined;
  clientAddress?: string | undefined;
  clientPort?: number | undefined;
  databaseName: string;
  durationSeconds: bigint | number;
  pid: number;
  query: string;
  queryAgeSeconds?: bigint | number | undefined;
  state: string;
  transactionAgeSeconds?: bigint | number | undefined;
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
  hint: string;
  label: string;
  tone: "default" | "danger" | "warning";
  value: string;
}

// Plain-language explanations surfaced as tooltips on each stat, since the
// pg_stat_activity vocabulary trips up anyone who isn't a Postgres operator.
const ACTIVE_HINT = "Sessions running a query right now.";
const IDLE_HINT =
  "Connected but sitting idle, waiting for the client to send its next command.";
const IDLE_IN_TRANSACTION_HINT =
  "Inside an open transaction but not running a query. These hold locks and can block other sessions.";
const WAITING_HINT = "Blocked, waiting on a lock that another session holds.";
const OLDEST_TRANSACTION_HINT =
  "How long the oldest transaction has been open. Long ones bloat tables and keep locks held.";

interface ActivitySessionFilters {
  app: string | null;
  database: string | null;
  search: string;
  state: string | null;
}

interface ActivitySessionRow {
  app: string;
  backendAgeSeconds: number | null;
  blockedByPid: number;
  client: string;
  database: string;
  duration: string;
  durationHot: boolean;
  durationSeconds: number;
  pid: number;
  query: string;
  queryAgeSeconds: number | null;
  state: string;
  stateTone: "default" | "success" | "warning";
  transactionAgeSeconds: number | null;
  user: string;
  wait: string;
  waitExplanation: string | null;
}

interface SessionTimelineItem {
  hot: boolean;
  label: string;
  muted: boolean;
  value: string;
}

interface ActivityBlockingChain {
  blocked: ActivitySessionRow[];
  blocker: ActivitySessionRow | null;
  blockerPid: number;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const LONG_TRANSACTION_WARNING_SECONDS = 300;
const EMPTY_FILTER_VALUE: null = null;

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
  if (!activity) {
    return [
      { hint: ACTIVE_HINT, label: "Active", tone: "default", value: "—" },
      { hint: IDLE_HINT, label: "Idle", tone: "default", value: "—" },
      {
        hint: IDLE_IN_TRANSACTION_HINT,
        label: "Idle in transaction",
        tone: "default",
        value: "—",
      },
      { hint: WAITING_HINT, label: "Waiting", tone: "default", value: "—" },
      {
        hint: OLDEST_TRANSACTION_HINT,
        label: "Oldest transaction",
        tone: "default",
        value: "—",
      },
    ];
  }

  const idleInTransaction = safeCount(activity?.idleInTransactionConnections);
  const waiting = safeCount(activity?.waitingForLockConnections);

  return [
    {
      hint: ACTIVE_HINT,
      label: "Active",
      tone: "default",
      value: formatCount(activity?.activeConnections),
    },
    {
      hint: IDLE_HINT,
      label: "Idle",
      tone: "default",
      value: formatCount(activity?.idleConnections),
    },
    {
      hint: IDLE_IN_TRANSACTION_HINT,
      label: "Idle in transaction",
      tone: idleInTransaction > 0 ? "warning" : "default",
      value: formatCount(idleInTransaction),
    },
    {
      hint: WAITING_HINT,
      label: "Waiting",
      tone: waiting > 0 ? "danger" : "default",
      value: formatCount(waiting),
    },
    {
      hint: OLDEST_TRANSACTION_HINT,
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

// Plain-language explanations for pg_stat_activity wait_event_type values,
// mirroring the tone of the stat-bar hints above. Keys are PostgreSQL's own
// names, hence the Map instead of an object literal.
const WAIT_EVENT_TYPE_HINTS = new Map<string, string>([
  ["Activity", "Idle and waiting for work — the normal resting state."],
  ["BufferPin", "Waiting for exclusive access to a shared data buffer."],
  ["Client", "Waiting on the client to send or receive data over the network."],
  ["Extension", "Waiting inside an extension module."],
  ["IO", "Waiting for a disk read or write to finish."],
  ["IPC", "Waiting for another server process to respond."],
  [
    "Lock",
    "Waiting for a lock held by another session; it cannot proceed until that lock is released.",
  ],
  ["LWLock", "Waiting on a short internal memory lock, usually brief."],
  [
    "Timeout",
    "Sleeping in a timed wait, such as pg_sleep or a throttle delay.",
  ],
]);

function toOptionalSeconds(value: bigint | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function formatSessionClient(session: ActivitySessionLike): string {
  const address = (session.clientAddress ?? "").trim();
  if (address.length === 0) {
    return "local socket";
  }
  const port = session.clientPort ?? 0;
  return port > 0 ? `${address}:${port}` : address;
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
  const wait = getSessionWait(session);
  const waitEventType = (session.waitEventType ?? "").trim();
  return {
    app: normalizeApplicationName(session.applicationName),
    backendAgeSeconds: toOptionalSeconds(session.backendAgeSeconds),
    blockedByPid: safeCount(session.blockedByPid),
    client: formatSessionClient(session),
    database: normalizeActivityValue(session.databaseName),
    duration: formatActivityDuration(durationSeconds),
    durationHot:
      durationSeconds >= LONG_TRANSACTION_WARNING_SECONDS ||
      state.startsWith("idle in transaction") ||
      Boolean(session.blockedByPid),
    durationSeconds,
    pid: safeCount(session.pid),
    query: normalizeActivityValue(session.query),
    queryAgeSeconds: toOptionalSeconds(session.queryAgeSeconds),
    state,
    stateTone: getSessionStateTone(state),
    transactionAgeSeconds: toOptionalSeconds(session.transactionAgeSeconds),
    user: normalizeActivityValue(session.username),
    wait,
    waitExplanation:
      wait.length > 0
        ? (WAIT_EVENT_TYPE_HINTS.get(waitEventType) ?? null)
        : null,
  };
}

// The three ages answer "how did this session get into its current state":
// how long the client has been connected, how long its transaction has been
// open, and how long the current (or most recent) query has been running.
function presentSessionTimeline(
  row: ActivitySessionRow
): SessionTimelineItem[] {
  const transactionHot =
    row.transactionAgeSeconds !== null &&
    row.transactionAgeSeconds >= LONG_TRANSACTION_WARNING_SECONDS;
  const queryHot =
    row.state === "active" &&
    row.queryAgeSeconds !== null &&
    row.queryAgeSeconds >= LONG_TRANSACTION_WARNING_SECONDS;

  let queryValue = "none yet";
  if (row.queryAgeSeconds !== null) {
    queryValue =
      row.state === "active"
        ? `running for ${formatActivityDuration(row.queryAgeSeconds)}`
        : `last started ${formatActivityDuration(row.queryAgeSeconds)} ago`;
  }

  return [
    {
      hot: false,
      label: "Connected",
      muted: row.backendAgeSeconds === null,
      value:
        row.backendAgeSeconds === null
          ? "—"
          : `${formatActivityDuration(row.backendAgeSeconds)} ago`,
    },
    {
      hot: transactionHot,
      label: "Transaction",
      muted: row.transactionAgeSeconds === null,
      value:
        row.transactionAgeSeconds === null
          ? "none open"
          : `open for ${formatActivityDuration(row.transactionAgeSeconds)}`,
    },
    {
      hot: queryHot,
      label: row.state === "active" ? "Query" : "Last query",
      muted: row.queryAgeSeconds === null,
      value: queryValue,
    },
  ];
}

function matchesFilter(value: string, filterValue: string | null) {
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
  return uniqueSorted(rows.map((row) => row[key]));
}

function getActivityBlockingChains(
  rows: readonly ActivitySessionRow[]
): ActivityBlockingChain[] {
  const blocked = rows.filter((row) => row.blockedByPid > 0);
  const blockerPids = [...new Set(blocked.map((row) => row.blockedByPid))];

  return blockerPids.map((blockerPid) => ({
    blocked: blocked.filter((row) => row.blockedByPid === blockerPid),
    blocker: rows.find((row) => row.pid === blockerPid) ?? null,
    blockerPid,
  }));
}

export type { ActivityStat, SessionTimelineItem };
export {
  EMPTY_FILTER_VALUE,
  formatActivityDuration,
  getActivityBlockingChains,
  presentActivityFilterOptions,
  presentActivitySessionRows,
  presentActivityStats,
  presentSessionTimeline,
};
