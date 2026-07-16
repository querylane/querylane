"use client";

import { useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Database, RefreshCw, TriangleAlert } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { toast } from "sonner";
import { AsyncSectionState } from "@/components/async-section-state";
import { MetricSparkline } from "@/components/charts/metric-chart";
import { ConfigManagedNotice } from "@/components/config-managed-notice";
import {
  CopyableHost,
  InstanceNotFoundState,
  InstanceStatItem,
  InstanceStatsBar,
  ResourcePageState,
  SummaryCountValue,
} from "@/components/console-pages/console-layout";
import { DatabaseEncodingValue } from "@/components/console-pages/database-encoding-value";
import { InstanceActivityPage } from "@/components/console-pages/instance-activity-page";
import {
  buildInstanceUpdatePaths,
  type InstanceFormErrors,
  type InstanceFormInvalidFieldName,
  type InstanceFormState,
  type InstanceRecord,
  labelsToMap,
  parseInstanceFormPort,
  trimInstanceFormState,
} from "@/components/console-pages/instance-config-model";
import { InstanceConfigurationSection } from "@/components/console-pages/instance-configuration-section";
import { InstanceConnectionsCard } from "@/components/console-pages/instance-connections-card";
import { InstanceDangerZoneSection } from "@/components/console-pages/instance-danger-zone-section";
import {
  filterDatabasesByFacets,
  presentDatabaseEncodingOptions,
  presentDatabaseKindOptions,
  presentDatabaseOwnerOptions,
} from "@/components/console-pages/instance-database-filters";
import { InstanceDeleteDialog } from "@/components/console-pages/instance-delete-dialog";
import { InstanceHealthSection } from "@/components/console-pages/instance-health-section";
import { InstanceMetricsPanel } from "@/components/console-pages/instance-metrics-panel";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { StatusIndicator } from "@/components/ui/status-indicator";
import { extractInstanceConfigFieldViolations } from "@/features/create-instance-field-violations";
import { useIsConfigManagedInstances } from "@/hooks/api/console";
import { selectedDatabaseQueryOptions } from "@/hooks/api/database";
import {
  extensionsForDatabaseQueryInput,
  useListAllExtensionsQuery,
} from "@/hooks/api/extension";
import {
  useCheckInstanceActivityQuery,
  useCheckInstanceHealthQuery,
  useDeleteInstanceMutation,
  useGetInstanceOverviewQuery,
  useGetInstanceQuery,
  useUpdateInstanceMutation,
} from "@/hooks/api/instance";
import {
  quantizedMetricsAnchor,
  useInstanceMetricsQuery,
  useInstancePreviousMetricsQuery,
} from "@/hooks/api/metrics";
import { useMinimumSpin } from "@/hooks/use-minimum-spin";
import type { DbConnectionStatus } from "@/lib/console-resources";
import {
  buildInstanceName,
  formatBytes,
  formatUptime,
} from "@/lib/console-resources";
import { useDb } from "@/lib/db-context";
import {
  getMetricPartialErrors,
  type MetricPartialErrors,
} from "@/lib/instance-health";
import {
  CHART_COLORS,
  type ChartRow,
  DEFAULT_METRIC_RANGE,
  decodePoints,
  hasRenderableSpan,
  type MetricRange,
  metricRangeByHours,
  seriesByMetric,
} from "@/lib/metrics";
import { handleNavigationError } from "@/lib/navigation-errors";
import {
  formatReplicationRole,
  toSslMode,
  toSslNegotiation,
} from "@/lib/protobuf-enums";
import { handleQueryActionError } from "@/lib/query-action-errors";
import { createResourceLoader } from "@/lib/resource-loader";
import { prefetchRouteQueryOnIntent } from "@/lib/route-prefetch";
import { normalizeAppUiError } from "@/lib/ui-error";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Status } from "@/protogen/google/rpc/status_pb";
import type {
  ConnectionActivityHealth,
  InstanceHealth,
  InstanceOverview,
  ServerInfo,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  Instance_CredentialState,
  ServerInfo_ReplicationRole,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  MetricId,
  type MetricSeries,
  type QueryMetricsResponse,
} from "@/protogen/querylane/console/v1alpha1/metrics_pb";

