import { create as createProto, toBinary } from "@bufbuild/protobuf";
import { anyPack } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from "@rstest/core";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
import { DatabaseQueryInsightsContent } from "@/components/console-pages/database-query-insights-content";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
import { StatusSchema } from "@/protogen/google/rpc/status_pb";
import {
  DatabaseQueryInsightsSchema,
  DatabaseSchema,
  type GetDatabaseQueryInsightsResponse,
  GetDatabaseQueryInsightsResponseSchema,
  type GetDatabaseResponse,
  GetDatabaseResponseSchema,
  type QueryRuntimeInsight,
  QueryRuntimeInsightSchema,
  type SequentialScanHotspot,
  SequentialScanHotspotSchema,
  type TableCacheHitInsight,
  TableCacheHitInsightSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";
import {
  PostgreSqlErrorDetailSchema,
  PostgreSqlErrorKind,
  PostgreSqlErrorRetryGuidance,
} from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { MetricId } from "@/protogen/querylane/console/v1alpha1/metrics_pb";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface QueryState<T> {
  data?: T;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const LOWER_BOUND_CATALOG_RE = /Counts, sizes, and rankings are lower bounds/;
const state = rs.hoisted(() => ({
  catalogQuery: {} as { data?: unknown; error?: unknown; isPending?: boolean },
  databaseQuery: {} as QueryState<GetDatabaseResponse>,
  databasesQuery: {} as { data?: unknown; isPending?: boolean },
  extensionsQuery: {} as { data?: unknown; isPending?: boolean },
  metricsQuery: {} as { data?: unknown; isPending?: boolean },
  navigate: rs.fn(async () => undefined),
  otherObjectsQuery: {} as {
    data?: unknown;
    error?: unknown;
    isLoading?: boolean;
  },
  queryInsightsHook: rs.fn(),
  queryInsightsQuery: {} as QueryState<GetDatabaseQueryInsightsResponse>,
}));
const SELECT_EVENTS_QUERY_BUTTON_RE =
  /SELECT \* FROM events WHERE account_id = \$1/i;
const UPDATE_EVENTS_QUERY_BUTTON_RE =
  /UPDATE events SET processed_at = now\(\) WHERE id = \$1/i;
const WITH_UPDATE_QUERY_BUTTON_RE =
  /WITH moved AS \(UPDATE events SET processed_at = now\(\) RETURNING \*\) SELECT \* FROM moved/i;
const EXPLAIN_UPDATE_QUERY_BUTTON_RE =
  /EXPLAIN ANALYZE UPDATE events SET processed_at = now\(\) WHERE id = \$1/i;
const TABLE_EVENTS_QUERY_BUTTON_RE = /TABLE events/i;
const VALUES_QUERY_BUTTON_RE = /VALUES \(\$1\)/i;
const COPY_TO_QUERY_BUTTON_RE = /COPY events TO STDOUT/i;
const COPY_FROM_QUERY_BUTTON_RE = /COPY events FROM STDIN/i;
const COPY_SELECT_TO_QUERY_BUTTON_RE =
  /COPY \(SELECT \* FROM events\) TO STDOUT/i;
const COPY_TO_PATH_WITH_FROM_BUTTON_RE =
  /COPY events TO '\/tmp\/from\/archive\.csv'/i;
const COPY_FROM_PROGRAM_WITH_TO_BUTTON_RE =
  /COPY events FROM PROGRAM 'echo TO file'/i;
const COPY_COLUMN_TO_FROM_BUTTON_RE = /COPY events \(id, "to"\) FROM STDIN/i;
const COMMENTED_SELECT_QUERY_BUTTON_RE =
  /\/\* trace: dashboard \*\/ SELECT \* FROM events/i;
const COMMENTED_UPDATE_QUERY_BUTTON_RE =
  /-- trace: worker\s+UPDATE events SET processed_at = now\(\)/i;
const EXACT_THRESHOLD_QUERY_BUTTON_RE =
  /SELECT avg\(duration_ms\) FROM events/i;
const SLOW_COUNT_QUERY_BUTTON_RE = /SELECT count\(\*\) FROM events/i;
const QUERY_STATS_UNAVAILABLE_RE =
  /Query statistics are unavailable for this database/;

rs.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    [linkExportName]: ({
      children,
      className,
      params,
      search,
      to,
    }: {
      children: ReactNode;
      className?: string;
      params?: unknown;
      search?: unknown;
      to?: string;
    }) => (
      <a
        className={className}
        data-link-params={JSON.stringify(params ?? null)}
        data-link-search={JSON.stringify(search ?? null)}
        href={to ?? "/"}
      >
        {children}
      </a>
    ),
    useNavigate: () => state.navigate,
  };
});

