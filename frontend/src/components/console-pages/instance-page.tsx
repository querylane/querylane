"use client";

import { useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Database, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AsyncSectionState } from "@/components/async-section-state";
import { ConfigManagedNotice } from "@/components/config-managed-notice";
import {
  CopyableHost,
  InstanceNotFoundState,
  InstanceStatItem,
  InstanceStatsBar,
  ResourcePageState,
  SectionCard,
  SummaryCountValue,
} from "@/components/console-pages/console-layout";
import { DatabaseEncodingValue } from "@/components/console-pages/database-encoding-value";
import {
  buildInstanceUpdatePaths,
  DEFAULT_POSTGRES_PORT,
  type InstanceFormErrors,
  type InstanceFormInvalidFieldName,
  type InstanceFormState,
  type InstanceRecord,
  labelsToMap,
  parseInstanceFormPort,
  trimInstanceFormState,
} from "@/components/console-pages/instance-config-model";
import { InstanceConfigurationSection } from "@/components/console-pages/instance-configuration-section";
import { InstanceDangerZoneSection } from "@/components/console-pages/instance-danger-zone-section";
import {
  filterDatabasesByFacets,
  presentDatabaseEncodingOptions,
  presentDatabaseKindOptions,
  presentDatabaseOwnerOptions,
} from "@/components/console-pages/instance-database-filters";
import { InstanceDeleteDialog } from "@/components/console-pages/instance-delete-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { extractInstanceConfigFieldViolations } from "@/features/create-instance-field-violations";
import { useIsConfigManagedInstances } from "@/hooks/api/console";
import { selectedDatabaseQueryOptions } from "@/hooks/api/database";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import {
  refreshAllInstancesCache,
  useDeleteInstanceMutation,
  useGetInstanceOverviewQuery,
  useGetInstanceQuery,
  useUpdateInstanceMutation,
} from "@/hooks/api/instance";
import type { DbConnectionStatus } from "@/lib/console-resources";
import {
  buildInstanceName,
  formatBytes,
  formatUptime,
} from "@/lib/console-resources";
import { useDb } from "@/lib/db-context";
import {
  formatConnectionCheckLabel,
  getMetricPartialErrors,
  type MetricPartialErrors,
} from "@/lib/instance-health";
import { handleNavigationError } from "@/lib/navigation-errors";
import { logger } from "@/lib/observability/sentry";
import {
  formatReplicationRole,
  formatSslMode,
  formatSslNegotiation,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { handleQueryActionError } from "@/lib/query-action-errors";
import { createResourceLoader } from "@/lib/resource-loader";
import { prefetchRouteQueryOnIntent } from "@/lib/route-prefetch";
import { normalizeAppUiError } from "@/lib/ui-error";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type { Extension } from "@/protogen/querylane/console/v1alpha1/extension_pb";
import type {
  InstanceOverview,
  PostgresConfig,
  ServerInfo,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
  ServerInfo_ReplicationRole,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

type InstanceSection = "configuration" | "overview";
type DatabaseRow = ReturnType<typeof useDb>["databases"][number];
interface DatabaseFacetFilter {
  label: string;
  onChange: (values: string[]) => void;
  options: FacetedFilterOption[];
  selectedValues: string[];
}

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const LAST_INSTANCE_DELETE_DISABLED_REASON =
  "Querylane needs at least one registered instance. Add another instance before deleting this one.";
const EMPTY_INSTANCE_CATALOG_DELETE_DISABLED_REASON =
  "No registered instances were found. Refresh the instance list before deleting.";

function getInstanceDeleteDisabledReason({
  instanceCatalogHasData,
  instanceCatalogHasResolved,
  instanceCount,
}: {
  instanceCatalogHasData: boolean;
  instanceCatalogHasResolved: boolean;
  instanceCount: number;
}) {
  if (!(instanceCatalogHasData || instanceCatalogHasResolved)) {
    return "Checking registered instances before delete.";
  }

  if (instanceCount === 0) {
    return EMPTY_INSTANCE_CATALOG_DELETE_DISABLED_REASON;
  }

  if (instanceCount <= 1) {
    return LAST_INSTANCE_DELETE_DISABLED_REASON;
  }

  return null;
}

function nonBlockingFollowUpErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

function reportInstanceMutationFollowUpFailure(
  step: "navigate-home" | "refresh-instances",
  error: unknown
) {
  logger.warn("Non-blocking instance mutation follow-up failed", {
    error: nonBlockingFollowUpErrorPayload(error),
    step,
  });
}

function runInstanceMutationFollowUp(
  step: "navigate-home" | "refresh-instances",
  promise: Promise<unknown>
) {
  promise.catch((error) => {
    if (step === "navigate-home") {
      handleNavigationError(error, {
        area: "console.instance.delete.navigate-home",
      });
      return;
    }
    reportInstanceMutationFollowUpFailure(step, error);
  });
}

function buildInstanceUpdateInput({
  formState,
  instance,
  nextPort,
  updatePaths,
}: {
  formState: InstanceFormState;
  instance: InstanceRecord;
  nextPort: number;
  updatePaths: string[];
}) {
  return {
    instance: {
      config: {
        database: formState.database,
        host: formState.host,
        password: formState.password,
        port: nextPort,
        sslMode: toSslMode(formState.sslMode),
        sslNegotiation: toSslNegotiation(formState.sslNegotiation),
        username: formState.username,
      },
      displayName: formState.displayName,
      labels: labelsToMap(formState.labels),
      name: instance.name,
    },
    updateMask: {
      paths: updatePaths,
    },
  };
}

const PERCENT_MULTIPLIER = 100;

function getLastRefreshedLabel(lastRefreshedAt: number): string | null {
  return lastRefreshedAt > 0
    ? `Last refreshed ${TIME_FORMATTER.format(new Date(lastRefreshedAt))}`
    : null;
}

function getConnectionPct(overview: InstanceOverview | undefined) {
  if (!(overview?.connections && overview.connections.maxConnections > 0)) {
    return;
  }

  return (
    (overview.connections.totalConnections /
      overview.connections.maxConnections) *
    PERCENT_MULTIPLIER
  );
}

function formatMetricCount(
  value: bigint | number | undefined,
  singular: string,
  plural = `${singular}s`
) {
  if (value === undefined) {
    return "—";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "—";
  }

  return `${value.toLocaleString()} ${numeric === 1 ? singular : plural}`;
}

function getVisiblePartialErrors(
  isConnected: boolean,
  partialErrors: Status[] | undefined
): Status[] {
  if (!isConnected) {
    return [];
  }

  return partialErrors ?? [];
}

function getMetricNotice(
  partialErrors: MetricPartialErrors,
  metric: keyof MetricPartialErrors
) {
  const partialError = partialErrors[metric];
  if (!partialError) {
    return null;
  }

  return partialError.message || "Metric unavailable";
}

interface InstancePageHeaderDatabasesState {
  count: number;
  error?: unknown | undefined;
  isPending: boolean;
  isUnavailable: boolean;
}

function StatValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-bold font-mono text-xl tabular-nums tracking-tight">
      {children}
    </span>
  );
}