type InstanceSection = "activity" | "configuration" | "overview";

interface OverviewLiveData {
  activity: ConnectionActivityHealth | undefined;
  activityPartialErrors: Status[] | undefined;
  activityPending: boolean;
  activityRefreshing: boolean;
  activityUpdatedAt: number;
  /** The server's max_connections, drawn as a threshold on the chart. */
  connectionsMax: number | undefined;
  handleRangeChange: (rangeHours: number) => void;
  health: InstanceHealth | undefined;
  healthPartialErrors: Status[] | undefined;
  healthPending: boolean;
  metricsError: boolean;
  metricsPending: boolean;
  metricsRange: MetricRange;
  /** True while a range switch is showing the previous window's data. */
  metricsRefreshing: boolean;
  metricsResponse: QueryMetricsResponse | undefined;
  /** The window before metricsResponse's, for the comparison overlay. */
  previousMetricsResponse: QueryMetricsResponse | undefined;
}
type DatabaseRow = ReturnType<typeof useDb>["databases"][number];
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const LAST_INSTANCE_DELETE_DISABLED_REASON =
  "Querylane needs at least one registered instance. Add another instance before deleting this one.";
const EMPTY_INSTANCE_CATALOG_DELETE_DISABLED_REASON =
  "No registered instances were found. Refresh the instance list before deleting.";

function getInstanceDeleteDisabledReason({
  credentialsUnreadable,
  instanceCatalogHasError,
  instanceCatalogHasData,
  instanceCatalogHasResolved,
  instanceCount,
}: {
  credentialsUnreadable: boolean;
  instanceCatalogHasError: boolean;
  instanceCatalogHasData: boolean;
  instanceCatalogHasResolved: boolean;
  instanceCount: number;
}) {
  if (instanceCatalogHasError) {
    return "Could not verify registered instances. Refresh data before deleting.";
  }

  if (!(instanceCatalogHasData || instanceCatalogHasResolved)) {
    return "Checking registered instances before delete.";
  }

  if (credentialsUnreadable) {
    return null;
  }

  if (instanceCount === 0) {
    return EMPTY_INSTANCE_CATALOG_DELETE_DISABLED_REASON;
  }

  if (instanceCount <= 1) {
    return LAST_INSTANCE_DELETE_DISABLED_REASON;
  }

  return null;
}

function getInstanceDeleteDestination({
  credentialsUnreadable,
  deleteDisabledReason,
  instanceCount,
}: {
  credentialsUnreadable: boolean;
  deleteDisabledReason: string | null;
  instanceCount: number;
}): "/" | "/new-instance" {
  if (!credentialsUnreadable || deleteDisabledReason || instanceCount > 1) {
    return "/";
  }

  return "/new-instance";
}