rs.mock("@/hooks/api/database", () => ({
  databasesForInstanceQueryInput: (instanceId: string) => ({
    parent: instanceId,
  }),
  useListAllDatabasesQuery: () => ({
    data: state.databasesQuery.data,
    error: null,
    isPending: state.databasesQuery.isPending ?? false,
  }),
  useGetDatabaseQuery: () => ({
    data: state.databaseQuery.data,
    error: state.databaseQuery.error ?? null,
    isFetching: state.databaseQuery.isFetching ?? false,
    isPending: state.databaseQuery.isPending ?? false,
    refetch: state.databaseQuery.refetch ?? rs.fn(async () => undefined),
  }),
  useGetDatabaseQueryInsightsQuery: () => {
    state.queryInsightsHook();
    return {
      data: state.queryInsightsQuery.data,
      error: state.queryInsightsQuery.error ?? null,
      isFetching: state.queryInsightsQuery.isFetching ?? false,
      isPending: state.queryInsightsQuery.isPending ?? false,
      refetch: state.queryInsightsQuery.refetch ?? rs.fn(async () => undefined),
    };
  },
}));

rs.mock("@/hooks/api/database-catalog", () => ({
  useDatabaseCatalogQuery: () => ({
    data: state.catalogQuery.data,
    error: state.catalogQuery.error ?? null,
    isPending: state.catalogQuery.isPending ?? false,
    refetch: rs.fn(async () => undefined),
  }),
}));

rs.mock("@/components/console-pages/other-database-objects-query", () => ({
  useOtherDatabaseObjectsSummaryQuery: () => ({
    data: state.otherObjectsQuery.data,
    error: state.otherObjectsQuery.error ?? null,
    isLoading: state.otherObjectsQuery.isLoading ?? false,
    refetch: rs.fn(async () => undefined),
  }),
  useOtherObjectsBrowseQuery: () => ({
    data: { pages: [] },
    error: null,
    fetchNextPage: rs.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: rs.fn(async () => undefined),
  }),
}));

rs.mock("@/hooks/api/extension", () => ({
  extensionsForDatabaseQueryInput: (input: unknown) => input,
  useListAllExtensionsQuery: () => ({
    data: state.extensionsQuery.data,
    error: null,
    isPending: state.extensionsQuery.isPending ?? false,
  }),
}));

rs.mock("@/hooks/api/metrics", () => ({
  quantizedMetricsAnchor: () => 0,
  useDatabaseMetricsQuery: () => ({
    data: state.metricsQuery.data,
    error: null,
    isPending: state.metricsQuery.isPending ?? false,
  }),
}));

const POSTGRES_DETAIL_TYPE = "querylane.console.v1alpha1.PostgreSqlErrorDetail";

