import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
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

interface QueryState<T> {
  data?: T;
  dataUpdatedAt?: number;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const state = vi.hoisted(() => ({
  catalogQuery: {} as { data?: unknown; error?: unknown; isPending?: boolean },
  databaseQuery: {} as QueryState<GetDatabaseResponse>,
  deleteInstance: vi.fn(async () => undefined),
  extensionQuery: {} as QueryState<ListExtensionsResponse>,
  instanceQuery: {} as QueryState<GetInstanceResponse>,
  navigate: vi.fn(async () => undefined),
  overviewQuery: {} as QueryState<GetInstanceOverviewResponse>,
  queryClient: {
    getQueryState: vi.fn(() => undefined),
    prefetchQuery: vi.fn(async () => undefined),
  },
  queryInsightsQuery: {} as QueryState<GetDatabaseQueryInsightsResponse>,
}));

beforeEach(() => {
  state.catalogQuery = {};
  state.databaseQuery = {};
  state.extensionQuery = {};
  state.queryInsightsQuery = {};
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

vi.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    [linkExportName]: ({
      children,
      to,
    }: {
      children: ReactNode;
      to: string;
    }) => <a href={to}>{children}</a>,
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
  };
});

vi.mock("@connectrpc/connect-query", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(() => ({ data: undefined, isFetching: false })),
  useTransport: () => ({}),
}));

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
  useCheckInstanceHealthQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(async () => undefined),
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
      status: "connected",
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