function runDeleteNavigationFollowUp(promise: Promise<unknown>) {
  promise.catch((error) => {
    handleNavigationError(error, {
      area: "console.instance.delete.navigate-home",
    });
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

/**
 * The quiet trend glyph beside a header stat value: the metric's queried
 * window as a sparkline. Renders nothing until the series has enough finite
 * points, so tiles stay clean on fresh instances and disconnected ones.
 */
function StatSparkline({
  color,
  series,
}: {
  color: string;
  series: MetricSeries | undefined;
}) {
  if (!series) {
    return null;
  }

  const data: ChartRow[] = decodePoints(series.points).map((point) => ({
    time: point.time,
    value: point.value,
  }));
  if (!hasRenderableSpan(data)) {
    return null;
  }

  return <MetricSparkline color={color} data={data} seriesKey="value" />;
}

function CoreInstanceStatsBar({
  databasesState,
  metricPartialErrors,
  metricsResponse,
  overview,
}: {
  databasesState: InstancePageHeaderDatabasesState;
  metricPartialErrors: MetricPartialErrors;
  metricsResponse?: QueryMetricsResponse | undefined;
  overview?: InstanceOverview | undefined;
}) {
  const connectionPct = getConnectionPct(overview);
  const metricSeries = seriesByMetric(metricsResponse);
  return (
    <InstanceStatsBar>
      <InstanceStatItem
        label="Connections"
        notice={getMetricNotice(metricPartialErrors, "connections")}
        progress={connectionPct}
        renderTrend={() => (
          <StatSparkline
            color={CHART_COLORS[2].color}
            series={metricSeries.get(MetricId.CONNECTIONS_TOTAL)}
          />
        )}
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
        renderTrend={() => (
          <StatSparkline
            color={CHART_COLORS[3].color}
            series={metricSeries.get(MetricId.CACHE_HIT_RATIO)}
          />
        )}
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
        renderTrend={() => (
          <StatSparkline
            color="var(--color-muted-foreground)"
            series={metricSeries.get(MetricId.STORAGE_TOTAL_BYTES)}
          />
        )}
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

function ReplicationRoleBadge({
  serverInfo,
}: {
  serverInfo: ServerInfo | undefined;
}) {
  const role = serverInfo?.replicationRole;
  if (role === undefined || role === ServerInfo_ReplicationRole.UNSPECIFIED) {
    return null;
  }
  return (
    <Badge className="px-2.5 py-0.5 text-xs" variant="default">
      {formatReplicationRole(role)}
    </Badge>
  );
}

function InstancePageHeader({
  connectionStatus,
  databasesState,
  instance,
  isRefreshing,
  lastRefreshedAt,
  metricsResponse,
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
  metricsResponse?: QueryMetricsResponse | undefined;
  onRefresh: () => void;
  overview?: InstanceOverview | undefined;
  partialErrors: Status[];
  serverInfo?: ServerInfo | undefined;
}) {
  const isSpinning = useMinimumSpin(isRefreshing);
  const lastRefreshedLabel = getLastRefreshedLabel(lastRefreshedAt);
  const metricPartialErrors = getMetricPartialErrors(partialErrors);
  const serverInfoNotice = getMetricNotice(metricPartialErrors, "server_info");
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
              <ReplicationRoleBadge serverInfo={serverInfo} />
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
                  isSpinning
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
        {serverInfoNotice ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Server info unavailable</AlertTitle>
            <AlertDescription>
              Querylane is connected, but couldn’t load live server details:{" "}
              {serverInfoNotice}
            </AlertDescription>
          </Alert>
        ) : null}
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
        metricsResponse={metricsResponse}
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
          {count === null ? null : (
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

  function handleClearAll() {
    setDbFilter("");
    setEncodingFilters([]);
    setKindFilters([]);
    setOwnerFilters([]);
  }

  const databaseFacetFilters = [
    {
      label: "Kind",
      onChange: setKindFilters,
      options: presentDatabaseKindOptions(databases),
      selected: kindFilters,
    },
    {
      label: "Owner",
      onChange: setOwnerFilters,
      options: presentDatabaseOwnerOptions(databases),
      selected: ownerFilters,
    },
    {
      label: "Encoding",
      onChange: setEncodingFilters,
      options: presentDatabaseEncodingOptions(databases),
      selected: encodingFilters,
    },
  ] satisfies DataTableFilterFacet[];
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
        <DataTableFilterToolbar
          dataSlot="instance-database-filter-bar"
          facets={databaseFacetFilters}
          onClearAll={handleClearAll}
          onSearchChange={setDbFilter}
          searchPlaceholder="Search databases..."
          searchValue={dbFilter}
        />
      )}
      {databasesContent}
    </section>
  );
}

function InstanceOverviewContent({
  connectionStatus,
  databases,
  extensionsInstalledCount,
  instance,
  instanceId,
  isUnavailable,
  liveData,
  navigateToDatabase,
  onDatabaseIntent,
  queryState,
  serverInfo,
}: {
  connectionStatus: DbConnectionStatus;
  databases: DatabaseRow[];
  extensionsInstalledCount: number | undefined;
  instance: InstanceRecord;
  instanceId: string;
  isUnavailable: boolean;
  liveData: OverviewLiveData;
  navigateToDatabase: ReturnType<typeof useDb>["navigateToDatabase"];
  onDatabaseIntent: (database: DatabaseRow) => void;
  queryState: ReturnType<typeof useDb>["queryStates"]["databases"];
  serverInfo?: ServerInfo | undefined;
}) {
  return (
    <>
      {connectionStatus === "connected" ? (
        // Fixed side-column width: the connections card keeps one internal
        // layout at every two-column viewport instead of shrinking
        // fractionally; below xl it stacks full-width.
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <InstanceMetricsPanel
            connectionsLimit={liveData.connectionsMax}
            isError={liveData.metricsError}
            isPending={liveData.metricsPending}
            isRefreshing={liveData.metricsRefreshing}
            onRangeChange={liveData.handleRangeChange}
            previousResponse={liveData.previousMetricsResponse}
            range={liveData.metricsRange}
            response={liveData.metricsResponse}
          />
          <InstanceConnectionsCard
            activity={liveData.health?.connectionActivity}
            instanceId={instanceId}
            isPending={liveData.healthPending}
          />
        </div>
      ) : null}
      <InstanceHealthSection
        connectionStatus={connectionStatus}
        extensionsInstalledCount={extensionsInstalledCount}
        health={liveData.health}
        healthPartialErrors={liveData.healthPartialErrors}
        healthPending={liveData.healthPending}
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

type FormNotice = { message: string; variant: "error" | "success" } | null;
type InstanceSaveResult =
  | {
      fieldErrors: InstanceFormErrors;
      firstInvalidField: InstanceFormInvalidFieldName | null;
    }
  | undefined;
interface RefetchableQuery {
  refetch: () => Promise<unknown>;
}

function refetchInstancePageQuery(query: RefetchableQuery, area: string) {
  query.refetch().catch((error: unknown) => {
    handleQueryActionError(error, {
      action: "retry",
      area,
    });
  });
}

function refreshInstancePageData({
  activityQuery,
  configuredDatabase,
  extensionsQuery,
  healthQuery,
  instanceQuery,
  isConnected,
  metricsQuery,
  overviewQuery,
  previousMetricsQuery,
  retryInstanceCatalog,
  section,
  setMetricsAnchorMs,
  showActivityLiveData,
  showOverviewLiveData,
}: {
  activityQuery: RefetchableQuery;
  configuredDatabase: string;
  extensionsQuery: RefetchableQuery;
  healthQuery: RefetchableQuery;
  instanceQuery: RefetchableQuery;
  isConnected: boolean;
  metricsQuery: RefetchableQuery;
  overviewQuery: RefetchableQuery;
  previousMetricsQuery: RefetchableQuery;
  retryInstanceCatalog: () => Promise<unknown>;
  section: InstanceSection;
  setMetricsAnchorMs: Dispatch<SetStateAction<number>>;
  showActivityLiveData: boolean;
  showOverviewLiveData: boolean;
}) {
  refetchInstancePageQuery(instanceQuery, "console.instance");
  if (isConnected) {
    refetchInstancePageQuery(overviewQuery, "console.instance.overview");
  }
  if (showOverviewLiveData) {
    // Advance the metrics window to "now" — a plain refetch would re-query
    // the identical frozen interval and charts would never move forward.
    setMetricsAnchorMs(quantizedMetricsAnchor());
    refetchInstancePageQuery(metricsQuery, "console.instance.metrics");
    refetchInstancePageQuery(previousMetricsQuery, "console.instance.metrics");
    refetchInstancePageQuery(healthQuery, "console.instance.health");
  }
  if (showActivityLiveData) {
    refetchInstancePageQuery(activityQuery, "console.instance.activity");
  }
  if (isConnected && section === "overview" && configuredDatabase.length > 0) {
    refetchInstancePageQuery(extensionsQuery, "console.instance.extensions");
  }
  retryInstanceCatalog().catch((error: unknown) => {
    handleQueryActionError(error, {
      action: "retry",
      area: "console.instance.catalog",
    });
  });
}

async function saveInstanceConfiguration(
  rawFormState: InstanceFormState,
  {
    instance,
    instanceQuery,
    isConfigManaged,
    isConnected,
    overviewQuery,
    setConfigFormResetKey,
    setFormNotice,
    updateInstanceMutation,
  }: {
    instance: InstanceRecord | undefined;
    instanceQuery: RefetchableQuery;
    isConfigManaged: boolean;
    isConnected: boolean;
    overviewQuery: RefetchableQuery;
    setConfigFormResetKey: Dispatch<SetStateAction<number>>;
    setFormNotice: Dispatch<SetStateAction<FormNotice>>;
    updateInstanceMutation: ReturnType<typeof useUpdateInstanceMutation>;
  }
): Promise<InstanceSaveResult> {
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
  let saveResult: InstanceSaveResult;
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
      saveResult = {
        fieldErrors: fieldViolationOutcome.fieldErrors,
        firstInvalidField: fieldViolationOutcome.firstInvalidField,
      };
    } else {
      const uiError = normalizeAppUiError(error, {
        action: "save instance configuration",
        area: "console.instance.configuration",
        source: "mutation",
        surface: "inline",
      });
      setFormNotice({ message: uiError.message, variant: "error" });
    }
  }
  return saveResult;
}

async function deleteInstanceFromPage({
  deleteDestination,
  deleteDisabledReason,
  deleteInstanceMutation,
  instance,
  isConfigManaged,
  navigate,
  setFormNotice,
  setIsDeleteDialogOpen,
}: {
  deleteDestination: "/" | "/new-instance";
  deleteDisabledReason: string | null;
  deleteInstanceMutation: ReturnType<typeof useDeleteInstanceMutation>;
  instance: InstanceRecord | undefined;
  isConfigManaged: boolean;
  navigate: ReturnType<typeof useNavigate>;
  setFormNotice: Dispatch<SetStateAction<FormNotice>>;
  setIsDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
}) {
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
    runDeleteNavigationFollowUp(
      navigate({
        replace: true,
        to: deleteDestination,
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
}

function getInstanceLiveDataVisibility({
  isConnected,
  section,
}: {
  isConnected: boolean;
  section: InstanceSection;
}) {
  if (!isConnected) {
    return {
      activity: false,
      overview: false,
    };
  }

  const activity = section === "activity";
  const overview = section === "overview";
  return {
    activity,
    overview,
  };
}

function getConnectedOverview({
  isConnected,
  overview,
}: {
  isConnected: boolean;
  overview: InstanceOverview | undefined;
}) {
  if (!isConnected) {
    return;
  }
  return overview;
}

function getInstalledExtensionCount(
  extensions: readonly { installed: boolean }[] | undefined
) {
  return extensions?.filter((extension) => extension.installed).length;
}

function getSettledMetricsResponse({
  data,
  isPlaceholderData,
}: {
  data: QueryMetricsResponse | undefined;
  isPlaceholderData: boolean;
}) {
  if (isPlaceholderData) {
    return;
  }
  return data;
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
  const credentialsUnreadable =
    instance !== undefined &&
    instance.credentialState !== Instance_CredentialState.UNSPECIFIED;
  useEffect(
    function redirectUnreadableCredentialsToConfiguration() {
      if (!(credentialsUnreadable && section === "overview")) {
        return;
      }

      navigate({
        params: { instanceId },
        replace: true,
        to: "/instances/$instanceId/configuration",
      }).catch((error: unknown) =>
        handleNavigationError(error, {
          area: "console.instance.credentials-recovery",
        })
      );
    },
    [credentialsUnreadable, instanceId, navigate, section]
  );
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
  const overview = getConnectedOverview({
    isConnected,
    overview: overviewQuery.data?.instanceOverview,
  });
  const liveDataVisibility = getInstanceLiveDataVisibility({
    isConnected,
    section,
  });
  // TODO: persist the selected metrics range to the URL so it survives reloads.
  const [metricsRangeHours, setMetricsRangeHours] = useState(
    DEFAULT_METRIC_RANGE.hours
  );
  // One shared anchor for both metrics windows (they must tile exactly);
  // advanced on explicit refresh so the queried window moves forward.
  const [metricsAnchorMs, setMetricsAnchorMs] = useState(
    quantizedMetricsAnchor
  );
  const metricsQuery = useInstanceMetricsQuery({
    instanceId,
    anchorMs: metricsAnchorMs,
    rangeHours: metricsRangeHours,
    options: {
      enabled: liveDataVisibility.overview,
      // Hold the previous window's charts (dimmed) while a range switch loads,
      // instead of flashing the skeleton and jumping layout.
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
    },
  });
  const previousMetricsQuery = useInstancePreviousMetricsQuery({
    instanceId,
    anchorMs: metricsAnchorMs,
    rangeHours: metricsRangeHours,
    options: {
      enabled: liveDataVisibility.overview,
      placeholderData: (previous) => previous,
      refetchOnWindowFocus: false,
    },
  });
  const healthQuery = useCheckInstanceHealthQuery(
    {
      name: instanceName,
    },
    {
      enabled: liveDataVisibility.overview,
      refetchOnWindowFocus: false,
    }
  );
  const activityQuery = useCheckInstanceActivityQuery(
    {
      name: instanceName,
    },
    {
      enabled: liveDataVisibility.activity,
      refetchOnWindowFocus: false,
    }
  );
  const configuredDatabase = instance?.config?.database ?? "";
  // Full (unfiltered) inventory for the configured database: the health
  // facts header shows the installed extension count.
  const extensionsQuery = useListAllExtensionsQuery(
    extensionsForDatabaseQueryInput({
      databaseId: configuredDatabase,
      instanceId,
    }),
    {
      enabled:
        section === "overview" && isConnected && configuredDatabase.length > 0,
      refetchOnWindowFocus: false,
    }
  );
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
    credentialsUnreadable,
    instanceCatalogHasData: queryStates.instances.hasData,
    instanceCatalogHasError: Boolean(queryStates.instances.error),
    instanceCatalogHasResolved: queryStates.instances.hasResolved,
    instanceCount: instances.length,
  });
  const deleteDestination = getInstanceDeleteDestination({
    credentialsUnreadable,
    deleteDisabledReason,
    instanceCount: instances.length,
  });
  const handleRefresh = () => {
    refreshInstancePageData({
      activityQuery,
      configuredDatabase,
      extensionsQuery,
      healthQuery,
      instanceQuery,
      isConnected,
      metricsQuery,
      overviewQuery,
      previousMetricsQuery,
      retryInstanceCatalog,
      section,
      setMetricsAnchorMs,
      showActivityLiveData: liveDataVisibility.activity,
      showOverviewLiveData: liveDataVisibility.overview,
    });
  };
  const handleInvalidSave = () => {
    setFormNotice({
      message: "Fix the highlighted fields, then save again.",
      variant: "error",
    });
  };
  const handleSave = (rawFormState: InstanceFormState) =>
    saveInstanceConfiguration(rawFormState, {
      instance,
      instanceQuery,
      isConfigManaged,
      isConnected,
      overviewQuery,
      setConfigFormResetKey,
      setFormNotice,
      updateInstanceMutation,
    });
  const handleDelete = () =>
    deleteInstanceFromPage({
      deleteDestination,
      deleteDisabledReason,
      deleteInstanceMutation,
      instance,
      isConfigManaged,
      navigate,
      setFormNotice,
      setIsDeleteDialogOpen,
    });
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
            extensionsInstalledCount: getInstalledExtensionCount(
              extensionsQuery.data?.extensions
            ),
            formNotice,
            instance,
            instanceId,
            isConfigManaged,
            isDeleteDialogOpen,
            isInstanceMutationPending,
            isRefreshing,
            lastRefreshedAt: instanceQuery.dataUpdatedAt,
            liveData: {
              activity: activityQuery.data?.activity,
              activityPartialErrors: activityQuery.data?.partialErrors,
              activityPending: activityQuery.isPending,
              activityRefreshing:
                activityQuery.isFetching && !activityQuery.isPending,
              activityUpdatedAt: activityQuery.dataUpdatedAt,
              connectionsMax: overview?.connections?.maxConnections,
              handleRangeChange: setMetricsRangeHours,
              health: healthQuery.data?.health,
              healthPartialErrors: healthQuery.data?.partialErrors,
              healthPending: healthQuery.isPending,
              metricsError: metricsQuery.isError,
              metricsPending: metricsQuery.isPending,
              metricsRange: metricRangeByHours(metricsRangeHours),
              metricsRefreshing: metricsQuery.isPlaceholderData,
              metricsResponse: metricsQuery.data,
              // While a range switch still shows the OLD window as placeholder
              // data, suppress the overlay: shifting the old range's points by
              // the new range's window length would draw it at wrong times.
              previousMetricsResponse: getSettledMetricsResponse({
                data: previousMetricsQuery.data,
                isPlaceholderData: previousMetricsQuery.isPlaceholderData,
              }),
            },
            navigateToDatabase,
            onDatabaseIntent: handleDatabaseIntent,
            onDelete: handleDelete,
            onInvalidSave: handleInvalidSave,
            onOpenDeleteDialogChange: setIsDeleteDialogOpen,
            onRefresh: handleRefresh,
            onSave: handleSave,
            overview,
            partialErrors: getVisiblePartialErrors(isConnected, [
              ...(instanceQuery.data?.partialErrors ?? []),
              ...(overviewQuery.data?.partialErrors ?? []),
            ]),
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
  extensionsInstalledCount,
  formNotice,
  instance,
  instanceId,
  isConfigManaged,
  isDeleteDialogOpen,
  isInstanceMutationPending,
  isRefreshing,
  lastRefreshedAt,
  liveData,
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
  extensionsInstalledCount: number | undefined;
  formNotice: { message: string; variant: "error" | "success" } | null;
  instance: InstanceRecord;
  instanceId: string;
  isConfigManaged: boolean;
  isDeleteDialogOpen: boolean;
  isInstanceMutationPending: boolean;
  isRefreshing: boolean;
  lastRefreshedAt: number;
  liveData: OverviewLiveData;
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
  let sectionContent: React.ReactNode;
  if (section === "configuration") {
    sectionContent = (
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
    );
  } else if (section === "activity") {
    sectionContent = (
      <InstanceActivityPage
        activity={liveData.activity}
        connectionStatus={connectionStatus}
        lastRefreshedLabel={getLastRefreshedLabel(liveData.activityUpdatedAt)}
        onRefresh={onRefresh}
        partialErrors={liveData.activityPartialErrors}
        pending={liveData.activityPending}
        refreshing={liveData.activityRefreshing}
      />
    );
  } else {
    sectionContent = (
      <InstanceOverviewContent
        connectionStatus={connectionStatus}
        databases={databases}
        extensionsInstalledCount={extensionsInstalledCount}
        instance={instance}
        instanceId={instanceId}
        isUnavailable={databasesUnavailable}
        liveData={liveData}
        navigateToDatabase={navigateToDatabase}
        onDatabaseIntent={onDatabaseIntent}
        queryState={queryState}
        serverInfo={serverInfo}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        {/* The activity view brings its own heading + live stats and refreshes
            on its own cadence, so the shared instance header (and its KPI bar)
            would just duplicate that chrome. */}
        {section === "activity" ? null : (
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
            metricsResponse={liveData.metricsResponse}
            onRefresh={onRefresh}
            overview={overview}
            partialErrors={partialErrors}
            serverInfo={serverInfo}
          />
        )}

        {sectionContent}
      </div>

      <InstanceDeleteDialog
        instanceDisplayName={instance.displayName}
        instanceResourceName={instance.name}
        onConfirm={onDelete}
        onOpenChange={onOpenDeleteDialogChange}
        open={isDeleteDialogOpen}
        pending={deletePending}
      />
    </>
  );
}

export { BackendInstancePage };