function createCatalogPostgresError() {
  const error = new ConnectError(
    "PostgreSQL invalid_password during list_views",
    Code.Unauthenticated
  );
  error.details = [
    {
      debug: {
        domain: "console.querylane.dev",
        metadata: {
          condition_name: "invalid_password",
          operation: "list_views",
          severity: "ERROR",
          sqlstate: "28P01",
          sqlstate_class: "28",
        },
        reason: "UNAUTHENTICATED",
      },
      type: "google.rpc.ErrorInfo",
      // ErrorInfo PostgreSQL fields come from debug.metadata; the raw payload is ignored here.
      value: new Uint8Array([1]),
    },
    {
      debug: {
        conditionName: "invalid_password",
        operation: "list_views",
        serverFields: { severity: "ERROR" },
        sqlstate: "28P01",
        sqlstateClass: "28",
      },
      type: POSTGRES_DETAIL_TYPE,
      value: toBinary(
        PostgreSqlErrorDetailSchema,
        createProto(PostgreSqlErrorDetailSchema, {
          conditionName: "invalid_password",
          kind: PostgreSqlErrorKind.POSTGRESQL_ERROR_KIND_UNAUTHENTICATED,
          operation: "list_views",
          retryGuidance:
            PostgreSqlErrorRetryGuidance.POSTGRESQL_ERROR_RETRY_GUIDANCE_AFTER_CORRECTION,
          serverFields: { severity: "ERROR" },
          sqlstate: "28P01",
          sqlstateClass: "28",
        })
      ),
    },
  ];
  return error;
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

function databasesListResponse() {
  return {
    databases: [
      createProto(DatabaseSchema, {
        displayName: "customer_events",
        name: "instances/prod/databases/customer-events",
        owner: "data-platform",
      }),
      createProto(DatabaseSchema, {
        displayName: "orders",
        name: "instances/prod/databases/orders",
        owner: "data-platform",
      }),
      createProto(DatabaseSchema, {
        displayName: "postgres",
        isSystemDatabase: true,
        name: "instances/prod/databases/postgres",
        owner: "postgres",
      }),
    ],
  };
}

function QueryInsightsDrawerForTest({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return (
    <dialog aria-label="Query insights" open={true}>
      <h1>Query insights</h1>
      <DatabaseQueryInsightsContent
        databaseId={databaseId}
        instanceId={instanceId}
      />
    </dialog>
  );
}

function queryInsightsResponse() {
  return createProto(GetDatabaseQueryInsightsResponseSchema, {
    queryInsights: createProto(DatabaseQueryInsightsSchema, {
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
          heapBlocksHit: 500n,
          heapBlocksRead: 250n,
          hitRatio: 0.67,
          schemaName: "public",
          tableName: "events",
          totalSizeBytes: 268_435_456n,
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
          calls: 21n,
          meanTimeMs: 12,
          query: "UPDATE events SET processed_at = now() WHERE id = $1",
          queryId: 456n,
          totalTimeMs: 252,
          totalTimeRatio: 0.3,
        }),
      ],
    }),
  });
}

function queryRuntimeInsight({
  calls,
  meanTimeMs,
  query,
  queryId,
  totalTimeMs,
  totalTimeRatio,
}: {
  calls: bigint;
  meanTimeMs: number;
  query: string;
  queryId: bigint;
  totalTimeMs: number;
  totalTimeRatio: number;
}) {
  return createProto(QueryRuntimeInsightSchema, {
    calls,
    meanTimeMs,
    query,
    queryId,
    totalTimeMs,
    totalTimeRatio,
  });
}

function queryInsightsResponseWith({
  queryStatsAvailable = true,
  sequentialScanHotspots = [],
  tableCacheHits = [],
  tableStatsAvailable = true,
  topQueries = [],
}: {
  queryStatsAvailable?: boolean;
  sequentialScanHotspots?: SequentialScanHotspot[];
  tableCacheHits?: TableCacheHitInsight[];
  tableStatsAvailable?: boolean;
  topQueries?: QueryRuntimeInsight[];
}) {
  return createProto(GetDatabaseQueryInsightsResponseSchema, {
    queryInsights: createProto(DatabaseQueryInsightsSchema, {
      queryStatsAvailable,
      sequentialScanHotspots,
      tableCacheHits,
      tableStatsAvailable,
      topQueries,
    }),
  });
}

