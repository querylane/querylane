import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BackendDatabaseExtensionsPage } from "@/components/console-pages/database-extensions-page";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
import { BackendDatabaseQueryInsightsPage } from "@/components/console-pages/database-query-insights-page";
import { BackendInstancePage } from "@/components/console-pages/instance-page";
import {
  DatabaseQueryInsightsSchema,
  DatabaseSchema,
  type GetDatabaseQueryInsightsResponse,
  GetDatabaseQueryInsightsResponseSchema,
  type GetDatabaseResponse,
  GetDatabaseResponseSchema,
  QueryRuntimeInsightSchema,
  SequentialScanHotspotSchema,
  TableCacheHitInsightSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  ExtensionSchema,
  type ListExtensionsResponse,
  ListExtensionsResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/extension_pb";
import {
  CacheMetricsSchema,
  ConnectionMetricsSchema,
  type GetInstanceOverviewResponse,
  GetInstanceOverviewResponseSchema,
  type GetInstanceResponse,
  GetInstanceResponseSchema,
  InstanceOverviewSchema,
  InstanceSchema,
  PostgresConfigSchema,
  ServerInfo_ReplicationRole,
  ServerInfoSchema,
  StorageMetricsSchema,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";

const BLOCKED_ACTIVITY_ROW_NAME =
  /4302.*api-gateway.*UPDATE shipping\.shipments/;

interface QueryState<T> {
  data?: T;
  dataUpdatedAt?: number;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const PG_STAT_STATEMENTS_BUTTON_NAME = /pg_stat_statements/i;
const SHARED_PRELOAD_LIBRARIES_TEXT = /Loaded via shared_preload_libraries/;
const TIMESCALEDB_BUTTON_NAME = /timescaledb/i;

const state = vi.hoisted(() => ({
  catalogQuery: {} as { data?: unknown; error?: unknown; isPending?: boolean },
  databaseQuery: {} as QueryState<GetDatabaseResponse>,
  deleteInstance: vi.fn(async () => undefined),
  extensionQuery: {} as QueryState<ListExtensionsResponse>,
  healthQuery: {} as QueryState<{
    health?: {
      connectionActivity?: {
        activeConnections: number;
        byApplication: {
          activeConnections: number;
          applicationName: string;
          idleConnections: number;
          idleInTransactionConnections: number;
          totalConnections: number;
        }[];
        idleConnections: number;
        idleInTransactionConnections: number;
        longestTransactionSeconds: bigint;
        longRunningTransactionConnections: number;
        sessions: {
          applicationName: string;
          blockedByPid?: number;
          databaseName: string;
          durationSeconds: bigint;
          pid: number;
          query: string;
          state: string;
          username: string;
          waitEvent?: string;
          waitEventType?: string;
        }[];
        totalConnections: number;
        waitingForLockConnections: number;
      };
    };
    partialErrors?: unknown[];
  }>,
  instanceQuery: {} as QueryState<GetInstanceResponse>,
  navigate: vi.fn(async () => undefined),
  overviewQuery: {} as QueryState<GetInstanceOverviewResponse>,
  queryClient: {
    getQueryState: vi.fn(() => undefined),
    prefetchQuery: vi.fn(async () => undefined),
  },
  queryInsightsQuery: {} as QueryState<GetDatabaseQueryInsightsResponse>,
  selectedInstanceStatus: "connected" as "connected" | "disconnected",
}));

vi.mock("@tanstack/react-router", () => ({
  ["Link"]: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: ({
    select,
  }: {
    select?: (location: {
      hash: string;
      pathname: string;
      searchStr: string;
    }) => unknown;
  } = {}) => {
    const location = { hash: "", pathname: "/instances/prod", searchStr: "" };
    return select ? select(location) : location;
  },
  useNavigate: () => state.navigate,
  useSearch: ({
    select,
  }: {
    select?: (search: Record<string, unknown>) => unknown;
  } = {}) => (select ? select({}) : {}),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
  useTransport: () => ({}),
}));

function defaultHealthResponse() {
  return {
    health: {
      connectionActivity: {
        activeConnections: 18,
        byApplication: [],
        idleConnections: 54,
        idleInTransactionConnections: 2,
        longestTransactionSeconds: 0n,
        longRunningTransactionConnections: 0,
        maxConnections: 100,
        sessions: [],
        status: 1,
        summary: "74 connections",
        totalConnections: 74,
        utilizationRatio: 0.74,
        waitingForLockConnections: 0,
      },
    },
    partialErrors: [],
  };
}

beforeEach(() => {
  window.localStorage.removeItem("querylane-browser-test-theme");
  const visualTheme =
    document.documentElement.dataset["visualTheme"] === "dark"
      ? "dark"
      : "light";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(visualTheme);
  document.documentElement.style.colorScheme = visualTheme;
  state.catalogQuery = {};
  state.databaseQuery = {};
  state.extensionQuery = {};
  state.healthQuery = { data: defaultHealthResponse() };
  state.queryInsightsQuery = {};
  state.selectedInstanceStatus = "connected";
  state.instanceQuery = {};
  state.overviewQuery = {};
  state.queryClient.getQueryState.mockReset();
  state.queryClient.getQueryState.mockReturnValue(undefined);
  state.queryClient.prefetchQuery.mockReset();
  state.queryClient.prefetchQuery.mockResolvedValue(undefined);
  state.deleteInstance.mockReset();
  state.deleteInstance.mockResolvedValue(undefined);
  state.navigate.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query"
  );
  return {
    ...actual,
    useQueryClient: () => state.queryClient,
  };
});

vi.mock("@/hooks/api/console", () => ({
  useConfigManagedInstancesStatus: () => ({
    isConfigManaged: false,
    isLoaded: true,
  }),
  useIsConfigManagedInstances: () => false,
}));

vi.mock("@/hooks/api/database", () => ({
  selectedDatabaseQueryOptions: () => ({
    queryKey: ["browser", "selected-database"],
  }),
  useGetDatabaseQuery: () => ({
    data: state.databaseQuery.data,
    error: state.databaseQuery.error ?? null,
    isFetching: state.databaseQuery.isFetching ?? false,
    isPending: state.databaseQuery.isPending ?? false,
    refetch: state.databaseQuery.refetch ?? vi.fn(async () => undefined),
  }),
  useGetDatabaseQueryInsightsQuery: () => ({
    data: state.queryInsightsQuery.data,
    error: state.queryInsightsQuery.error ?? null,
    isFetching: state.queryInsightsQuery.isFetching ?? false,
    isPending: state.queryInsightsQuery.isPending ?? false,
    refetch: state.queryInsightsQuery.refetch ?? vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/api/database-catalog", () => ({
  useDatabaseCatalogQuery: () => ({
    data: state.catalogQuery.data,
    error: state.catalogQuery.error ?? null,
    isPending: state.catalogQuery.isPending ?? false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/api/extension", () => ({
  extensionsForDatabaseQueryInput: (input: {
    databaseId: string;
    instanceId: string;
  }) => ({
    orderBy: "installed desc",
    pageSize: 50,
    parent: `instances/${input.instanceId}/databases/${input.databaseId}`,
  }),
  useListAllExtensionsQuery: () => ({
    data: state.extensionQuery.data,
    error: state.extensionQuery.error ?? null,
    isPending: state.extensionQuery.isPending ?? false,
    refetch: state.extensionQuery.refetch ?? vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/api/instance", () => ({
  refreshAllInstancesCache: vi.fn(async () => ({ instances: [] })),
  useCheckInstanceActivityQuery: () => ({
    data: state.healthQuery.data
      ? {
          activity: state.healthQuery.data.health?.connectionActivity,
          partialErrors: state.healthQuery.data.partialErrors,
        }
      : undefined,
    error: state.healthQuery.error ?? null,
    isFetching: state.healthQuery.isFetching ?? false,
    isPending: state.healthQuery.isPending ?? false,
    refetch: state.healthQuery.refetch ?? vi.fn(async () => ({})),
  }),
  useCheckInstanceHealthQuery: () => ({
    data: state.healthQuery.data,
    error: state.healthQuery.error ?? null,
    isFetching: state.healthQuery.isFetching ?? false,
    isPending: state.healthQuery.isPending ?? false,
    refetch: state.healthQuery.refetch ?? vi.fn(async () => ({})),
  }),
  useDeleteInstanceMutation: () => ({
    isPending: false,
    mutateAsync: state.deleteInstance,
  }),
  useGetInstanceOverviewQuery: () => ({
    data: state.overviewQuery.data,
    error: state.overviewQuery.error ?? null,
    isFetching: state.overviewQuery.isFetching ?? false,
    isPending: state.overviewQuery.isPending ?? false,
    refetch: state.overviewQuery.refetch ?? vi.fn(async () => undefined),
  }),
  useGetInstanceQuery: () => ({
    data: state.instanceQuery.data,
    dataUpdatedAt: state.instanceQuery.dataUpdatedAt ?? 0,
    error: state.instanceQuery.error ?? null,
    isFetching: state.instanceQuery.isFetching ?? false,
    isPending: state.instanceQuery.isPending ?? false,
    refetch: state.instanceQuery.refetch ?? vi.fn(async () => undefined),
  }),
  useUpdateInstanceMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({
    databases: [
      {
        characterSet: "UTF8",
        collation: "en_US.UTF-8",
        id: "customer-events",
        isSystemDatabase: false,
        name: "customer_events",
        owner: "data-platform",
        resourceName: "instances/prod/databases/customer-events",
      },
      {
        characterSet: "UTF8",
        collation: "C",
        id: "postgres",
        isSystemDatabase: true,
        name: "postgres",
        owner: "postgres",
        resourceName: "instances/prod/databases/postgres",
      },
    ],
    instances: [
      {
        connectionError: "",
        host: "analytics-writer.internal.querylane.test",
        id: "prod",
        name: "Production Analytics Writer",
        port: 5432,
        resourceName: "instances/prod",
        status: "connected",
      },
      {
        connectionError: "",
        host: "analytics-reader.internal.querylane.test",
        id: "reader",
        name: "Production Analytics Reader",
        port: 5432,
        resourceName: "instances/reader",
        status: "connected",
      },
    ],
    navigateToDatabase: vi.fn(),
    queryStates: {
      databases: {
        error: null,
        hasData: true,
        hasResolved: true,
        isFetching: false,
        isPending: false,
        isSuppressed: false,
        status: "success",
        suppressedReason: null,
      },
      instances: {
        error: null,
        hasData: true,
        hasResolved: true,
        isFetching: false,
        isPending: false,
        isSuppressed: false,
        status: "success",
        suppressedReason: null,
      },
    },
    retryInstanceCatalog: vi.fn(async () => undefined),
    selectedInstance: {
      connectionError: "",
      host: "analytics-writer.internal.querylane.test",
      id: "prod",
      name: "Production Analytics Writer",
      port: 5432,
      resourceName: "instances/prod",
      status: state.selectedInstanceStatus,
    },
  }),
}));

function instanceResponse() {
  return createProto(GetInstanceResponseSchema, {
    instance: createProto(InstanceSchema, {
      config: createProto(PostgresConfigSchema, {
        database: "postgres",
        host: "analytics-writer.internal.querylane.test",
        port: 5432,
        username: "postgres",
      }),
      displayName: "Production Analytics Writer",
      labels: { environment: "production", team: "data-platform" },
      name: "instances/prod",
    }),
    serverInfo: createProto(ServerInfoSchema, {
      maxConnections: 250,
      replicationRole: ServerInfo_ReplicationRole.PRIMARY,
      versionNum: 1_704_000,
      versionShort: "17.4",
    }),
  });
}

function extensionInventoryResponse() {
  return createProto(ListExtensionsResponseSchema, {
    extensions: [
      createProto(ExtensionSchema, {
        displayName: "pg_stat_statements",
        installed: true,
        installedVersion: "1.10",
        schema: "public",
      }),
    ],
  });
}

function extensionDesignInventoryResponse() {
  return createProto(ListExtensionsResponseSchema, {
    extensions: [
      createProto(ExtensionSchema, {
        comment:
          "Track planning and execution statistics of all SQL statements",
        defaultVersion: "1.10",
        displayName: "pg_stat_statements",
        installed: true,
        installedVersion: "1.10",
        name: "instances/prod/databases/customer-events/extensions/pg_stat_statements",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment:
          "Cryptographic functions — hashing, HMAC, symmetric and public-key encryption",
        defaultVersion: "1.3",
        displayName: "pgcrypto",
        installed: true,
        installedVersion: "1.3",
        name: "instances/prod/databases/customer-events/extensions/pgcrypto",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment: "Generate universally unique identifiers (v1, v3, v4, v5)",
        defaultVersion: "1.1",
        displayName: "uuid-ossp",
        installed: true,
        installedVersion: "1.1",
        name: "instances/prod/databases/customer-events/extensions/uuid-ossp",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment:
          "Trigram matching — fuzzy text search and fast LIKE/ILIKE indexing",
        defaultVersion: "1.6",
        displayName: "pg_trgm",
        installed: true,
        installedVersion: "1.6",
        name: "instances/prod/databases/customer-events/extensions/pg_trgm",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment:
          "Vector similarity search — embeddings storage with HNSW and IVFFlat indexes",
        defaultVersion: "0.8.0",
        displayName: "pgvector",
        installed: true,
        installedVersion: "v0.8.0",
        name: "instances/prod/databases/customer-events/extensions/pgvector",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment:
          "Geospatial types, indexes, and functions — points, polygons, distances, projections",
        defaultVersion: "3.4.2",
        displayName: "postgis",
        installed: true,
        installedVersion: "v3.4.2",
        name: "instances/prod/databases/customer-events/extensions/postgis",
        schema: "public",
      }),
      createProto(ExtensionSchema, {
        comment:
          "Hypertables — automatic time partitioning, compression, and continuous aggregates",
        defaultVersion: "2.17",
        displayName: "timescaledb",
        installed: false,
        name: "instances/prod/databases/customer-events/extensions/timescaledb",
      }),
    ],
  });
}

function overviewResponse() {
  return createProto(GetInstanceOverviewResponseSchema, {
    instanceOverview: createProto(InstanceOverviewSchema, {
      cache: createProto(CacheMetricsSchema, {
        blocksHit: 987_654n,
        blocksRead: 12_345n,
        hitRatio: 0.988,
      }),
      connections: createProto(ConnectionMetricsSchema, {
        activeConnections: 18,
        idleConnections: 56,
        maxConnections: 250,
        totalConnections: 74,
      }),
      storage: createProto(StorageMetricsSchema, {
        totalSizeBytes: 1_250_000_000_000n,
      }),
    }),
  });
}

function activityHealthResponse() {
  return {
    health: {
      connectionActivity: {
        activeConnections: 41,
        byApplication: [
          {
            activeConnections: 20,
            applicationName: "api-gateway",
            idleConnections: 14,
            idleInTransactionConnections: 0,
            totalConnections: 34,
          },
          {
            activeConnections: 8,
            applicationName: "worker-pool",
            idleConnections: 20,
            idleInTransactionConnections: 5,
            totalConnections: 33,
          },
          {
            activeConnections: 3,
            applicationName: "metabase",
            idleConnections: 11,
            idleInTransactionConnections: 0,
            totalConnections: 14,
          },
        ],
        idleConnections: 118,
        idleInTransactionConnections: 9,
        longestTransactionSeconds: 252n,
        longRunningTransactionConnections: 1,
        maxConnections: 250,
        sessions: [
          {
            applicationName: "worker-pool",
            databaseName: "logistics",
            durationSeconds: 252n,
            pid: 4211,
            query:
              "UPDATE shipping.shipments SET status = 'in_transit', updated_at = now() WHERE id = $1",
            state: "idle in transaction",
            username: "app_readwrite",
          },
          {
            applicationName: "api-gateway",
            blockedByPid: 4211,
            databaseName: "logistics",
            durationSeconds: 38n,
            pid: 4302,
            query: "UPDATE shipping.shipments SET eta = $1 WHERE id = $2",
            state: "active",
            username: "app_readwrite",
            waitEvent: "transactionid",
            waitEventType: "Lock",
          },
          {
            applicationName: "api-gateway",
            blockedByPid: 4211,
            databaseName: "logistics",
            durationSeconds: 21n,
            pid: 4318,
            query: "SELECT * FROM shipping.shipments WHERE id = $1 FOR UPDATE",
            state: "active",
            username: "app_readwrite",
            waitEvent: "tuple",
            waitEventType: "Lock",
          },
          {
            applicationName: "api-gateway",
            databaseName: "logistics",
            durationSeconds: 0n,
            pid: 3987,
            query:
              "SELECT s.*, c.name FROM shipping.shipments s JOIN shipping.carriers c ON c.id = s.carrier_id WHERE s.status = ANY($1)",
            state: "active",
            username: "app_readwrite",
          },
          {
            applicationName: "metabase",
            databaseName: "billing",
            durationSeconds: 2n,
            pid: 4402,
            query:
              "SELECT date_trunc('week', issued_at) AS wk, sum(amount) FROM billing.invoices GROUP BY 1 ORDER BY 1",
            state: "active",
            username: "analytics_reader",
          },
        ],
        status: 2,
        summary: "171 connections",
        totalConnections: 171,
        utilizationRatio: 0.684,
        waitingForLockConnections: 3,
      },
    },
    partialErrors: [],
  };
}

function databaseResponse() {
  return createProto(GetDatabaseResponseSchema, {
    database: createProto(DatabaseSchema, {
      characterSet: "UTF8",
      collation: "en_US.UTF-8",
      displayName: "customer_events",
      isSystemDatabase: false,
      name: "instances/prod/databases/customer-events",
      owner: "data-platform",
    }),
  });
}

function queryInsightsResponse() {
  return createProto(GetDatabaseQueryInsightsResponseSchema, {
    queryInsights: createProto(DatabaseQueryInsightsSchema, {
      observedAt: timestampFromDate(new Date("2026-05-20T12:00:00Z")),
      queryStatsAvailable: true,
      sequentialScanHotspots: [
        createProto(SequentialScanHotspotSchema, {
          estimatedLiveRows: 50_000n,
          indexScans: 3n,
          schemaName: "public",
          sequentialScanRatio: 0.8,
          sequentialScans: 12n,
          sequentialTuplesRead: 120_000n,
          tableName: "events",
          totalSizeBytes: 268_435_456n,
        }),
      ],
      tableCacheHits: [
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 900n,
          heapBlocksRead: 100n,
          hitRatio: 0.9,
          schemaName: "public",
          tableName: "events",
          totalSizeBytes: 268_435_456n,
        }),
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 500n,
          heapBlocksRead: 250n,
          hitRatio: 0.67,
          schemaName: "analytics",
          tableName: "daily_rollup_cache",
          totalSizeBytes: 134_217_728n,
        }),
      ],
      tableStatsAvailable: true,
      topQueries: [
        createProto(QueryRuntimeInsightSchema, {
          calls: 42n,
          meanTimeMs: 20,
          query: "SELECT * FROM events WHERE account_id = $1",
          queryId: 123n,
          totalTimeMs: 840,
          totalTimeRatio: 1,
        }),
        createProto(QueryRuntimeInsightSchema, {
          calls: 8n,
          meanTimeMs: 26.25,
          query: "UPDATE events SET processed_at = $1 WHERE id = $2",
          queryId: 456n,
          totalTimeMs: 210,
          totalTimeRatio: 0.25,
        }),
      ],
    }),
  });
}

function catalogResult() {
  return {
    objects: [
      {
        comment: "",
        isMaterialized: false,
        isPopulated: true,
        isSystem: false,
        kind: "table" as const,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/public/tables/events",
        objectId: "events",
        owner: "data-platform",
        rowCount: 1_280_000n,
        schemaId: "public",
        sizeBytes: 5_368_709_120n,
      },
      {
        comment: "",
        isMaterialized: true,
        isPopulated: true,
        isSystem: false,
        kind: "view" as const,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/analytics/views/daily_rollup",
        objectId: "daily_rollup",
        owner: "data-platform",
        rowCount: 4200n,
        schemaId: "analytics",
        sizeBytes: 268_435_456n,
      },
    ],
    schemas: [
      {
        estimatedRows: 1_280_000,
        isSystemSchema: false,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/public",
        owner: "data-platform",
        schemaId: "public",
        tableCount: 1,
        totalSizeBytes: 5_368_709_120n,
        viewCount: 0,
      },
      {
        estimatedRows: 0,
        isSystemSchema: false,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/analytics",
        owner: "data-platform",
        schemaId: "analytics",
        tableCount: 0,
        totalSizeBytes: 268_435_456n,
        viewCount: 1,
      },
    ],
    syncMetadata: undefined,
    totals: {
      estimatedRows: 1_280_000,
      schemaCount: 2,
      tableCount: 1,
      totalSizeBytes: 5_637_144_576n,
      viewCount: 1,
    },
  };
}

test("backend instance overview shows live metrics and database catalog together", async () => {
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.overviewQuery = { data: overviewResponse() };
  state.extensionQuery = { data: extensionInventoryResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="overview" />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByText("Production Analytics Writer"))
    .toBeVisible();
  await expect
    .element(page.getByText("Primary", { exact: true }))
    .toBeVisible();
  await expect.element(page.getByText("74")).toBeVisible();
  await expect
    .element(page.getByPlaceholder("Search databases..."))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Kind" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Encoding" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { exact: true, name: "Owner" }))
    .toBeVisible();
  await expect.element(page.getByText("customer_events")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-instance-overview"
  );
});

test("backend instance activity matches the live sessions redesign", async () => {
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.healthQuery = { data: activityHealthResponse() };
  state.overviewQuery = { data: overviewResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1160px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="activity" />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Activity" }))
    .toBeVisible();
  await expect.element(page.getByText("Blocking chain")).toBeVisible();
  await expect.element(page.getByText("blocker · pid 4211")).toBeVisible();
  await expect.element(page.getByText("PID")).toBeVisible();
  await expect.element(page.getByText("User · app")).toBeVisible();
  await expect
    .element(
      page.getByRole("row", {
        name: BLOCKED_ACTIVITY_ROW_NAME,
      })
    )
    .toBeVisible();
  await document.fonts.ready;
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-instance-activity"
  );
});

test("backend instance activity empty state matches", async () => {
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.healthQuery = { data: defaultHealthResponse() };
  state.overviewQuery = { data: overviewResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1160px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="activity" />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("No activity sessions")).toBeVisible();
  await document.fonts.ready;
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-instance-activity-empty"
  );
});

test("backend instance activity unavailable state matches", async () => {
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.healthQuery = {
    data: {
      health: {},
      partialErrors: [{ message: "permission denied for pg_stat_activity" }],
    },
  };
  state.overviewQuery = { data: overviewResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1160px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="activity" />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByText("Activity data unavailable"))
    .toBeVisible();
  await document.fonts.ready;
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-instance-activity-unavailable"
  );
});