function CoreInstanceStatsBar({
  databasesState,
  metricPartialErrors,
  overview,
}: {
  databasesState: InstancePageHeaderDatabasesState;
  metricPartialErrors: MetricPartialErrors;
  overview?: InstanceOverview | undefined;
}) {
  const connectionPct = getConnectionPct(overview);

  return (
    <InstanceStatsBar>
      <InstanceStatItem
        label="Connections"
        notice={getMetricNotice(metricPartialErrors, "connections")}
        progress={connectionPct}
        suffix={
          overview?.connections
            ? `/ ${overview.connections.maxConnections}`
            : undefined
        }
      >
        <StatValue>
          {overview?.connections ? overview.connections.totalConnections : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem
        label="Cache Hit Ratio"
        notice={getMetricNotice(metricPartialErrors, "cache")}
      >
        <StatValue>
          {overview?.cache
            ? `${Math.round(overview.cache.hitRatio * PERCENT_MULTIPLIER)}%`
            : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem
        label="Storage"
        notice={getMetricNotice(metricPartialErrors, "storage")}
      >
        <StatValue>
          {overview?.storage
            ? formatBytes(overview.storage.totalSizeBytes)
            : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem label="Databases">
        <StatValue>
          <SummaryCountValue
            count={databasesState.count}
            error={databasesState.error}
            isPending={databasesState.isPending}
            isUnavailable={databasesState.isUnavailable}
          />
        </StatValue>
      </InstanceStatItem>
    </InstanceStatsBar>
  );
}

function InstanceIoStatsBar({
  connectionStatus,
  metricPartialErrors,
  overview,
}: {
  connectionStatus: DbConnectionStatus;
  metricPartialErrors: MetricPartialErrors;
  overview?: InstanceOverview | undefined;
}) {
  if (connectionStatus !== "connected") {
    return null;
  }

  const ioMetrics = overview?.ioMetrics;
  const ioNotice = getMetricNotice(metricPartialErrors, "io");

  return (
    <InstanceStatsBar>
      <InstanceStatItem
        label="I/O reads"
        notice={ioNotice}
        suffix={
          ioMetrics
            ? formatMetricCount(ioMetrics.reads, "op", "ops")
            : undefined
        }
      >
        <StatValue>
          {ioMetrics ? formatBytes(ioMetrics.readBytes) : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem
        label="I/O writes"
        notice={ioNotice}
        suffix={
          ioMetrics
            ? formatMetricCount(ioMetrics.writes, "op", "ops")
            : undefined
        }
      >
        <StatValue>
          {ioMetrics ? formatBytes(ioMetrics.writeBytes) : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem
        label="I/O extends"
        notice={ioNotice}
        suffix={
          ioMetrics
            ? formatMetricCount(ioMetrics.extends, "op", "ops")
            : undefined
        }
      >
        <StatValue>
          {ioMetrics ? formatBytes(ioMetrics.extendBytes) : "—"}
        </StatValue>
      </InstanceStatItem>
      <InstanceStatItem label="I/O fsyncs" notice={ioNotice}>
        <StatValue>
          {ioMetrics ? formatMetricCount(ioMetrics.fsyncs, "call") : "—"}
        </StatValue>
      </InstanceStatItem>
    </InstanceStatsBar>
  );
}

type HealthBadgeVariant = "default" | "destructive" | "outline" | "secondary";

interface HealthCheckItemProps {
  description: string;
  label: string;
  status: string;
  value: string;
  variant?: HealthBadgeVariant | undefined;
}

function HealthCheckItem({
  description,
  label,
  status,
  value,
  variant = "outline",
}: HealthCheckItemProps) {
  return (
    <fieldset
      aria-description={description}
      aria-label={`${label} health check`}
      className="flex min-h-24 min-w-0 flex-col gap-2 rounded-lg border border-border p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-medium text-sm [overflow-wrap:anywhere]">
          {label}
        </h3>
        <Badge className="shrink-0" variant={variant}>
          {status}
        </Badge>
      </div>
      <p className="min-w-0 break-words font-mono text-muted-foreground text-xs [overflow-wrap:anywhere]">
        {value}
      </p>
    </fieldset>
  );
}

function connectionHealth({
  connectionStatus,
  instance,
}: {
  connectionStatus: DbConnectionStatus;
  instance: InstanceRecord;
}): HealthCheckItemProps {
  if (connectionStatus === "connected") {
    return {
      description: "Querylane has an active PostgreSQL connection.",
      label: "TCP",
      status: "Reachable",
      value: `${instance.config?.host ?? instance.displayName}:${instance.config?.port ?? DEFAULT_POSTGRES_PORT}`,
      variant: "default",
    };
  }

  if (connectionStatus === "error") {
    return {
      description:
        "The backend reported a connection failure; exact TCP cause needs a backend probe.",
      label: "TCP",
      status: "Unavailable",
      value: instance.connectionError || "Connection failed",
      variant: "destructive",
    };
  }

  return {
    description: "No successful connection is recorded yet.",
    label: "TCP",
    status: "Not checked",
    value: "Awaiting a successful instance connection.",
    variant: "secondary",
  };
}

function tlsHealth(config: PostgresConfig | undefined): HealthCheckItemProps {
  const sslMode = config?.sslMode ?? PostgresConfig_SslMode.UNSPECIFIED;
  const mode = formatSslMode(sslMode);
  const negotiation = formatSslNegotiation(
    config?.sslNegotiation ?? PostgresConfig_SslNegotiation.UNSPECIFIED
  );

  if (sslMode === PostgresConfig_SslMode.DISABLED) {
    return {
      description: "The saved connection configuration disables TLS.",
      label: "TLS",
      status: "Disabled",
      value: `${mode} / ${negotiation}`,
      variant: "secondary",
    };
  }

  if (sslMode === PostgresConfig_SslMode.REQUIRE) {
    return {
      description:
        "Saved SSL mode requires encrypted transport, but no TLS handshake has been observed yet.",
      label: "TLS",
      status: "Encrypted",
      value: `${mode} / ${negotiation}; no handshake observed`,
      variant: "outline",
    };
  }

  if (
    sslMode === PostgresConfig_SslMode.VERIFY_CA ||
    sslMode === PostgresConfig_SslMode.VERIFY_FULL
  ) {
    return {
      description:
        "Saved SSL mode requires certificate verification, but no TLS handshake has been observed yet.",
      label: "TLS",
      status: "Verified",
      value: `${mode} / ${negotiation}; no handshake observed`,
      variant: "default",
    };
  }

  return {
    description:
      "Saved SSL mode can negotiate TLS but may use plaintext fallback; no TLS handshake has been observed yet.",
    label: "TLS",
    status: "Opportunistic",
    value: `${mode} / ${negotiation}; may use plaintext fallback; no handshake observed`,
    variant: "secondary",
  };
}

function authenticationHealth(
  connectionStatus: DbConnectionStatus
): HealthCheckItemProps {
  if (connectionStatus === "connected") {
    return {
      description:
        "The active connection proves these credentials were accepted.",
      label: "Authentication",
      status: "Accepted",
      value: "credentials accepted",
      variant: "default",
    };
  }

  if (connectionStatus === "error") {
    return {
      description:
        "No authenticated session is available; use the connection error for the exact cause.",
      label: "Authentication",
      status: "Unavailable",
      value: "no authenticated session",
      variant: "destructive",
    };
  }

  return {
    description: "No successful authentication is recorded yet.",
    label: "Authentication",
    status: "Not checked",
    value: "awaiting successful connection",
    variant: "secondary",
  };
}

function replicationHealth(
  serverInfo: ServerInfo | undefined
): HealthCheckItemProps {
  if (
    serverInfo &&
    serverInfo.replicationRole !== ServerInfo_ReplicationRole.UNSPECIFIED
  ) {
    const isPrimary =
      serverInfo.replicationRole === ServerInfo_ReplicationRole.PRIMARY;
    return {
      description: "Reported by server metadata for this instance.",
      label: "Replication",
      status: "Detected",
      value: isPrimary ? "primary server" : "replica server",
      variant: "outline",
    };
  }

  return {
    description: "Replication role is not available from server metadata.",
    label: "Replication",
    status: "Unknown",
    value: "no role reported",
    variant: "secondary",
  };
}

function findPgStatStatements(extensions: Extension[] | undefined) {
  return extensions?.find(
    (extension) => extension.displayName === "pg_stat_statements"
  );
}

function pgStatStatementsHealth({
  database,
  enabled,
  error,
  extensions,
  isPending,
}: {
  database: string;
  enabled: boolean;
  error: unknown;
  extensions: Extension[] | undefined;
  isPending: boolean;
}): HealthCheckItemProps {
  if (!enabled) {
    return {
      description:
        "Awaiting a connected instance before checking extension inventory.",
      label: "pg_stat_statements",
      status: "Not checked",
      value: database ? "inventory not checked" : "no configured database",
      variant: "secondary",
    };
  }

  if (isPending) {
    return {
      description: "Checking the configured database extension inventory.",
      label: "pg_stat_statements",
      status: "Checking",
      value: "checking inventory",
      variant: "secondary",
    };
  }

  if (error) {
    return {
      description:
        "Querylane could not read extension inventory for the configured database.",
      label: "pg_stat_statements",
      status: "Unavailable",
      value: "extension inventory unavailable",
      variant: "destructive",
    };
  }

  const extension = findPgStatStatements(extensions);
  if (!extension) {
    return {
      description:
        "The configured database did not report pg_stat_statements as available.",
      label: "pg_stat_statements",
      status: "Not reported",
      value: "not present in inventory",
      variant: "secondary",
    };
  }

  if (extension.installed) {
    return {
      description:
        "The configured database reports pg_stat_statements as installed.",
      label: "pg_stat_statements",
      status: "Installed",
      value: extension.installedVersion || extension.schema || database,
      variant: "default",
    };
  }

  return {
    description:
      "The extension is available but not installed in the configured database.",
    label: "pg_stat_statements",
    status: "Available",
    value: extension.defaultVersion || "Available in extension inventory.",
    variant: "outline",
  };
}

function InstanceHealthChecksSection({
  connectionStatus,
  extensions,
  extensionsError,
  extensionsPending,
  instance,
  serverInfo,
}: {
  connectionStatus: DbConnectionStatus;
  extensions: Extension[] | undefined;
  extensionsError: unknown;
  extensionsPending: boolean;
  instance: InstanceRecord;
  serverInfo?: ServerInfo | undefined;
}) {
  const database = instance.config?.database ?? "";
  const extensionsEnabled =
    connectionStatus === "connected" && database.length > 0;
  const items = [
    connectionHealth({ connectionStatus, instance }),
    tlsHealth(instance.config),
    authenticationHealth(connectionStatus),
    replicationHealth(serverInfo),
    pgStatStatementsHealth({
      database,
      enabled: extensionsEnabled,
      error: extensionsError,
      extensions,
      isPending: extensionsPending,
    }),
  ];

  return (
    <section aria-label="Health checks">
      <SectionCard
        description="Real diagnostics from existing instance metadata, connection state, and the configured database extension inventory."
        title="Health checks"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {items.map((item) => (
            <HealthCheckItem
              description={item.description}
              key={item.label}
              label={item.label}
              status={item.status}
              value={item.value}
              variant={item.variant}
            />
          ))}
        </div>
      </SectionCard>
    </section>
  );
}

function InstancePageHeader({
  connectionStatus,
  databasesState,
  instance,
  isRefreshing,
  lastRefreshedAt,
  onRefresh,
  overview,
  partialErrors,
  serverInfo,
}: {
  connectionStatus: DbConnectionStatus;
  databasesState: InstancePageHeaderDatabasesState;
  instance: InstanceRecord;
  isRefreshing: boolean;
  lastRefreshedAt: number;
  onRefresh: () => void;
  overview?: InstanceOverview | undefined;
  partialErrors: Status[];
  serverInfo?: ServerInfo | undefined;
}) {
  const lastRefreshedLabel = getLastRefreshedLabel(lastRefreshedAt);
  const lastConnectionCheckLabel = formatConnectionCheckLabel(
    instance.lastConnectionCheckTime
  );
  const metricPartialErrors = getMetricPartialErrors(partialErrors);
  const connectionError = instance.connectionError.trim();
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <h1
              className="min-w-0 break-words font-semibold text-2xl text-foreground tracking-tight"
              style={{
                textWrap: "balance",
              }}
            >
              {instance.displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {serverInfo &&
              serverInfo.replicationRole !==
                ServerInfo_ReplicationRole.UNSPECIFIED ? (
                <Badge className="px-2.5 py-0.5 text-xs" variant="default">
                  {formatReplicationRole(serverInfo.replicationRole)}
                </Badge>
              ) : null}
              <Badge
                className="px-2.5 py-0.5 text-xs"
                variant={
                  connectionStatus === "error" ? "destructive" : "outline"
                }
              >
                {connectionStatus === "error" ? (
                  "Connection failed"
                ) : (
                  <StatusIndicator showLabel={true} status={connectionStatus} />
                )}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
            {lastRefreshedLabel ? (
              <span className="hidden sm:inline">{lastRefreshedLabel}</span>
            ) : null}
            {lastConnectionCheckLabel ? (
              <span className="hidden sm:inline">
                {lastConnectionCheckLabel}
              </span>
            ) : null}
            <Button
              aria-label="Refresh data"
              disabled={isRefreshing}
              onClick={onRefresh}
              size="icon-xs"
              variant="ghost"
            >
              <RefreshCw
                aria-hidden="true"
                className={
                  isRefreshing
                    ? "size-3.5 animate-spin motion-reduce:animate-none"
                    : "size-3.5"
                }
              />
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          {instance.config?.host ? (
            <>
              <CopyableHost
                host={instance.config.host}
                port={instance.config.port}
              />
              <span className="text-border">|</span>
            </>
          ) : null}
          {serverInfo?.versionShort ? (
            <>
              <span>
                PostgreSQL{" "}
                <span className="text-foreground tabular-nums">
                  {serverInfo.versionShort}
                </span>
              </span>
              <span className="text-border">|</span>
            </>
          ) : null}
          {serverInfo?.startedAt ? (
            <span>
              Up{" "}
              <span className="text-foreground tabular-nums">
                {formatUptime(serverInfo.startedAt)}
              </span>
            </span>
          ) : null}
        </div>
        {connectionError ? (
          <div className="flex max-w-3xl items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            <span className="min-w-0 flex-1 truncate">
              Connection error: {connectionError}
            </span>
            <CopyIconButton
              ariaLabel="Copy connection error"
              copiedLabel="Error copied"
              value={connectionError}
            />
          </div>
        ) : null}
      </div>

      <CoreInstanceStatsBar
        databasesState={databasesState}
        metricPartialErrors={metricPartialErrors}
        overview={overview}
      />
      <InstanceIoStatsBar
        connectionStatus={connectionStatus}
        metricPartialErrors={metricPartialErrors}
        overview={overview}
      />
    </>
  );
}
const databaseColumns: DataTableColumnDef<DatabaseRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => {
      const db = row.original;
      return (
        <div className="flex items-center gap-2">
          <Database
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground/50"
          />
          <span className="font-medium text-sm">{db.name}</span>
          <ChevronRight
            aria-hidden="true"
            className="ml-0.5 size-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
          />
        </div>
      );
    },
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
    meta: {
      cellClassName: "relative",
      headerClassName: "pl-3",
    },
  },
  {
    accessorKey: "owner",
    cell: ({ row }) => row.original.owner || "—",
    header: ({ column }) => (
      <SortableHeader column={column}>Owner</SortableHeader>
    ),
    meta: {
      cellClassName: "text-sm text-muted-foreground",
    },
  },
  {
    // NUL-join keeps charset primary and collation secondary without creating
    // a visible combined string in the table body.
    accessorFn: (row) => `${row.characterSet}\u0000${row.collation}`,
    cell: ({ row }) => (
      <DatabaseEncodingValue
        characterSet={row.original.characterSet}
        className="max-w-[18rem]"
        collation={row.original.collation}
      />
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Encoding</SortableHeader>
    ),
    id: "encoding",
    meta: {
      cellClassName: "text-sm",
    },
  },
  {
    accessorFn: (row) => (row.isSystemDatabase ? "system" : "user"),
    cell: ({ row }) =>
      row.original.isSystemDatabase ? (
        <Badge variant="outline">System</Badge>
      ) : (
        <Badge variant="secondary">User</Badge>
      ),
    header: ({ column }) => (
      <SortableHeader column={column}>Kind</SortableHeader>
    ),
    id: "kind",
  },
];

function InstanceDatabasesSectionHeader({ count }: { count: number | null }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-base text-foreground">Databases</h2>
          {count == null ? null : (
            <span className="text-muted-foreground text-xs tabular-nums">
              {count}
            </span>
          )}
        </div>
        <p className="-mt-0.5 text-[13px] text-muted-foreground">
          Databases returned by the backend for this instance.
        </p>
      </div>
    </div>
  );
}

function InstanceDatabaseFilterBar({
  dbFilter,
  filters,
  onFilterChange,
}: {
  dbFilter: string;
  filters: DatabaseFacetFilter[];
  onFilterChange: (value: string) => void;
}) {
  const visibleFilters = filters.filter((filter) => filter.options.length > 0);
  const hasActiveFacet = visibleFilters.some(
    (filter) => filter.selectedValues.length > 0
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DataTableFilter
        onChange={onFilterChange}
        placeholder="Search databases..."
        value={dbFilter}
      />
      {visibleFilters.map((filter) => (
        <DataTableFacetedFilter
          key={filter.label}
          onSelectedValuesChange={filter.onChange}
          options={filter.options}
          selectedValues={filter.selectedValues}
          title={filter.label}
        />
      ))}
      {hasActiveFacet ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={() => {
            for (const filter of visibleFilters) {
              filter.onChange([]);
            }
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
  );
}

function InstanceOverviewSection({
  databases,
  isUnavailable = false,
  navigateToDatabase,
  onDatabaseIntent,
  queryState,
  unavailableMessage,
}: {
  databases: DatabaseRow[];
  isUnavailable?: boolean | undefined;
  navigateToDatabase: ReturnType<typeof useDb>["navigateToDatabase"];
  onDatabaseIntent?: (database: DatabaseRow) => void;
  queryState: ReturnType<typeof useDb>["queryStates"]["databases"];
  unavailableMessage?: string | undefined;
}) {
  const [dbFilter, setDbFilter] = useUrlTableSearch();
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [encodingFilters, setEncodingFilters] = useState<string[]>([]);
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const isUnavailableEmpty = isUnavailable && databases.length === 0;
  const isLoading = !queryState.hasResolved;
  const filteredDatabases = filterDatabasesByFacets({
    databases,
    encodingFilters,
    kindFilters,
    ownerFilters,
  });
  const databaseFacetFilters = [
    {
      label: "Owner",
      onChange: setOwnerFilters,
      options: presentDatabaseOwnerOptions(databases),
      selectedValues: ownerFilters,
    },
    {
      label: "Encoding",
      onChange: setEncodingFilters,
      options: presentDatabaseEncodingOptions(databases),
      selectedValues: encodingFilters,
    },
    {
      label: "Kind",
      onChange: setKindFilters,
      options: presentDatabaseKindOptions(databases),
      selectedValues: kindFilters,
    },
  ] satisfies DatabaseFacetFilter[];
  let databasesContent: React.ReactNode;
  if (isUnavailableEmpty) {
    databasesContent = (
      <EmptyState
        description={
          unavailableMessage ??
          "Databases are unavailable while this instance is not connected."
        }
        icon={Database}
        title="Databases unavailable"
      />
    );
  } else if (isLoading) {
    databasesContent = (
      <AsyncSectionState
        emptyState={null}
        hasContent={false}
        isPending={true}
        isRefreshing={false}
        loadingMessage="Loading databases..."
        refreshingMessage="Refreshing databases..."
      >
        {null}
      </AsyncSectionState>
    );
  } else {
    databasesContent = (
      <DataTable
        columns={databaseColumns}
        data={filteredDatabases}
        emptyResourceName="databases"
        filterColumn="name"
        filterValue={dbFilter}
        getRowProps={(database) => ({
          onFocus: () => onDatabaseIntent?.(database),
          onMouseEnter: () => onDatabaseIntent?.(database),
        })}
        onFilterChange={setDbFilter}
        onRowClick={(database) =>
          navigateToDatabase(database, {
            overridePage: "database.overview",
          })
        }
        pageSize={10}
        tableKey="instance-databases"
      />
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <InstanceDatabasesSectionHeader
        count={
          isUnavailableEmpty || isLoading ? null : filteredDatabases.length
        }
      />
      {isUnavailableEmpty || isLoading ? null : (
        <InstanceDatabaseFilterBar
          dbFilter={dbFilter}
          filters={databaseFacetFilters}
          onFilterChange={setDbFilter}
        />
      )}
      {databasesContent}
    </section>
  );
}
function InstanceOverviewContent({
  connectionStatus,
  databases,
  extensions,
  extensionsError,
  extensionsPending,
  instance,
  isUnavailable,
  navigateToDatabase,
  onDatabaseIntent,
  queryState,
  serverInfo,
}: {
  connectionStatus: DbConnectionStatus;
  databases: DatabaseRow[];
  extensions: Extension[] | undefined;
  extensionsError: unknown;
  extensionsPending: boolean;
  instance: InstanceRecord;
  isUnavailable: boolean;
  navigateToDatabase: ReturnType<typeof useDb>["navigateToDatabase"];
  onDatabaseIntent: (database: DatabaseRow) => void;
  queryState: ReturnType<typeof useDb>["queryStates"]["databases"];
  serverInfo?: ServerInfo | undefined;
}) {
  return (
    <>
      <InstanceHealthChecksSection
        connectionStatus={connectionStatus}
        extensions={extensions}
        extensionsError={extensionsError}
        extensionsPending={extensionsPending}
        instance={instance}
        serverInfo={serverInfo}
      />
      <InstanceOverviewSection
        databases={databases}
        isUnavailable={isUnavailable}
        navigateToDatabase={navigateToDatabase}
        onDatabaseIntent={onDatabaseIntent}
        queryState={queryState}
        unavailableMessage="Database list is unavailable while this instance is not connected."
      />
    </>
  );
}

function getInstanceConfigSaveFieldViolationOutcome(error: unknown): {
  fieldErrors: InstanceFormErrors;
  firstInvalidField: InstanceFormInvalidFieldName | null;
  notice: { message: string; variant: "error" };
} | null {
  const { fieldErrors, firstInvalidField, generalErrors } =
    extractInstanceConfigFieldViolations(error);
  if (!(firstInvalidField || generalErrors.length > 0)) {
    return null;
  }

  return {
    fieldErrors,
    firstInvalidField,
    notice: {
      message:
        generalErrors.length > 0
          ? generalErrors.join(" ")
          : "Fix the highlighted fields, then save again.",
      variant: "error",
    },
  };
}

function BackendInstancePage({
  instanceId,
  section,
}: {
  instanceId: string;
  section: InstanceSection;
}) {
  const navigate = useNavigate();
  const transport = useTransport();
  const queryClient = useQueryClient();
  const {
    databases,
    instances,
    navigateToDatabase,
    queryStates,
    retryInstanceCatalog,
    selectedInstance,
  } = useDb();
  const instanceQuery = useGetInstanceQuery(
    {
      name: buildInstanceName(instanceId),
    },
    {
      enabled: Boolean(instanceId),
      refetchOnWindowFocus: false,
    }
  );
  const instance = instanceQuery.data?.instance;
  const serverInfo = instanceQuery.data?.serverInfo;
  const instanceName = buildInstanceName(instanceId);
  const isConnected = selectedInstance?.status === "connected";
  const overviewQuery = useGetInstanceOverviewQuery(
    {
      name: instanceName,
    },
    {
      enabled: isConnected,
      refetchOnWindowFocus: false,
    }
  );
  const overview = isConnected
    ? overviewQuery.data?.instanceOverview
    : undefined;
  const configuredDatabase = instance?.config?.database ?? "";
  const extensionsInput = {
    ...extensionsForDatabaseQueryInput({
      databaseId: configuredDatabase,
      instanceId,
    }),
    filter: 'name = "pg_stat_statements"',
    orderBy: "name asc",
    pageSize: 1,
  } as const;
  const pgStatStatementsQuery = useListAllExtensionsQuery(extensionsInput, {
    enabled:
      section === "overview" && isConnected && configuredDatabase.length > 0,
    refetchOnWindowFocus: false,
  });
  const isConfigManaged = useIsConfigManagedInstances();
  const updateInstanceMutation = useUpdateInstanceMutation();
  const deleteInstanceMutation = useDeleteInstanceMutation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [configFormResetKey, setConfigFormResetKey] = useState(0);
  const [formNotice, setFormNotice] = useState<{
    message: string;
    variant: "error" | "success";
  } | null>(null);
  const isInstanceMutationPending =
    updateInstanceMutation.isPending || deleteInstanceMutation.isPending;
  const loader = createResourceLoader(instanceQuery, "console.instance");
  const isRefreshing = instanceQuery.isFetching;
  const deleteDisabledReason = getInstanceDeleteDisabledReason({
    instanceCatalogHasData: queryStates.instances.hasData,
    instanceCatalogHasResolved: queryStates.instances.hasResolved,
    instanceCount: instances.length,
  });
  const handleRefresh = () => {
    instanceQuery.refetch().catch((error: unknown) => {
      handleQueryActionError(error, {
        action: "retry",
        area: "console.instance",
      });
    });
    if (isConnected) {
      overviewQuery.refetch().catch((error: unknown) => {
        handleQueryActionError(error, {
          action: "retry",
          area: "console.instance.overview",
        });
      });
    }
    if (
      isConnected &&
      section === "overview" &&
      configuredDatabase.length > 0
    ) {
      pgStatStatementsQuery.refetch().catch((error: unknown) => {
        handleQueryActionError(error, {
          action: "retry",
          area: "console.instance.extensions",
        });
      });
    }
    retryInstanceCatalog().catch((error: unknown) => {
      handleQueryActionError(error, {
        action: "retry",
        area: "console.instance.catalog",
      });
    });
  };
  const handleInvalidSave = () => {
    setFormNotice({
      message: "Fix the highlighted fields, then save again.",
      variant: "error",
    });
  };
  const handleSave = async (
    rawFormState: InstanceFormState
  ): Promise<
    | {
        fieldErrors: InstanceFormErrors;
        firstInvalidField: InstanceFormInvalidFieldName | null;
      }
    | undefined
  > => {
    if (!instance || isConfigManaged) {
      return;
    }
    // Trim once at the boundary so change detection and the payload use the
    // same values that validation checks.
    const formState = trimInstanceFormState(rawFormState);
    const nextPort = parseInstanceFormPort(formState.port);
    if (nextPort === null) {
      return;
    }
    const updatePaths = buildInstanceUpdatePaths({
      formState,
      instance,
      nextPort,
    });
    if (updatePaths.length === 0) {
      return;
    }
    setFormNotice(null);
    try {
      await updateInstanceMutation.mutateAsync(
        buildInstanceUpdateInput({
          formState,
          instance,
          nextPort,
          updatePaths,
        })
      );
      setFormNotice({
        message: "Instance configuration saved.",
        variant: "success",
      });
      toast.success("Instance configuration saved");
      // Keep the header instance switcher in sync with the saved changes.
      runInstanceMutationFollowUp(
        "refresh-instances",
        refreshAllInstancesCache({
          queryClient,
          transport,
        })
      );
      await instanceQuery.refetch();
      // Remount the configuration form from the refetched instance so the
      // redacted password returns to blank and dirty state clears.
      setConfigFormResetKey((key) => key + 1);
      if (isConnected) {
        overviewQuery.refetch();
      }
    } catch (error) {
      const fieldViolationOutcome =
        getInstanceConfigSaveFieldViolationOutcome(error);
      if (fieldViolationOutcome) {
        setFormNotice(fieldViolationOutcome.notice);
        return {
          fieldErrors: fieldViolationOutcome.fieldErrors,
          firstInvalidField: fieldViolationOutcome.firstInvalidField,
        };
      }

      const uiError = normalizeAppUiError(error, {
        action: "save instance configuration",
        area: "console.instance.configuration",
        source: "mutation",
        surface: "inline",
      });
      setFormNotice({ message: uiError.message, variant: "error" });
    }

    return;
  };
  const handleDelete = async () => {
    if (!instance || isConfigManaged) {
      return;
    }
    if (deleteDisabledReason) {
      setIsDeleteDialogOpen(false);
      setFormNotice({
        message: deleteDisabledReason,
        variant: "error",
      });
      return;
    }
    setIsDeleteDialogOpen(false);
    try {
      await deleteInstanceMutation.mutateAsync({
        name: instance.name,
      });
      runInstanceMutationFollowUp(
        "navigate-home",
        navigate({
          replace: true,
          to: "/",
        })
      );
      runInstanceMutationFollowUp(
        "refresh-instances",
        refreshAllInstancesCache({
          queryClient,
          transport,
        })
      );
    } catch (error) {
      const uiError = normalizeAppUiError(error, {
        action: "delete instance",
        area: "console.instance.configuration",
        source: "mutation",
        surface: "inline",
      });
      setFormNotice({ message: uiError.message, variant: "error" });
    }
  };
  const databasesUnavailable =
    queryStates.databases.isSuppressed && !queryStates.databases.hasData;
  const handleDatabaseIntent = (database: DatabaseRow) => {
    prefetchRouteQueryOnIntent(
      queryClient,
      selectedDatabaseQueryOptions({
        databaseId: database.id,
        instanceId,
        transport,
      })
    );
  };
  return (
    <ResourcePageState
      {...loader.pageStateProps}
      notFoundState={<InstanceNotFoundState />}
      title="Loading instance"
    >
      {instance
        ? renderLoadedInstancePageContent({
            configFormResetKey,
            connectionStatus: selectedInstance?.status ?? "disconnected",
            databases,
            databasesUnavailable,
            deleteDisabledReason,
            deletePending: deleteInstanceMutation.isPending,
            extensions: pgStatStatementsQuery.data?.extensions,
            extensionsError: pgStatStatementsQuery.error,
            extensionsPending: pgStatStatementsQuery.isPending,
            formNotice,
            instance,
            isConfigManaged,
            isDeleteDialogOpen,
            isInstanceMutationPending,
            isRefreshing,
            lastRefreshedAt: instanceQuery.dataUpdatedAt,
            navigateToDatabase,
            onDatabaseIntent: handleDatabaseIntent,
            onDelete: handleDelete,
            onInvalidSave: handleInvalidSave,
            onOpenDeleteDialogChange: setIsDeleteDialogOpen,
            onRefresh: handleRefresh,
            onSave: handleSave,
            overview,
            partialErrors: getVisiblePartialErrors(
              isConnected,
              overviewQuery.data?.partialErrors
            ),
            queryState: queryStates.databases,
            section,
            serverInfo,
          })
        : null}
    </ResourcePageState>
  );
}

function renderLoadedInstancePageContent({
  configFormResetKey,
  connectionStatus,
  databases,
  databasesUnavailable,
  deleteDisabledReason,
  deletePending,
  extensions,
  extensionsError,
  extensionsPending,
  formNotice,
  instance,
  isConfigManaged,
  isDeleteDialogOpen,
  isInstanceMutationPending,
  isRefreshing,
  lastRefreshedAt,
  navigateToDatabase,
  onDatabaseIntent,
  onDelete,
  onInvalidSave,
  onOpenDeleteDialogChange,
  onRefresh,
  onSave,
  overview,
  partialErrors,
  queryState,
  section,
  serverInfo,
}: {
  configFormResetKey: number;
  connectionStatus: DbConnectionStatus;
  databases: DatabaseRow[];
  databasesUnavailable: boolean;
  deleteDisabledReason: string | null;
  deletePending: boolean;
  extensions: Extension[] | undefined;
  extensionsError: unknown;
  extensionsPending: boolean;
  formNotice: { message: string; variant: "error" | "success" } | null;
  instance: InstanceRecord;
  isConfigManaged: boolean;
  isDeleteDialogOpen: boolean;
  isInstanceMutationPending: boolean;
  isRefreshing: boolean;
  lastRefreshedAt: number;
  navigateToDatabase: ReturnType<typeof useDb>["navigateToDatabase"];
  onDatabaseIntent: (database: DatabaseRow) => void;
  onDelete: () => void;
  onInvalidSave: () => void;
  onOpenDeleteDialogChange: (open: boolean) => void;
  onRefresh: () => void;
  onSave: Parameters<typeof InstanceConfigurationSection>[0]["onSave"];
  overview: InstanceOverview | undefined;
  partialErrors: Status[];
  queryState: ReturnType<typeof useDb>["queryStates"]["databases"];
  section: InstanceSection;
  serverInfo: ServerInfo | undefined;
}) {
  return (
    <>
      <div className="flex flex-col gap-8">
        <InstancePageHeader
          connectionStatus={connectionStatus}
          databasesState={{
            count: databases.length,
            error: queryState.error ?? undefined,
            isPending: queryState.status === "pending",
            isUnavailable: databasesUnavailable,
          }}
          instance={instance}
          isRefreshing={isRefreshing}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={onRefresh}
          overview={overview}
          partialErrors={partialErrors}
          serverInfo={serverInfo}
        />

        {section === "configuration" ? (
          <>
            {isConfigManaged ? <ConfigManagedNotice /> : null}
            <InstanceConfigurationSection
              formNotice={formNotice}
              instance={instance}
              isConfigManaged={isConfigManaged}
              key={`${instance.name}:${configFormResetKey}`}
              onInvalidSave={onInvalidSave}
              onSave={onSave}
              pending={isInstanceMutationPending}
            />
            {isConfigManaged ? null : (
              <InstanceDangerZoneSection
                deleteDisabledReason={deleteDisabledReason}
                instanceDisplayName={instance.displayName}
                onDelete={() => onOpenDeleteDialogChange(true)}
                pending={isInstanceMutationPending}
              />
            )}
          </>
        ) : (
          <InstanceOverviewContent
            connectionStatus={connectionStatus}
            databases={databases}
            extensions={extensions}
            extensionsError={extensionsError}
            extensionsPending={extensionsPending}
            instance={instance}
            isUnavailable={databasesUnavailable}
            navigateToDatabase={navigateToDatabase}
            onDatabaseIntent={onDatabaseIntent}
            queryState={queryState}
            serverInfo={serverInfo}
          />
        )}
      </div>

      <InstanceDeleteDialog
        instanceDisplayName={instance.displayName}
        onConfirm={onDelete}
        onOpenChange={onOpenDeleteDialogChange}
        open={isDeleteDialogOpen}
        pending={deletePending}
      />
    </>
  );
}

export { BackendInstancePage };