function queryInsightsResponseWithEdgeQueries() {
  return queryInsightsResponseWith({
    topQueries: [
      queryRuntimeInsight({
        calls: 8n,
        meanTimeMs: 16,
        query:
          "WITH moved AS (UPDATE events SET processed_at = now() RETURNING *) SELECT * FROM moved",
        queryId: 100n,
        totalTimeMs: 128,
        totalTimeRatio: 1,
      }),
      queryRuntimeInsight({
        calls: 4n,
        meanTimeMs: 30,
        query:
          "EXPLAIN ANALYZE UPDATE events SET processed_at = now() WHERE id = $1",
        queryId: 101n,
        totalTimeMs: 120,
        totalTimeRatio: 0.9,
      }),
      queryRuntimeInsight({
        calls: 10n,
        meanTimeMs: 2,
        query: "TABLE events",
        queryId: 102n,
        totalTimeMs: 20,
        totalTimeRatio: 0.2,
      }),
      queryRuntimeInsight({
        calls: 7n,
        meanTimeMs: 1,
        query: "VALUES ($1)",
        queryId: 103n,
        totalTimeMs: 7,
        totalTimeRatio: 0.1,
      }),
      queryRuntimeInsight({
        calls: 5n,
        meanTimeMs: 4,
        query: "COPY events TO STDOUT",
        queryId: 104n,
        totalTimeMs: 20,
        totalTimeRatio: 0.2,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 9,
        query: "COPY events FROM STDIN",
        queryId: 105n,
        totalTimeMs: 18,
        totalTimeRatio: 0.18,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 8,
        query: "COPY (SELECT * FROM events) TO STDOUT",
        queryId: 106n,
        totalTimeMs: 16,
        totalTimeRatio: 0.16,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 7,
        query: "COPY events TO '/tmp/from/archive.csv'",
        queryId: 109n,
        totalTimeMs: 14,
        totalTimeRatio: 0.14,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 7,
        query: "COPY events FROM PROGRAM 'echo TO file'",
        queryId: 110n,
        totalTimeMs: 14,
        totalTimeRatio: 0.14,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 7,
        query: 'COPY events (id, "to") FROM STDIN',
        queryId: 111n,
        totalTimeMs: 14,
        totalTimeRatio: 0.14,
      }),
      queryRuntimeInsight({
        calls: 3n,
        meanTimeMs: 4,
        query: "/* trace: dashboard */ SELECT * FROM events",
        queryId: 107n,
        totalTimeMs: 12,
        totalTimeRatio: 0.12,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 5,
        query: "-- trace: worker\nUPDATE events SET processed_at = now()",
        queryId: 108n,
        totalTimeMs: 10,
        totalTimeRatio: 0.1,
      }),
      queryRuntimeInsight({
        calls: 3n,
        meanTimeMs: 5,
        query: "",
        queryId: 0n,
        totalTimeMs: 15,
        totalTimeRatio: 0.05,
      }),
      queryRuntimeInsight({
        calls: 2n,
        meanTimeMs: 6,
        query: "",
        queryId: 0n,
        totalTimeMs: 12,
        totalTimeRatio: 0.04,
      }),
    ],
  });
}

function queryInsightsResponseWithSearchableQueries() {
  return queryInsightsResponseWith({
    topQueries: [
      queryRuntimeInsight({
        calls: 42n,
        meanTimeMs: 20,
        query: "SELECT * FROM events WHERE account_id = $1",
        queryId: 123n,
        totalTimeMs: 840,
        totalTimeRatio: 1,
      }),
      queryRuntimeInsight({
        calls: 21n,
        meanTimeMs: 12,
        query: "UPDATE events SET processed_at = now() WHERE id = $1",
        queryId: 456n,
        totalTimeMs: 252,
        totalTimeRatio: 0.3,
      }),
      queryRuntimeInsight({
        calls: 4n,
        meanTimeMs: 30,
        query: "SELECT avg(duration_ms) FROM events",
        queryId: 790n,
        totalTimeMs: 120,
        totalTimeRatio: 0.15,
      }),
      queryRuntimeInsight({
        calls: 3n,
        meanTimeMs: 38,
        query: "SELECT count(*) FROM events",
        queryId: 789n,
        totalTimeMs: 114,
        totalTimeRatio: 0.14,
      }),
    ],
  });
}

function unavailableQueryInsightsResponse() {
  return queryInsightsResponseWith({
    queryStatsAvailable: false,
    tableStatsAvailable: false,
  });
}

function queryInsightsWithoutTableStatsResponse() {
  return queryInsightsResponseWith({
    tableStatsAvailable: false,
    topQueries: [
      queryRuntimeInsight({
        calls: 42n,
        meanTimeMs: 20,
        query: "SELECT * FROM events WHERE account_id = $1",
        queryId: 123n,
        totalTimeMs: 840,
        totalTimeRatio: 1,
      }),
    ],
  });
}