test("backend instance activity disconnected state matches", async () => {
  state.selectedInstanceStatus = "disconnected";
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.healthQuery = { data: activityHealthResponse(), isPending: false };
  state.overviewQuery = { data: overviewResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1160px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="activity" />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Activity unavailable")).toBeVisible();
  await expect
    .element(page.getByText("Loading activity..."))
    .not.toBeInTheDocument();
  await document.fonts.ready;
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-instance-activity-disconnected"
  );
});

test("backend database overview shows mission control stats and catalog tables", async () => {
  state.databaseQuery = { data: databaseResponse() };
  state.catalogQuery = { data: catalogResult() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabasePage
          databaseId="customer-events"
          instanceId="prod"
          section="overview"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("customer_events")).toBeVisible();
  await expect.element(page.getByText("Largest objects")).toBeVisible();
  await expect.element(page.getByText("public.events")).toBeVisible();
  await expect.element(page.getByText("analytics.daily_rollup")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-database-overview"
  );
});

test("backend database overview shows query insights", async () => {
  state.databaseQuery = { data: databaseResponse() };
  state.catalogQuery = { data: catalogResult() };
  state.queryInsightsQuery = { data: queryInsightsResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabasePage
          databaseId="customer-events"
          instanceId="prod"
          section="overview"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Query insights")).toBeVisible();
  await expect
    .element(page.getByText("Top queries by total time"))
    .toBeVisible();
  await expect
    .element(page.getByText("Sequential scan hotspots"))
    .toBeVisible();
  await expect.element(page.getByText("Cache hit by table")).toBeVisible();
  await expect(page.getByTestId("database-query-insights")).toMatchScreenshot(
    "backend-database-query-insights-overview"
  );
});

test("backend database extensions page matches design source", async () => {
  state.extensionQuery = { data: extensionDesignInventoryResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabaseExtensionsPage
          databaseId="customer-events"
          instanceId="prod"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Extensions" }))
    .toBeVisible();
  await expect.element(page.getByText("pg_stat_statements")).toBeVisible();
  await expect.element(page.getByText("powers Query insights")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-database-extensions"
  );
});

test("backend database extensions drawer matches design source", async () => {
  state.extensionQuery = { data: extensionDesignInventoryResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabaseExtensionsPage
          databaseId="customer-events"
          instanceId="prod"
        />
      </div>
    </ScreenshotFrame>
  );

  await page
    .getByRole("button", { name: PG_STAT_STATEMENTS_BUTTON_NAME })
    .click();

  const drawer = page.getByRole("dialog", {
    name: "pg_stat_statements details",
  });
  await expect.element(drawer).toBeVisible();
  await expect
    .element(page.getByText(SHARED_PRELOAD_LIBRARIES_TEXT))
    .toBeVisible();
  await expect.element(page.getByText("pg_stat_statements view")).toBeVisible();
  await expect.element(page.getByText("track_planning setting")).toBeVisible();
  await expect(drawer).toMatchScreenshot("backend-database-extensions-drawer");
});

test("backend database extensions available drawer matches design source", async () => {
  state.extensionQuery = { data: extensionDesignInventoryResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabaseExtensionsPage
          databaseId="customer-events"
          instanceId="prod"
        />
      </div>
    </ScreenshotFrame>
  );

  await page
    .getByRole("textbox", { name: "Search extensions..." })
    .fill("timescaledb");
  await expect.element(page.getByText("Available")).toBeVisible();
  await expect.element(page.getByText("available to install")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "backend-database-extensions-available"
  );

  await page.getByRole("button", { name: TIMESCALEDB_BUTTON_NAME }).click();

  const drawer = page.getByRole("dialog", { name: "timescaledb details" });
  await expect.element(drawer).toBeVisible();
  await expect
    .element(page.getByText("A superuser can install it with:"))
    .toBeVisible();
  await expect(drawer).toMatchScreenshot(
    "backend-database-extensions-available-drawer"
  );
});

test("backend database query insights page follows redesign", async () => {
  state.databaseQuery = { data: databaseResponse() };
  state.queryInsightsQuery = { data: queryInsightsResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1280px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendDatabaseQueryInsightsPage
          databaseId="customer-events"
          instanceId="prod"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Query insights" }))
    .toBeVisible();
  await expect
    .element(page.getByText("Top queries by total time"))
    .toBeVisible();
  await expect
    .element(page.getByText("Sequential scan hotspots"))
    .toBeVisible();
  await expect.element(page.getByText("Cache hit by table")).toBeVisible();
  await expect
    .element(page.getByRole("region", { name: "Query detail" }))
    .toBeVisible();
});

test("backend instance delete navigates without waiting for catalog refresh", async () => {
  state.instanceQuery = {
    data: instanceResponse(),
    dataUpdatedAt: Date.UTC(2026, 4, 20, 12, 0, 0),
  };
  state.overviewQuery = { data: overviewResponse() };

  render(
    <ScreenshotFrame>
      <div className="w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <BackendInstancePage instanceId="prod" section="configuration" />
      </div>
    </ScreenshotFrame>
  );

  await page
    .getByTestId("instance-danger-zone")
    .getByRole("button", { name: "Delete instance" })
    .click();
  await page
    .getByLabelText("Type instances/prod to confirm")
    .fill("instances/prod");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete instance" })
    .click();

  await expect.poll(() => state.navigate.mock.calls.length).toBe(1);
  expect(state.navigate).toHaveBeenCalledWith({ replace: true, to: "/" });
});
