import { create as createProto, toBinary } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
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