function queryInsightsWithoutQueryStatsResponse() {
  return queryInsightsResponseWith({
    queryStatsAvailable: false,
    tableStatsAvailable: true,
  });
}

function queryInsightsWithPartialError(metric: "query_stats" | "table_stats") {
  const response = queryInsightsResponseWith({
    queryStatsAvailable: metric !== "query_stats",
    tableStatsAvailable: metric !== "table_stats",
  });
  response.partialErrors = [
    createProto(StatusSchema, {
      code: 13,
      details: [
        anyPack(
          ErrorInfoSchema,
          createProto(ErrorInfoSchema, { metadata: { metric } })
        ),
      ],
      message: `${metric} temporarily unavailable`,
    }),
  ];
  return response;
}

function catalogResult() {
  return {
    coverage: {
      isPartial: false,
      objectLimit: 1000,
      objectsPartial: false,
      schemaLimit: 100,
      schemasPartial: false,
    },
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
        rowCount: 12_000n,
        schemaId: "public",
        sizeBytes: 4_096_000n,
        tableType: Table_TableType.BASE_TABLE,
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
        owner: "analytics-owner",
        rowCount: 5_000n,
        schemaId: "analytics",
        sizeBytes: 2_048_000n,
        tableType: Table_TableType.UNSPECIFIED,
      },
      {
        comment: "",
        isMaterialized: false,
        isPopulated: true,
        isSystem: true,
        kind: "table" as const,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/pg_catalog/tables/pg_class",
        objectId: "pg_class",
        owner: "postgres",
        rowCount: 100n,
        schemaId: "pg_catalog",
        sizeBytes: 1024n,
        tableType: Table_TableType.BASE_TABLE,
      },
    ],
    schemas: [
      {
        estimatedRows: 12_000,
        isSystemSchema: false,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/public",
        owner: "data-platform",
        schemaId: "public",
        tableCount: 1,
        totalSizeBytes: 4_096_000n,
        viewCount: 0,
      },
      {
        estimatedRows: 5000,
        isSystemSchema: false,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/analytics",
        owner: "analytics-owner",
        schemaId: "analytics",
        tableCount: 0,
        totalSizeBytes: 2_048_000n,
        viewCount: 1,
      },
      {
        estimatedRows: 100,
        isSystemSchema: true,
        lastDdlTime: undefined,
        name: "instances/prod/databases/customer-events/schemas/pg_catalog",
        owner: "postgres",
        schemaId: "pg_catalog",
        tableCount: 1,
        totalSizeBytes: 1024n,
        viewCount: 0,
      },
    ],
    syncMetadata: undefined,
    totals: {
      estimatedRows: 17_000,
      schemaCount: 3,
      tableCount: 2,
      totalSizeBytes: 6_145_024n,
      viewCount: 1,
    },
  };
}

beforeEach(() => {
  state.databaseQuery = { data: databaseResponse() };
  state.databasesQuery = { data: databasesListResponse() };
  state.catalogQuery = { data: catalogResult() };
  state.extensionsQuery = { data: { extensions: [] } };
  state.metricsQuery = { data: { series: [] } };
  state.navigate.mockClear();
  state.otherObjectsQuery = {
    data: {},
  };
  state.queryInsightsHook.mockClear();
  state.queryInsightsQuery = {};
});

afterEach(() => {
  cleanup();
});

