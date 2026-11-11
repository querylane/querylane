import { anyUnpack, timestampDate } from "@bufbuild/protobuf/wkt";
import {
  DEFAULT_POSTGRES_PORT,
  type InstanceRecord,
} from "@/components/console-pages/instance-config-model";
import { observationAvailabilityLabel } from "@/components/console-pages/pg19-observation";
import {
  type DbConnectionStatus,
  formatBytes,
  formatUptime,
} from "@/lib/console-resources";
import { describeInstanceConnectionError } from "@/lib/instance-connection-error";
import { parsePostgresPlatform } from "@/lib/postgres-platform";
import {
  formatReplicationRole,
  formatSslMode,
  formatSslNegotiation,
} from "@/lib/protobuf-enums";
import { formatInsightMs } from "@/lib/query-insights";
import { isNonEmptyString } from "@/lib/value-guards";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type {
  AutovacuumHealth,
  ConnectionActivityHealth,
  InstanceHealth,
  LockStatistics,
  PgStatStatementsHealth,
  PostgresConfig,
  RecoveryHealth,
  ReplicationHealth,
  ServerInfo,
  StatsAccessHealth,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  HealthCheckStatus,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  ServerInfo_ReplicationRole,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import { ObservationAvailability } from "@/protogen/querylane/console/v1alpha1/observation_pb";

type HealthRowTone = "error" | "muted" | "ok" | "warning";

interface HealthRowDetail {
  label: string;
  value: string;
}

interface HealthRowModel {
  detail: HealthRowDetail[];
  id: string;
  label: string;
  summary: string;
  tone: HealthRowTone;
}

const HEALTH_CHECK_KEYS = [
  "connection_activity",
  "replication",
  "stats_access",
  "pg_stat_statements",
  "autovacuum",
  "lock_statistics",
] as const;

type HealthCheckKey = (typeof HEALTH_CHECK_KEYS)[number];
type HealthCheckPartialReasons = Partial<Record<HealthCheckKey, string>>;

function isHealthCheckKey(value: string | undefined): value is HealthCheckKey {
  return HEALTH_CHECK_KEYS.some((key) => key === value);
}

function getHealthCheckKeyFromDetail(
  detail: Status["details"][number]
): HealthCheckKey | undefined {
  try {
    const errorInfo = anyUnpack(detail, ErrorInfoSchema);
    const check = errorInfo?.metadata["check"];
    return isHealthCheckKey(check) ? check : undefined;
  } catch {
    return undefined;
  }
}

function resolveReportedReplicationRole(
  healthRole: ServerInfo_ReplicationRole,
  serverRole: ServerInfo_ReplicationRole | undefined
): ServerInfo_ReplicationRole {
  return serverRole === undefined ||
    serverRole === ServerInfo_ReplicationRole.UNSPECIFIED
    ? healthRole
    : serverRole;
}

/**
 * Maps CheckInstanceHealth partial errors to their category via the
 * google.rpc.ErrorInfo "check" metadata key, keeping the human message.
 */
function getHealthCheckPartialReasons(
  partialErrors: Status[] | undefined
): HealthCheckPartialReasons {
  const reasons: HealthCheckPartialReasons = {};

  for (const partialError of partialErrors ?? []) {
    for (const detail of partialError.details) {
      const check = getHealthCheckKeyFromDetail(detail);
      if (check) {
        reasons[check] = partialError.message || "Check unavailable";
      }
    }
  }

  return reasons;
}

function toneFromHealthCheckStatus(status: HealthCheckStatus): HealthRowTone {
  switch (status) {
    case HealthCheckStatus.OK:
      return "ok";
    case HealthCheckStatus.WARNING:
      return "warning";
    case HealthCheckStatus.ERROR:
      return "error";
    case HealthCheckStatus.UNSPECIFIED:
    case HealthCheckStatus.UNKNOWN:
    case HealthCheckStatus.NOT_APPLICABLE:
    default:
      return "muted";
  }
}

const PERCENT_MULTIPLIER = 100;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1000;

function formatShortDuration(totalSeconds: number): string {
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${totalSeconds}s`;
  }
  if (totalSeconds < SECONDS_PER_HOUR) {
    return `${Math.floor(totalSeconds / SECONDS_PER_MINUTE)}m`;
  }
  if (totalSeconds < SECONDS_PER_DAY) {
    return `${Math.floor(totalSeconds / SECONDS_PER_HOUR)}h`;
  }
  return `${Math.floor(totalSeconds / SECONDS_PER_DAY)}d`;
}

/** Formats a protobuf timestamp as a coarse "18m ago" style label. */
function formatTimeAgo(
  timestamp: Parameters<typeof timestampDate>[0] | undefined
): string | null {
  if (!timestamp) {
    return null;
  }

  try {
    const diffMs = Date.now() - timestampDate(timestamp).getTime();
    if (diffMs < 0) {
      return null;
    }
    const totalSeconds = Math.floor(diffMs / MS_PER_SECOND);
    if (totalSeconds < SECONDS_PER_MINUTE) {
      return "just now";
    }
    return `${formatShortDuration(totalSeconds)} ago`;
  } catch {
    return null;
  }
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function unavailableRow({
  id,
  label,
  reason,
}: {
  id: string;
  label: string;
  reason: string | undefined;
}): HealthRowModel {
  const value = isNonEmptyString(reason?.trim())
    ? reason?.trim()
    : "Not reported by the latest health check.";
  return {
    detail: [{ label: "Reason", value }],
    id,
    label,
    summary: isNonEmptyString(reason?.trim()) ? reason?.trim() : "No data",
    tone: isNonEmptyString(reason?.trim()) ? "error" : "muted",
  };
}

function buildConnectionActivityRow(
  activity: ConnectionActivityHealth | undefined,
  reason: string | undefined
): HealthRowModel {
  if (!activity) {
    return unavailableRow({ id: "connections", label: "Connections", reason });
  }

  const lockWaiters = activity.waitingForLockConnections;
  const summary = [
    `${Math.round(activity.utilizationRatio * PERCENT_MULTIPLIER)}% used`,
    `${activity.activeConnections} active`,
    lockWaiters > 0 ? `${lockWaiters} waiting on locks` : "no lock waits",
  ].join(" · ");

  const longRunning = activity.longRunningTransactionConnections;
  const longestSeconds = Number(activity.longestTransactionSeconds);
  return {
    detail: [
      {
        label: "Total connections",
        value: `${activity.totalConnections} of ${activity.maxConnections}`,
      },
      { label: "Active", value: String(activity.activeConnections) },
      { label: "Idle", value: String(activity.idleConnections) },
      {
        label: "Idle in transaction",
        value: String(activity.idleInTransactionConnections),
      },
      { label: "Waiting on locks", value: String(lockWaiters) },
      {
        label: "Long-running transactions",
        value:
          longRunning > 0
            ? `${longRunning} (longest ${formatShortDuration(longestSeconds)})`
            : "0",
      },
    ],
    id: "connections",
    label: "Connections",
    summary,
    tone: toneFromHealthCheckStatus(activity.status),
  };
}

function recoveryNeedsAttention(recovery: RecoveryHealth | undefined) {
  if (
    !recovery ||
    recovery.availability !== ObservationAvailability.AVAILABLE
  ) {
    return false;
  }
  return (
    recovery.pauseState === "paused" ||
    recovery.pauseState === "pause requested" ||
    recovery.promotionTriggered
  );
}

function recoveryDetails(
  recovery: RecoveryHealth | undefined
): HealthRowDetail[] {
  const detail: HealthRowDetail[] = [
    {
      label: "Recovery",
      value: observationAvailabilityLabel(
        recovery?.availability ?? ObservationAvailability.UNSPECIFIED
      ),
    },
  ];
  if (
    !recovery ||
    recovery.availability !== ObservationAvailability.AVAILABLE
  ) {
    return detail;
  }
  return [
    ...detail,
    { label: "Recovery pause state", value: recovery.pauseState || "Unknown" },
    {
      label: "Promotion triggered",
      value: formatYesNo(recovery.promotionTriggered),
    },
    { label: "Replay end LSN", value: recovery.replayEndLsn || "Unknown" },
    {
      label: "Replay timeline",
      value:
        recovery.replayTimeline > 0
          ? String(recovery.replayTimeline)
          : "Unknown",
    },
  ];
}

function primaryReplicationDetails(
  replication: ReplicationHealth
): HealthRowDetail[] {
  return [
    {
      label: "Attached replicas",
      value: replication.statisticsVisible
        ? String(replication.attachedReplicas)
        : "Unknown",
    },
    {
      label: "Streaming replicas",
      value: replication.statisticsVisible
        ? String(replication.streamingReplicas)
        : "Unknown",
    },
    {
      label: "Synchronous replicas",
      value: replication.statisticsVisible
        ? String(replication.synchronousReplicas)
        : "Unknown",
    },
    {
      label: "Max replication lag",
      value: replication.statisticsVisible
        ? formatBytes(replication.maxReplicationLagBytes)
        : "Unknown",
    },
  ];
}

function replicaReplicationDetails(
  replication: ReplicationHealth
): HealthRowDetail[] {
  return [
    {
      label: "WAL receiver",
      value: replication.walReceiverActive ? "Active" : "Not active",
    },
    {
      label: "Last transaction replay age",
      value: replication.replayLagKnown
        ? formatShortDuration(Number(replication.replayLagSeconds))
        : "Unknown",
    },
  ];
}

function replicationSummary(
  replication: ReplicationHealth,
  role: ServerInfo_ReplicationRole
) {
  const roleLabel = formatReplicationRole(role);
  if (role !== replication.role) {
    return `Health check reports ${formatReplicationRole(replication.role)}. Server info reports ${roleLabel}.`;
  }
  let summary = `${roleLabel} · detailed replication statistics unavailable`;
  if (replication.statisticsVisible) {
    summary =
      replication.summary.trim() ||
      `${roleLabel} · ${replication.streamingReplicas} streaming`;
  }
  const { recovery } = replication;
  if (recovery && recoveryNeedsAttention(recovery)) {
    summary += recovery.promotionTriggered
      ? " · promotion triggered"
      : ` · recovery ${recovery.pauseState}`;
  }
  return summary;
}

function replicationTone(
  replication: ReplicationHealth,
  rolesDisagree: boolean
): HealthRowTone {
  if (replication.status === HealthCheckStatus.ERROR) {
    return "error";
  }
  if (rolesDisagree || recoveryNeedsAttention(replication.recovery)) {
    return "warning";
  }
  return replication.statisticsVisible
    ? toneFromHealthCheckStatus(replication.status)
    : "muted";
}

function buildReplicationRow(
  replication: ReplicationHealth | undefined,
  reason: string | undefined,
  serverReplicationRole: ServerInfo_ReplicationRole | undefined
): HealthRowModel {
  if (!replication) {
    return unavailableRow({ id: "replication", label: "Replication", reason });
  }
  const role = resolveReportedReplicationRole(
    replication.role,
    serverReplicationRole
  );
  const roleDetails =
    role === ServerInfo_ReplicationRole.REPLICA
      ? replicaReplicationDetails(replication)
      : primaryReplicationDetails(replication);

  return {
    detail: [
      { label: "Role", value: formatReplicationRole(role) },
      ...roleDetails,
      ...recoveryDetails(replication.recovery),
    ],
    id: "replication",
    label: "Replication",
    summary: replicationSummary(replication, role),
    tone: replicationTone(replication, role !== replication.role),
  };
}

function statsAccessLevelLabel(statsAccess: StatsAccessHealth): string {
  if (statsAccess.superuser) {
    return "superuser";
  }
  if (statsAccess.pgMonitorMember) {
    return "pg_monitor";
  }
  if (statsAccess.pgReadAllStatsMember) {
    return "pg_read_all_stats";
  }
  return "limited visibility";
}

function buildStatsAccessRow(
  statsAccess: StatsAccessHealth | undefined,
  reason: string | undefined
): HealthRowModel {
  if (!statsAccess) {
    return unavailableRow({
      id: "stats-access",
      label: "Stats access",
      reason,
    });
  }

  const summary =
    statsAccess.summary.trim() ||
    `${statsAccess.currentUser} · ${statsAccessLevelLabel(statsAccess)}`;
  return {
    detail: [
      { label: "Connected role", value: statsAccess.currentUser || "—" },
      { label: "Superuser", value: formatYesNo(statsAccess.superuser) },
      {
        label: "pg_monitor privileges effective",
        value: formatYesNo(statsAccess.pgMonitorMember),
      },
      {
        label: "pg_read_all_stats privileges effective",
        value: formatYesNo(statsAccess.pgReadAllStatsMember),
      },
      {
        label: "pg_stat_activity readable",
        value: formatYesNo(statsAccess.canReadPgStatActivity),
      },
      {
        label: "pg_stat_database readable",
        value: formatYesNo(statsAccess.canReadPgStatDatabase),
      },
    ],
    id: "stats-access",
    label: "Stats access",
    summary,
    tone: toneFromHealthCheckStatus(statsAccess.status),
  };
}

function pgStatStatementsSummary(pgss: PgStatStatementsHealth): string {
  if (pgss.summary.trim()) {
    return pgss.summary.trim();
  }
  if (!pgss.extensionInstalled) {
    return "Not installed";
  }
  if (!pgss.sharedPreloadConfigured) {
    return "Installed but not loaded (needs shared_preload_libraries)";
  }
  if (pgss.viewQueryable) {
    return `${pgss.trackMode || "tracking"} · ${pgss.statementCount} statements`;
  }
  return "Installed but the view is not readable";
}

function buildPgStatStatementsRow(
  pgss: PgStatStatementsHealth | undefined,
  reason: string | undefined
): HealthRowModel {
  if (!pgss) {
    return unavailableRow({
      id: "pg-stat-statements",
      label: "pg_stat_statements",
      reason,
    });
  }

  const versionSuffix = pgss.extensionVersion
    ? ` (v${pgss.extensionVersion})`
    : "";
  const installedValue = pgss.extensionInstalled ? `Yes${versionSuffix}` : "No";
  const detail: HealthRowDetail[] = [
    { label: "Installed", value: installedValue },
    {
      label: "shared_preload_libraries",
      value: pgss.sharedPreloadConfigured ? "Configured" : "Not configured",
    },
    { label: "Track mode", value: pgss.trackMode || "—" },
    { label: "View queryable", value: formatYesNo(pgss.viewQueryable) },
  ];
  if (pgss.viewQueryable) {
    detail.push({
      label: "Statements tracked",
      value: String(pgss.statementCount),
    });
  }
  const resetAgo = formatTimeAgo(pgss.statsResetAt);
  if (isNonEmptyString(resetAgo)) {
    detail.push({ label: "Stats reset", value: resetAgo });
  }

  return {
    detail,
    id: "pg-stat-statements",
    label: "pg_stat_statements",
    summary: pgStatStatementsSummary(pgss),
    tone: toneFromHealthCheckStatus(pgss.status),
  };
}

function buildAutovacuumRow(
  autovacuum: AutovacuumHealth | undefined,
  reason: string | undefined
): HealthRowModel {
  if (!autovacuum) {
    return unavailableRow({ id: "autovacuum", label: "Autovacuum", reason });
  }

  const lastRunAgo = formatTimeAgo(autovacuum.lastAutovacuumAt);
  const summary =
    autovacuum.summary.trim() ||
    [
      `${autovacuum.runningWorkers} of ${autovacuum.maxWorkers} workers`,
      isNonEmptyString(lastRunAgo)
        ? `last ran ${lastRunAgo}`
        : "no runs observed",
    ].join(" · ");
  return {
    detail: [
      {
        label: "Running workers",
        value: `${autovacuum.runningWorkers} of ${autovacuum.maxWorkers}`,
      },
      {
        label: "Last autovacuum",
        value: lastRunAgo ?? "Not observed yet",
      },
    ],
    id: "autovacuum",
    label: "Autovacuum",
    summary,
    tone: toneFromHealthCheckStatus(autovacuum.status),
  };
}

function buildLockStatisticsRow(
  statistics: LockStatistics,
  reason: string | undefined
): HealthRowModel {
  const available =
    statistics.availability === ObservationAvailability.AVAILABLE;
  const detail: HealthRowDetail[] = [
    {
      label: "Observation",
      value: observationAvailabilityLabel(statistics.availability),
    },
  ];
  if (available) {
    detail.push(
      {
        label: "Completed waits",
        value: statistics.byType
          .reduce((total, row) => total + row.waits, 0n)
          .toLocaleString(),
      },
      {
        label: "Cumulative wait time",
        value: formatInsightMs(
          statistics.byType.reduce((total, row) => total + row.waitTimeMs, 0)
        ),
      },
      {
        label: "Fast-path capacity misses",
        value: statistics.byType
          .reduce((total, row) => total + row.fastpathExceeded, 0n)
          .toLocaleString(),
      },
      {
        label: "Scope",
        value: "Instance-wide, since statistics reset; not current blockers",
      }
    );
  }
  let summary =
    statistics.summary.trim() ||
    (available
      ? "Cumulative completed waits exceeding deadlock_timeout"
      : observationAvailabilityLabel(statistics.availability));
  if (isNonEmptyString(reason)) {
    summary = reason;
  }
  return {
    detail,
    id: "lock-statistics",
    label: "Lock statistics",
    summary,
    tone: available ? "ok" : "muted",
  };
}

/**
 * Rows for a connected instance, sourced from the CheckInstanceHealth RPC.
 * A category left unset by the backend (see partial_errors) renders as a
 * muted row with the failure reason instead of disappearing.
 */
function buildLiveHealthRows(
  health: InstanceHealth | undefined,
  partialErrors: Status[] | undefined,
  serverReplicationRole?: ServerInfo_ReplicationRole
): HealthRowModel[] {
  const reasons = getHealthCheckPartialReasons(partialErrors);
  return [
    buildConnectionActivityRow(
      health?.connectionActivity,
      reasons.connection_activity
    ),
    buildReplicationRow(
      health?.replication,
      reasons.replication,
      serverReplicationRole
    ),
    buildStatsAccessRow(health?.statsAccess, reasons.stats_access),
    buildPgStatStatementsRow(
      health?.pgStatStatements,
      reasons.pg_stat_statements
    ),
    buildAutovacuumRow(health?.autovacuum, reasons.autovacuum),
    ...(health?.lockStatistics
      ? [buildLockStatisticsRow(health.lockStatistics, reasons.lock_statistics)]
      : []),
  ];
}

function instanceEndpoint(instance: InstanceRecord): string {
  const host = instance.config?.host ?? instance.displayName;
  const port = instance.config?.port ?? DEFAULT_POSTGRES_PORT;
  return `${host}:${port}`;
}

/**
 * Single compact confirmation row for a connected instance folding TCP,
 * TLS, and authentication into one line.
 */
function buildConnectedEndpointRow(instance: InstanceRecord): HealthRowModel {
  const rawSslMode =
    instance.config?.sslMode ?? PostgresConfig_SslMode.UNSPECIFIED;
  const sslMode = formatSslMode(rawSslMode);
  const sslNegotiation = formatSslNegotiation(
    instance.config?.sslNegotiation ?? PostgresConfig_SslNegotiation.UNSPECIFIED
  );
  // TLS off means credentials and data travel in plaintext — a connected
  // instance must still read as a security warning, not a green check.
  const tlsDisabled = rawSslMode === PostgresConfig_SslMode.DISABLED;
  return {
    detail: [
      { label: "Endpoint", value: instanceEndpoint(instance) },
      { label: "SSL mode", value: sslMode },
      { label: "SSL negotiation", value: sslNegotiation },
      { label: "Authentication", value: "Credentials accepted" },
    ],
    id: "connection",
    label: "Connection",
    summary: tlsDisabled
      ? `${instanceEndpoint(instance)} · TLS disabled (plaintext) · credentials accepted`
      : `${instanceEndpoint(instance)} · TLS ${sslMode} · credentials accepted`,
    tone: tlsDisabled ? "warning" : "ok",
  };
}

function buildTlsConfigRow(config: PostgresConfig | undefined): HealthRowModel {
  const sslMode = config?.sslMode ?? PostgresConfig_SslMode.UNSPECIFIED;
  const mode = formatSslMode(sslMode);
  const negotiation = formatSslNegotiation(
    config?.sslNegotiation ?? PostgresConfig_SslNegotiation.UNSPECIFIED
  );
  const detail: HealthRowDetail[] = [
    { label: "SSL mode", value: mode },
    { label: "SSL negotiation", value: negotiation },
  ];

  if (sslMode === PostgresConfig_SslMode.DISABLED) {
    return {
      detail,
      id: "tls",
      label: "TLS",
      summary: "Disabled in the saved configuration",
      tone: "warning",
    };
  }
  if (sslMode === PostgresConfig_SslMode.REQUIRE) {
    return {
      detail,
      id: "tls",
      label: "TLS",
      summary: `${mode} · encrypted transport required`,
      tone: "ok",
    };
  }
  if (
    sslMode === PostgresConfig_SslMode.VERIFY_CA ||
    sslMode === PostgresConfig_SslMode.VERIFY_FULL
  ) {
    return {
      detail,
      id: "tls",
      label: "TLS",
      summary: `${mode} · certificate verification required`,
      tone: "ok",
    };
  }
  return {
    detail,
    id: "tls",
    label: "TLS",
    summary: `${mode} · may fall back to plaintext`,
    tone: "muted",
  };
}

/**
 * Diagnostic rows for a disconnected or failing instance, derived from
 * stored metadata only. These explain WHY the instance is unreachable and
 * must keep working with no live connection.
 */
function buildDisconnectedDiagnosticRows({
  connectionStatus,
  instance,
}: {
  connectionStatus: DbConnectionStatus;
  instance: InstanceRecord;
}): HealthRowModel[] {
  const endpoint = instanceEndpoint(instance);
  const connectionError = instance.connectionError.trim();

  if (connectionStatus === "error") {
    const presentation = describeInstanceConnectionError(connectionError);
    return [
      {
        detail: [
          { label: "Endpoint", value: endpoint },
          { label: "Error", value: presentation.summary },
        ],
        id: "tcp",
        label: "TCP",
        summary: presentation.title,
        tone: "error",
      },
      {
        detail: [
          {
            label: "Reason",
            value: presentation.retryGuidance,
          },
        ],
        id: "authentication",
        label: "Authentication",
        summary: "No authenticated session",
        tone: "error",
      },
      buildTlsConfigRow(instance.config),
    ];
  }

  return [
    {
      detail: [
        { label: "Endpoint", value: endpoint },
        {
          label: "Status",
          value: "Awaiting a successful instance connection.",
        },
      ],
      id: "tcp",
      label: "TCP",
      summary: "Not checked yet",
      tone: "muted",
    },
    {
      detail: [
        { label: "Status", value: "No successful authentication recorded." },
      ],
      id: "authentication",
      label: "Authentication",
      summary: "Not checked yet",
      tone: "muted",
    },
    buildTlsConfigRow(instance.config),
  ];
}

/**
 * Server facts for the section header: version, uptime, platform, installed
 * extension count, and connection limit. Unparseable or unavailable facts
 * are omitted rather than rendered as placeholders.
 */
function buildInstanceFacts({
  extensionsInstalledCount,
  serverInfo,
}: {
  extensionsInstalledCount: number | undefined;
  serverInfo: ServerInfo | undefined;
}): string[] {
  if (!serverInfo) {
    return [];
  }

  const facts: string[] = [];
  if (serverInfo.versionShort) {
    facts.push(`PostgreSQL ${serverInfo.versionShort}`);
  }
  if (serverInfo.startedAt) {
    const uptime = formatUptime(serverInfo.startedAt);
    if (uptime !== "—") {
      facts.push(`up ${uptime}`);
    }
  }
  const platform = parsePostgresPlatform(serverInfo.version);
  if (platform) {
    facts.push(`${platform.arch} / ${platform.os}`);
  }
  if (extensionsInstalledCount !== undefined) {
    facts.push(
      extensionsInstalledCount === 1
        ? "1 extension"
        : `${extensionsInstalledCount} extensions`
    );
  }
  if (serverInfo.maxConnections > 0) {
    facts.push(`max ${serverInfo.maxConnections} connections`);
  }
  return facts;
}

export type { HealthRowDetail, HealthRowModel, HealthRowTone };
export {
  buildConnectedEndpointRow,
  buildDisconnectedDiagnosticRows,
  buildInstanceFacts,
  buildLiveHealthRows,
  getHealthCheckPartialReasons,
  toneFromHealthCheckStatus,
};
