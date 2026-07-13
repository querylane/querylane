import { create as createProto, toBinary } from "@bufbuild/protobuf";
import { anyPack } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
import { BackendDatabaseQueryInsightsPage } from "@/components/console-pages/database-query-insights-page";
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
import { PostgreSqlErrorDetailSchema } from "@/protogen/querylane/console/v1alpha1/errors_pb";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface QueryState<T> {
  data?: T;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const state = vi.hoisted(() => ({
  catalogQuery: {} as { data?: unknown; error?: unknown; isPending?: boolean },
  databaseQuery: {} as QueryState<GetDatabaseResponse>,
  navigate: vi.fn(async () => undefined),
  queryInsightsQuery: {} as QueryState<GetDatabaseQueryInsightsResponse>,
}));
const ANALYTICS_SCHEMA_ROW_RE = /analytics User analytics-owner/;
const ANALYTICS_DAILY_ROLLUP_ROW_RE = /analytics.*daily_rollup/i;
const PG_CATALOG_SCHEMA_ROW_RE = /pg_catalog System postgres/i;
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
const OBSERVED_TIMESTAMP_RE = /Observed/;
const CUMULATIVE_STATS_NOTE_RE = /Statistics are cumulative/;
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
const DUPLICATE_QUERY_ID_SECOND_ROW_RE =
  /SELECT \* FROM events WHERE tenant_id = \$2/i;
const SLOW_COUNT_QUERY_BUTTON_RE = /SELECT count\(\*\) FROM events/i;
const QUERY_PAGE_SIX_BUTTON_RE = /sequence = 6/i;
const QUERY_PAGE_ELEVEN_BUTTON_RE = /sequence = 11/i;
const EMPTY_PAGINATION_RANGE_RE = /Showing 1–0/;
const QUERY_STATS_UNAVAILABLE_RE =
  /Query statistics are unavailable for this database/;

vi.mock("@tanstack/react-router", () => {
  const linkExportName = "Link";
  return {
    [linkExportName]: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => (
      <a className={className} href="/">
        {children}
      </a>
    ),
    useNavigate: () => state.navigate,
  };
});

vi.mock("@/hooks/api/database", () => ({
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
          operation: "list_views",
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

function queryInsightsResponseWithManyQueries() {
  return queryInsightsResponseWith({
    topQueries: Array.from({ length: 12 }, (_, index) => {
      const sequence = index + 1;
      return queryRuntimeInsight({
        calls: BigInt(120 - sequence),
        meanTimeMs: sequence,
        query: `SELECT * FROM events WHERE sequence = ${sequence}`,
        queryId: BigInt(10_000 + sequence),
        totalTimeMs: 1200 - sequence,
        totalTimeRatio: 1 - index / 20,
      });
    }),
  });
}

function queryInsightsResponseWithUpdatedSelection() {
  return queryInsightsResponseWith({
    topQueries: [
      queryRuntimeInsight({
        calls: 84n,
        meanTimeMs: 18,
        query: "UPDATE events SET processed_at = now() WHERE id = $1",
        queryId: 456n,
        totalTimeMs: 1512,
        totalTimeRatio: 1,
      }),
    ],
  });
}

function queryInsightsResponseWithDuplicateQueryIds() {
  return queryInsightsResponseWith({
    topQueries: [
      queryRuntimeInsight({
        calls: 8n,
        meanTimeMs: 10,
        query: "SELECT * FROM events WHERE tenant_id = $1",
        queryId: 900n,
        totalTimeMs: 80,
        totalTimeRatio: 1,
      }),
      queryRuntimeInsight({
        calls: 4n,
        meanTimeMs: 15,
        query: "SELECT * FROM events WHERE tenant_id = $2",
        queryId: 900n,
        totalTimeMs: 60,
        totalTimeRatio: 0.75,
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
  state.catalogQuery = { data: catalogResult() };
  state.navigate.mockClear();
  state.queryInsightsQuery = {};
});

afterEach(() => {
  cleanup();
});

describe("backend database overview", () => {
  test("renders mission-control header, stats, and catalog tables", () => {
    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(screen.getByText("customer_events")).toBeTruthy();
    expect(screen.getAllByText("data-platform").length).toBeGreaterThan(0);
    expect(screen.getByText("UTF8")).toBeTruthy();
    expect(screen.getByText("en_US.UTF-8")).toBeTruthy();
    expect(screen.getByText("Largest objects")).toBeTruthy();
    expect(screen.getByText("Schemas")).toBeTruthy();
    expect(screen.getAllByText("Tables").length).toBeGreaterThan(0);
    expect(screen.getByText("events")).toBeTruthy();
  });

  test("places largest-object search on the left with kind and schema filters", async () => {
    const user = userEvent.setup();

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    const search = screen.getByRole("textbox", { name: "Search objects..." });
    const filterBar = search.closest('[data-slot="largest-object-filter-bar"]');
    if (!(filterBar instanceof HTMLElement)) {
      throw new Error("Missing largest object filter bar");
    }

    expect(filterBar.className).toContain("justify-start");
    expect(
      within(filterBar)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Kind", "System", "Owner", "Schema"]);

    await user.click(within(filterBar).getByRole("button", { name: "Kind" }));
    await user.click(
      screen.getByRole("option", { name: "Materialized views" })
    );

    expect(screen.getByText("daily_rollup")).toBeTruthy();
    expect(screen.queryByText("events")).toBeNull();

    await user.click(within(filterBar).getByRole("button", { name: "Owner" }));
    await user.click(screen.getByRole("option", { name: "analytics-owner" }));

    expect(screen.getByText("daily_rollup")).toBeTruthy();
    expect(screen.queryByText("pg_class")).toBeNull();
  });

  test("places schema search on the left with kind and owner filters", async () => {
    const user = userEvent.setup();

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    const search = screen.getByRole("textbox", { name: "Search schemas..." });
    const schemaSection = search.closest("section");
    if (!(schemaSection instanceof HTMLElement)) {
      throw new Error("Missing schema section");
    }
    const filterBar = search.closest('[data-slot="schema-filter-bar"]');
    if (!(filterBar instanceof HTMLElement)) {
      throw new Error("Missing schema filter bar");
    }

    expect(filterBar.className).toContain("justify-start");
    expect(
      within(filterBar)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["System", "Owner"]);

    await user.click(within(filterBar).getByRole("button", { name: "Owner" }));
    await user.click(screen.getByRole("option", { name: "analytics-owner" }));

    expect(
      within(schemaSection).getByRole("button", {
        name: ANALYTICS_SCHEMA_ROW_RE,
      })
    ).toBeTruthy();
    expect(within(schemaSection).queryByText("public")).toBeNull();
  });

  test("renders query insights when PostgreSQL stats are available", () => {
    state.queryInsightsQuery = { data: queryInsightsResponse() };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(screen.getByText("Query insights")).toBeTruthy();
    expect(screen.getByText("Top queries by total time")).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "code" &&
          element.textContent?.includes("SELECT * FROM events") === true
      )
    ).toBeTruthy();
    expect(screen.getByText("42 calls")).toBeTruthy();
    expect(screen.getByText("Sequential scan hotspots")).toBeTruthy();
    expect(screen.getAllByText("public.events").length).toBeGreaterThan(0);
    expect(screen.getByText("120,000 tuples read")).toBeTruthy();
    expect(screen.getByText("Cache hit by table")).toBeTruthy();
    expect(screen.getByText("67% hit")).toBeTruthy();
    expect(screen.getByText("Low cache hit")).toBeTruthy();
  });

  test("renders the dedicated query insights page with filtering and query detail", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponse() };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Query insights" })
    ).toBeTruthy();
    expect(screen.getByText("Top queries by total time")).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Relative to top" })
    ).toBeTruthy();
    expect(screen.getByText("Sequential scan hotspots")).toBeTruthy();
    expect(screen.getByText("Cache hit by table")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: SELECT_EVENTS_QUERY_BUTTON_RE,
      })
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Write queries" }));

    expect(
      screen.queryByRole("button", {
        name: SELECT_EVENTS_QUERY_BUTTON_RE,
      })
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: UPDATE_EVENTS_QUERY_BUTTON_RE,
      })
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: UPDATE_EVENTS_QUERY_BUTTON_RE,
      })
    );

    const detail = screen.getByRole("region", { name: "Query detail" });
    expect(within(detail).getByText("Relative to top")).toBeTruthy();
    expect(within(detail).getByText("queryid 456")).toBeTruthy();
    expect(within(detail).getByText("21")).toBeTruthy();
    expect(within(detail).getByText("12 ms")).toBeTruthy();
    expect(screen.queryByText("Since stats reset")).toBeNull();
    expect(screen.queryByText(OBSERVED_TIMESTAMP_RE)).toBeNull();
    expect(within(detail).queryByText(CUMULATIVE_STATS_NOTE_RE)).toBeNull();
    expect(
      within(detail).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" &&
          element.textContent?.includes(
            "UPDATE events SET processed_at = now()"
          ) === true
      ).className
    ).toContain("whitespace-pre-wrap");
  });

  test("navigates largest objects and schemas with stable explorer params", async () => {
    const user = userEvent.setup();

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    const objectButton = screen.getByRole("button", {
      name: ANALYTICS_DAILY_ROLLUP_ROW_RE,
    });
    await user.click(objectButton);

    expect(state.navigate).toHaveBeenCalledWith({
      params: { databaseId: "customer-events", instanceId: "prod" },
      search: { category: "views", name: "daily_rollup", schema: "analytics" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });

    const schemaButton = screen.getByRole("button", {
      name: PG_CATALOG_SCHEMA_ROW_RE,
    });
    await user.click(schemaButton);

    expect(state.navigate).toHaveBeenLastCalledWith({
      params: { databaseId: "customer-events", instanceId: "prod" },
      search: { schema: "pg_catalog" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("shows loading rows without table progress bars while the catalog is pending", () => {
    state.catalogQuery = { data: undefined, isPending: true };

    render(
      <BackendDatabasePage
        databaseId="customer-events"
        instanceId="prod"
        section="overview"
      />
    );

    expect(
      screen.getByRole("status", { name: "Loading objects" })
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Loading schemas" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("progressbar", { name: "Loading objects" })
    ).toBeNull();
    expect(
      screen.queryByRole("progressbar", { name: "Loading schemas" })
    ).toBeNull();
    expect(screen.queryByText("No objects found")).toBeNull();
    expect(screen.queryByText("No schemas found")).toBeNull();
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

describe("backend database query insights page", () => {
  test("classifies edge query text without treating unknown statements as writes", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponseWithEdgeQueries() };

    render(
      <BackendDatabaseQueryInsightsPage
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

    await user.click(screen.getByRole("button", { name: "Reset" }));
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

  test("exposes selected query state without colliding on queryid zero", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponseWithEdgeQueries() };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));

    const unavailableQueryButtons = screen.getAllByRole("button", {
      name: "Query text unavailable",
    });
    expect(unavailableQueryButtons).toHaveLength(2);
    const [firstUnavailableQueryButton, secondUnavailableQueryButton] =
      unavailableQueryButtons;
    if (!(firstUnavailableQueryButton && secondUnavailableQueryButton)) {
      throw new Error("Expected two unavailable query buttons");
    }

    await user.click(firstUnavailableQueryButton);

    expect(firstUnavailableQueryButton.getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(secondUnavailableQueryButton.getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  test("clears an unidentifiable query selection after rows reorder", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponseWithEdgeQueries() };
    const { rerender } = render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));
    const unavailableQueryButtons = screen.getAllByRole("button", {
      name: "Query text unavailable",
    });
    const firstUnavailableQueryButton = unavailableQueryButtons[0];
    if (!firstUnavailableQueryButton) {
      throw new Error("Expected an unavailable query button");
    }
    await user.click(firstUnavailableQueryButton);

    const refreshed = queryInsightsResponseWithEdgeQueries();
    const topQueries = refreshed.queryInsights?.topQueries;
    if (!topQueries) {
      throw new Error("Expected query insights");
    }
    const firstUnknown = topQueries.at(-2);
    const secondUnknown = topQueries.at(-1);
    if (!(firstUnknown && secondUnknown)) {
      throw new Error("Expected two unavailable queries");
    }
    topQueries.splice(-2, 2, secondUnknown, firstUnknown);
    state.queryInsightsQuery = { data: refreshed };
    rerender(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Query detail" })).toBeNull();
    });

    state.queryInsightsQuery = {
      data: queryInsightsResponseWithEdgeQueries(),
    };
    rerender(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(screen.queryByRole("region", { name: "Query detail" })).toBeNull();
  });

  test("keeps selected query detail synced to refetched insights", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponse() };

    const { rerender } = render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: UPDATE_EVENTS_QUERY_BUTTON_RE,
      })
    );
    const detail = screen.getByRole("region", { name: "Query detail" });
    expect(within(detail).getByText("21")).toBeTruthy();

    state.queryInsightsQuery = {
      data: queryInsightsResponseWithUpdatedSelection(),
    };
    rerender(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(within(detail).getByText("84")).toBeTruthy();
    expect(within(detail).getByText("18 ms")).toBeTruthy();
  });
});

describe("database query insights resilience", () => {
  test("selects the intended row when queryids repeat", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = {
      data: queryInsightsResponseWithDuplicateQueryIds(),
    };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: DUPLICATE_QUERY_ID_SECOND_ROW_RE,
      })
    );

    const detail = screen.getByRole("region", { name: "Query detail" });
    expect(
      within(detail).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "code" &&
          element.textContent === "SELECT * FROM events WHERE tenant_id = $2"
      )
    ).toBeTruthy();
    expect(within(detail).getByText("4")).toBeTruthy();
  });

  test("resets query selection when switching databases", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = { data: queryInsightsResponse() };

    const { rerender } = render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: UPDATE_EVENTS_QUERY_BUTTON_RE,
      })
    );
    const detail = screen.getByRole("region", { name: "Query detail" });
    expect(within(detail).getByText("queryid 456")).toBeTruthy();

    // The other database also reports queryid 456 (queryids are stable text
    // hashes), so a carried-over selection would silently match there.
    state.queryInsightsQuery = {
      data: queryInsightsResponseWithSearchableQueries(),
    };
    rerender(
      <BackendDatabaseQueryInsightsPage databaseId="orders" instanceId="prod" />
    );

    const freshDetail = screen.getByRole("region", { name: "Query detail" });
    expect(within(freshDetail).getByText("queryid 123")).toBeTruthy();
  });

  test("filters query insights with table-style search and shared faceted filters", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = {
      data: queryInsightsResponseWithSearchableQueries(),
    };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    const searchInput = screen.getByRole("textbox", {
      name: "Search queries...",
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

    await user.clear(searchInput);
    await user.click(within(filterBar).getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("option", { name: "Write queries" }));

    expect(
      screen.getByRole("button", { name: UPDATE_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: SELECT_EVENTS_QUERY_BUTTON_RE })
    ).toBeNull();

    await user.click(within(filterBar).getByRole("button", { name: "Reset" }));
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

  test("paginates query insights and lets users change page size", async () => {
    const user = userEvent.setup();
    state.queryInsightsQuery = {
      data: queryInsightsResponseWithManyQueries(),
    };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Rows per page" })
    ).toBeTruthy();
    expect(screen.getByText("Showing 1–5 of 12")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: QUERY_PAGE_SIX_BUTTON_RE })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: QUERY_PAGE_ELEVEN_BUTTON_RE })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Showing 6–10 of 12")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: QUERY_PAGE_SIX_BUTTON_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: QUERY_PAGE_ELEVEN_BUTTON_RE })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Showing 11–12 of 12")).toBeTruthy();
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: QUERY_PAGE_ELEVEN_BUTTON_RE })
    ).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "25" }));

    expect(screen.getByText("Showing 1–12 of 12")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: QUERY_PAGE_ELEVEN_BUTTON_RE })
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);

    await user.type(
      screen.getByRole("textbox", { name: "Search queries..." }),
      "missing query"
    );

    expect(screen.getByText("No matching query runtime data.")).toBeTruthy();
    expect(screen.queryByText(EMPTY_PAGINATION_RANGE_RE)).toBeNull();
  });

  test("renders unavailable, table-stats-missing, and error states", () => {
    const { rerender } = render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    state.queryInsightsQuery = { data: unavailableQueryInsightsResponse() };
    rerender(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByText("No query insights yet")).toBeTruthy();

    state.queryInsightsQuery = {
      data: queryInsightsWithoutTableStatsResponse(),
    };
    rerender(
      <BackendDatabaseQueryInsightsPage
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
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByText(QUERY_STATS_UNAVAILABLE_RE)).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Search queries..." })
    ).toBeNull();

    state.queryInsightsQuery = {
      error: new Error("query insights unavailable"),
      refetch: vi.fn(async () => undefined),
    };
    rerender(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("shows partial metric failures with retry while retaining other data", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn(async () => undefined);
    state.queryInsightsQuery = {
      data: queryInsightsWithPartialError("query_stats"),
      refetch,
    };

    render(
      <BackendDatabaseQueryInsightsPage
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

  test("keeps cached insights visible after a background refetch error", () => {
    state.queryInsightsQuery = {
      data: queryInsightsResponse(),
      error: new Error("background refresh failed"),
      refetch: vi.fn(async () => undefined),
    };

    render(
      <BackendDatabaseQueryInsightsPage
        databaseId="customer-events"
        instanceId="prod"
      />
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Top queries by total time")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: SELECT_EVENTS_QUERY_BUTTON_RE })
    ).toBeTruthy();
  });
});