describe("backend database overview", () => {
  test("uses the subtle blue chart color for metric sparklines", () => {
    state.metricsQuery = {
      data: {
        series: [
          {
            metric: MetricId.DATABASE_SIZE_BYTES,
            points: { values: [1024, 2048] },
          },
          {
            metric: MetricId.DATABASE_LIVE_TUPLES,
            points: { values: [12_000, 17_000] },
          },
          {
            metric: MetricId.DATABASE_DEAD_TUPLES,
            points: { values: [100, 125] },
          },
        ],
      },
    };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    for (const label of ["Total size", "Est. rows", "Dead tuples"]) {
      // Walk up from the label to the stat tile: the nearest ancestor that
      // contains a sparkline svg, regardless of the tile's internal layout.
      let tile = screen.getByText(label).parentElement;
      while (tile && tile.querySelector("svg") === null) {
        tile = tile.parentElement;
      }
      const sparkline = tile?.querySelector("svg");

      expect.soft(sparkline?.getAttribute("class")).toContain("text-chart-1");
    }
  });

  test("renders eagerly loaded insights and opens the overview drawer", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponse() };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    // Insights load with the page: slow-query rows render without opening
    // the drawer.
    expect(state.queryInsightsHook).toHaveBeenCalled();
    expect(screen.getByText("Slowest queries")).toBeTruthy();
    expect(
      screen.getByText("SELECT * FROM events WHERE account_id = $1")
    ).toBeTruthy();
    expect(screen.getByText("20 ms")).toBeTruthy();
    expect(screen.getByText("42 calls")).toBeTruthy();
    expect(screen.queryByText("Top queries by total time")).toBeNull();

    const trigger = screen.getByRole("button", {
      name: "Insights",
    });
    await user.click(trigger);

    const drawer = await screen.findByRole("dialog", {
      name: "Query insights",
    });
    expect(drawer.className).toContain("!w-full");
    expect(drawer.className).toContain("sm:!w-[80vw]");
    expect(drawer.className).toContain("sm:!max-w-5xl");
    expect(
      await within(drawer).findByText("Top queries by total time")
    ).toBeTruthy();
    expect(
      within(drawer).getByRole("columnheader", { name: "Relative" })
    ).toBeTruthy();

    await user.click(within(drawer).getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Write queries" }));
    expect(
      within(drawer).queryByRole("button", {
        name: SELECT_EVENTS_QUERY_BUTTON_RE,
      })
    ).toBeNull();

    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Query insights" })
      ).toBeNull()
    );
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    const reopenedDrawer = await screen.findByRole("dialog", {
      name: "Query insights",
    });
    expect(
      within(reopenedDrawer).getByRole("button", {
        name: SELECT_EVENTS_QUERY_BUTTON_RE,
      })
    ).toBeTruthy();
  });
});

describe("bounded database catalog overview", () => {
  test("qualifies catalog summaries when the bounded result is partial", () => {
    const partialCatalog = catalogResult();
    partialCatalog.coverage.isPartial = true;
    partialCatalog.coverage.objectsPartial = true;
    state.catalogQuery = { data: partialCatalog };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(
      screen.getByRole("status", { name: "Some catalog data is not shown" })
    ).toBeTruthy();
    expect(screen.getByText("3 schemas")).toBeTruthy();
    expect(screen.queryByText("3+ schemas")).toBeNull();
    expect(screen.getByText("2+")).toBeTruthy();
    expect(screen.getByText("1+ views")).toBeTruthy();
    expect(screen.getByText(LOWER_BOUND_CATALOG_RE)).toBeTruthy();
  });
});

describe("backend database overview query insights", () => {
  test("shows skeleton rows without progress bars while the catalog is pending", () => {
    state.catalogQuery = { data: undefined, isPending: true };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(
      screen.getByRole("status", { name: "Loading schemas" })
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Loading objects" })
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("renders PostgreSQL catalog error details from SQLSTATE metadata", async () => {
    const user = userEvent.setup();
    state.catalogQuery = {
      data: undefined,
      error: createCatalogPostgresError(),
    };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(screen.getByText("PostgreSQL authentication failed")).toBeTruthy();
    expect(
      screen.getByText("PostgreSQL invalid_password during list_views")
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Failed to load the database catalog. Refresh the page to try again."
      )
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Error details" }));

    expect(screen.getByText("Code: Unauthenticated")).toBeTruthy();
    expect(screen.getByText("SQLSTATE: 28P01")).toBeTruthy();
    expect(screen.getByText("SQLSTATE class: 28")).toBeTruthy();
    expect(screen.getByText("Condition: invalid_password")).toBeTruthy();
    expect(screen.getByText("Operation: list_views")).toBeTruthy();
    expect(screen.getByText("Endpoint: DatabaseCatalog")).toBeTruthy();
  });
});

describe("backend database query insights drawer", () => {
  test("classifies edge query text without treating unknown statements as writes", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponseWithEdgeQueries() };

    render(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));
    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Write queries" }));

    expect(
      screen.getByRole("button", { name: WITH_UPDATE_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: EXPLAIN_UPDATE_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY_FROM_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: COPY_FROM_PROGRAM_WITH_TO_BUTTON_RE,
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY_COLUMN_TO_FROM_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COMMENTED_UPDATE_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: TABLE_EVENTS_QUERY_BUTTON_RE })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: COPY_TO_QUERY_BUTTON_RE })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Query text unavailable" })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Read queries" }));

    expect(
      screen.getByRole("button", { name: TABLE_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: VALUES_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY_TO_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY_SELECT_TO_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COPY_TO_PATH_WITH_FROM_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: COMMENTED_SELECT_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: WITH_UPDATE_QUERY_BUTTON_RE })
    ).toBeNull();
  });
});

describe("database query insights resilience", () => {
  test("filters query insights with table-style search and shared faceted filters", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = {
      data: queryInsightsResponseWithSearchableQueries(),
    };

    render(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    const searchInput = screen.getByRole("textbox", {
      name: "Search queries…",
    });
    const filterBar = searchInput.closest(
      '[data-slot="query-insights-filter-bar"]'
    );
    if (!(filterBar instanceof HTMLElement)) {
      throw new Error("Missing query insights filter bar");
    }

    expect(filterBar.className).toContain("justify-start");
    expect(filterBar.firstElementChild?.contains(searchInput)).toBe(true);
    expect(
      within(filterBar).getByRole("button", { name: "Type" })
    ).toBeTruthy();
    expect(
      within(filterBar).getByRole("button", { name: "Mean" })
    ).toBeTruthy();
    expect(
      within(filterBar).queryByRole("combobox", { name: "Query type" })
    ).toBeNull();
    expect(
      within(filterBar).queryByRole("combobox", { name: "Mean runtime" })
    ).toBeNull();

    await user.type(searchInput, "update");

    expect(
      screen.getByRole("button", { name: UPDATE_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: SELECT_EVENTS_QUERY_BUTTON_RE })
    ).toBeNull();

    await user.click(within(filterBar).getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Write queries" }));

    expect(
      screen.getByRole("button", { name: UPDATE_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: SELECT_EVENTS_QUERY_BUTTON_RE })
    ).toBeNull();

    await user.click(
      within(filterBar).getByRole("button", { name: "Clear all" })
    );
    expect((searchInput as HTMLInputElement).value).toBe("");
    expect(
      screen.getByRole("button", { name: SELECT_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
    await user.click(within(filterBar).getByRole("button", { name: "Mean" }));
    await user.click(screen.getByRole("option", { name: "Mean > 30 ms" }));

    expect(
      screen.getByRole("button", { name: SLOW_COUNT_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: EXACT_THRESHOLD_QUERY_BUTTON_RE })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: UPDATE_EVENTS_QUERY_BUTTON_RE })
    ).toBeNull();
  });

  test("renders unavailable, table-stats-missing, and error states", () => {
    const { rerender } = render(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    state.queryInsightsQuery = { data: unavailableQueryInsightsResponse() };
    rerender(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByText("No query insights yet")).toBeTruthy();

    state.queryInsightsQuery = {
      data: queryInsightsWithoutTableStatsResponse(),
    };
    rerender(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(
      screen.getByText("Table statistics are unavailable for this database.")
    ).toBeTruthy();

    state.queryInsightsQuery = {
      data: queryInsightsWithoutQueryStatsResponse(),
    };
    rerender(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByText(QUERY_STATS_UNAVAILABLE_RE)).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Search queries…" })
    ).toBeNull();

    state.queryInsightsQuery = {
      error: new Error("query insights unavailable"),
      refetch: rs.fn(async () => undefined),
    };
    rerender(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("shows partial metric failures with retry while retaining other data", async () => {
    const user = userEvent.setup();
    const refetch = rs.fn(async () => undefined);
    state.queryInsightsQuery = {
      data: queryInsightsWithPartialError("query_stats"),
      refetch,
    };

    render(
      <QueryInsightsDrawerForTest
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(screen.getByText("Cache hit by table")).toBeTruthy();
    expect(
      screen.getByText("query_stats temporarily unavailable")
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Retry query statistics" })
    );
    expect(refetch).toHaveBeenCalledOnce();
  });
});
