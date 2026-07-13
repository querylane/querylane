import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ExplorerRailFrame } from "@/__tests__/explorer-rail-test-utils";
import { DataExplorerPage } from "@/features/data-explorer/data-explorer-page";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import { createTestQueryClient } from "@/test/query-client";

interface SchemaFixture {
  displayName: string;
  name: string;
  owner: string;
}

interface TableFixture {
  displayName: string;
  name: string;
  rowCount: bigint;
  sizeBytes: bigint;
}

interface TablesData {
  pages: Array<{ tables: TableFixture[] }>;
}

interface SelectedTableData {
  table: TableFixture;
}

const mocks = vi.hoisted(() => ({
  columnsQuery: {
    data: { columns: [] as unknown[] },
    error: null as Error | null,
    isLoading: false,
  },
  constraintsQuery: {
    data: { constraints: [] as unknown[] },
    error: null as Error | null,
    isLoading: false,
  },
  indexesQuery: {
    data: { indexes: [] as unknown[] },
    error: null as Error | null,
    isLoading: false,
  },
  navigate: vi.fn(),
  policiesQuery: {
    data: { policies: [] as unknown[] },
    error: null as Error | null,
    isLoading: false,
  },
  schemaMapTables: [] as TableFixture[],
  schemasQuery: {
    data: { pages: [{ schemas: [] as SchemaFixture[] }] },
    error: new Error("schema rpc failed") as Error | null,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  selectedTableQuery: {
    data: undefined as SelectedTableData | undefined,
    error: null as Error | null,
  },
  tablesQuery: {
    data: undefined as TablesData | undefined,
    error: null as Error | null,
    fetchNextPage: vi.fn(() => Promise.resolve()),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  triggersQuery: {
    data: { triggers: [] as unknown[] },
    error: null as Error | null,
    isLoading: false,
  },
}));

vi.mock("@/components/data-grid/table-data-grid/table-data-grid", () => {
  const tableDataGridExportName = "TableDataGrid";
  return {
    [tableDataGridExportName]: ({
      children,
    }: {
      children?: (state: {
        grid: React.ReactNode;
        lastFetchedLabel: string;
      }) => React.ReactNode;
    }) => {
      const grid = (
        <div
          className="h-64 w-full rounded-lg border border-border bg-muted/20"
          data-testid="mock-table-data-grid"
        />
      );

      return children
        ? children({ grid, lastFetchedLabel: "Last fetched 12:00:00 AM" })
        : grid;
    },
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const linkExportName = "Link";
  return {
    ...actual,
    [linkExportName]: ({ children }: { children: React.ReactNode }) => (
      <a href="/explorer">{children}</a>
    ),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/components/querylane-ui/sidebar", () => ({
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useMutation: vi.fn(),
  useQuery: () => ({ data: undefined }),
  useTransport: () => ({}),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query"
  );

  return {
    ...actual,
    useQueries: ({ queries }: { queries: unknown[] }) =>
      queries.map(() => ({
        data: {
          columns: [],
          constraints: [],
          tables: mocks.schemaMapTables,
          views: [],
        },
        error: null,
        isLoading: false,
      })),
  };
});

vi.mock("@/hooks/api/schema", () => ({
  schemasForDatabaseQueryInput: vi.fn((input) => input),
  useGetSchemaQuery: () => ({ data: undefined }),
  useListSchemasInfiniteQuery: () => mocks.schemasQuery,
}));

vi.mock("@/hooks/api/table", () => ({
  assertNoUnhandledTableDetailQueries: vi.fn(),
  tableDetailQueryOptions: vi.fn(({ tableId }) =>
    [
      "columns",
      "indexes",
      "constraints",
      "policies",
      "triggers",
      "partition",
    ].map((facet) => ({
      queryFn: async () => ({}),
      queryKey: ["browser", "table-detail", tableId, facet],
    }))
  ),
  tablesForSchemaQueryInput: vi.fn((input) => input),
  useGetTablePartitionMetadataQuery: () => ({
    data: {
      partitionMetadata: {
        childPartitions: [],
        parentTable: "",
        partitionBound: "",
        partitionCount: 0,
        partitionKey: "",
      },
    },
    dataUpdatedAt: 0,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  }),
  useGetTableQuery: () => mocks.selectedTableQuery,
  useListTableColumnsQuery: () => mocks.columnsQuery,
  useListTableConstraintsQuery: () => mocks.constraintsQuery,
  useListTableIndexesQuery: () => mocks.indexesQuery,
  useListTablePoliciesQuery: () => mocks.policiesQuery,
  useListTablesInfiniteQuery: () => mocks.tablesQuery,
  useListTableTriggersQuery: () => mocks.triggersQuery,
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({ selectedDatabase: { name: "appdb" } }),
}));

function renderDataExplorerPage() {
  const queryClient = createTestQueryClient();

  render(
    <ScreenshotFrame>
      <div className="h-[720px] w-[1180px] overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <QueryClientProvider client={queryClient}>
          <ExplorerRailFrame>
            <DataExplorerPage databaseId="app" instanceId="prod" search={{}} />
          </ExplorerRailFrame>
        </QueryClientProvider>
      </div>
    </ScreenshotFrame>
  );
}

function renderWideExplorerPage(search: DataExplorerSearch) {
  const queryClient = createTestQueryClient();

  render(
    <ScreenshotFrame>
      <div
        className="h-[720px] w-[1800px] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
        data-testid="wide-explorer-shell"
      >
        <QueryClientProvider client={queryClient}>
          <ExplorerRailFrame>
            <DataExplorerPage
              databaseId="app"
              instanceId="prod"
              search={search}
            />
          </ExplorerRailFrame>
        </QueryClientProvider>
      </div>
    </ScreenshotFrame>
  );
}

function seedAnalyticsSchema() {
  mocks.schemasQuery.data = {
    pages: [
      {
        schemas: [
          {
            displayName: "analytics",
            name: "instances/prod/databases/app/schemas/analytics",
            owner: "postgres",
          },
        ],
      },
    ],
  };
  mocks.schemasQuery.error = null;
  mocks.tablesQuery.data = { pages: [{ tables: [] }] };
}

beforeEach(() => {
  mocks.columnsQuery.data = { columns: [] };
  mocks.columnsQuery.error = null;
  mocks.columnsQuery.isLoading = false;
  mocks.constraintsQuery.data = { constraints: [] };
  mocks.constraintsQuery.error = null;
  mocks.constraintsQuery.isLoading = false;
  mocks.indexesQuery.data = { indexes: [] };
  mocks.indexesQuery.error = null;
  mocks.indexesQuery.isLoading = false;
  mocks.policiesQuery.data = { policies: [] };
  mocks.policiesQuery.error = null;
  mocks.policiesQuery.isLoading = false;
  mocks.schemasQuery.data = { pages: [{ schemas: [] }] };
  mocks.schemasQuery.error = new Error("schema rpc failed");
  mocks.schemasQuery.isFetching = false;
  mocks.schemasQuery.isPending = false;
  mocks.schemaMapTables = [];
  mocks.selectedTableQuery.data = undefined;
  mocks.selectedTableQuery.error = null;
  mocks.tablesQuery.data = undefined;
  mocks.tablesQuery.error = null;
  mocks.tablesQuery.hasNextPage = false;
  mocks.tablesQuery.isFetchingNextPage = false;
  mocks.tablesQuery.isLoading = false;
  mocks.triggersQuery.data = { triggers: [] };
  mocks.triggersQuery.error = null;
  mocks.triggersQuery.isLoading = false;
  vi.clearAllMocks();
});

test("data explorer schema load failures stay visibly retryable", async () => {
  renderDataExplorerPage();

  await expect
    .element(page.getByRole("button", { name: "Retry" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Error details" }))
    .toBeVisible();
  await expect.element(page.getByText("No schemas")).not.toBeInTheDocument();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-schema-load-error",
    {
      comparatorOptions: {
        allowedMismatchedPixelRatio: 0.05,
      },
    }
  );
});

test("data explorer table grid uses width immediately beside object browser", async () => {
  mocks.schemasQuery.data = {
    pages: [
      {
        schemas: [
          {
            displayName: "analytics",
            name: "instances/prod/databases/app/schemas/analytics",
            owner: "postgres",
          },
        ],
      },
    ],
  };
  mocks.schemasQuery.error = null;
  mocks.tablesQuery.data = {
    pages: [
      {
        tables: [
          {
            displayName: "page_views",
            name: "instances/prod/databases/app/schemas/analytics/tables/page_views",
            rowCount: 42n,
            sizeBytes: 65_536n,
          },
        ],
      },
    ],
  };
  mocks.selectedTableQuery.data = {
    table: {
      displayName: "page_views",
      name: "instances/prod/databases/app/schemas/analytics/tables/page_views",
      rowCount: 42n,
      sizeBytes: 65_536n,
    },
  };

  renderWideExplorerPage({
    category: "tables",
    name: "page_views",
    schema: "analytics",
  });

  await expect.element(page.getByTestId("mock-table-data-grid")).toBeVisible();

  const shell = document.querySelector("[data-testid='wide-explorer-shell']");
  const rail = document.querySelector("[data-testid='explorer-rail-slot']");
  const sidebar = document.querySelector(
    "aside[aria-label='Database objects']"
  );
  const grid = document.querySelector("[data-testid='mock-table-data-grid']");
  const tabsList = document.querySelector("[data-slot='tabs-list']");
  if (!(shell && rail && sidebar && grid && tabsList)) {
    throw new Error("Expected explorer shell, rail, sidebar, tabs, and grid.");
  }

  // The object browser portals into the fixed-width rail; no drag handle.
  expect(rail.contains(sidebar)).toBe(true);
  expect(document.querySelector("[data-slot='resizable-handle']")).toBeNull();

  const shellRect = shell.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const tabsListRect = tabsList.getBoundingClientRect();
  const gapBetweenRailAndGrid = gridRect.left - railRect.right;
  const unusedRightSpace = shellRect.right - gridRect.right;

  expect(sidebarRect.width).toBeGreaterThanOrEqual(railRect.width - 2);
  expect(tabsListRect.left).toBeGreaterThanOrEqual(railRect.right - 1);
  expect(gridRect.left).toBeGreaterThanOrEqual(railRect.right - 1);
  expect(gapBetweenRailAndGrid).toBeLessThanOrEqual(64);
  expect(unusedRightSpace).toBeLessThanOrEqual(64);

  const filterInput = sidebar.querySelector("[data-slot='input']");
  const schemaNode = Array.from(sidebar.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("analytics")
  );
  if (
    !(filterInput instanceof HTMLElement && schemaNode instanceof HTMLElement)
  ) {
    throw new Error("Expected schema tree node and filter input.");
  }
  // The active schema renders as an expanded tree node with its objects
  // nested underneath.
  expect(schemaNode.getAttribute("aria-expanded")).toBe("true");

  const tableButton = Array.from(sidebar.querySelectorAll("button")).find(
    (button) => button.textContent?.includes("page_views")
  );
  const tableName = tableButton?.querySelector(".min-w-0.flex-1");
  const sizeLabel = Array.from(sidebar.querySelectorAll("span")).find(
    (element) => element.textContent?.trim() === "64 KB"
  );
  if (
    !(
      tableButton instanceof HTMLElement &&
      tableName instanceof HTMLElement &&
      sizeLabel instanceof HTMLElement
    )
  ) {
    throw new Error("Expected table resource row, name, and size label.");
  }
  const tableNameRect = tableName.getBoundingClientRect();
  const sizeLabelRect = sizeLabel.getBoundingClientRect();
  expect(tableNameRect.width).toBeGreaterThan(80);
  expect(sizeLabelRect.right).toBeLessThanOrEqual(
    sidebar.getBoundingClientRect().right
  );
  expect(sizeLabelRect.left).toBeGreaterThanOrEqual(tableNameRect.right - 1);
});

test("data explorer schema map fills the available detail area", async () => {
  seedAnalyticsSchema();
  mocks.schemaMapTables = [
    {
      displayName: "page_views",
      name: "instances/prod/databases/app/schemas/analytics/tables/page_views",
      rowCount: 42n,
      sizeBytes: 65_536n,
    },
  ];
  renderWideExplorerPage({ schema: "analytics", tab: "map" });

  await expect
    .element(page.getByRole("region", { name: "Schema map for analytics" }))
    .toBeVisible();

  const shell = page.getByTestId("wide-explorer-shell").element();
  const rail = page.getByTestId("explorer-rail-slot").element();
  const map = page
    .getByRole("region", { name: "Schema map for analytics" })
    .element();
  const canvas = page
    .getByRole("region", { name: "Schema relationship map" })
    .element();
  const shellRect = shell.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const mapRect = map.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  expect(mapRect.width).toBeGreaterThan(1200);
  expect(mapRect.left).toBeGreaterThanOrEqual(railRect.right);
  expect(mapRect.left - railRect.right).toBeLessThanOrEqual(64);
  expect(mapRect.right).toBeLessThanOrEqual(shellRect.right);
  expect(shellRect.right - mapRect.right).toBeLessThanOrEqual(64);
  expect(mapRect.bottom).toBeLessThanOrEqual(shellRect.bottom);
  expect(shellRect.bottom - mapRect.bottom).toBeLessThanOrEqual(64);
  expect(canvasRect.bottom).toBeLessThanOrEqual(mapRect.bottom);
});

test("data explorer schema objects stay centered at wide widths", async () => {
  seedAnalyticsSchema();
  renderWideExplorerPage({ schema: "analytics" });

  await expect
    .element(page.getByRole("heading", { name: "analytics" }))
    .toBeVisible();

  const shell = page.getByTestId("wide-explorer-shell").element();
  const rail = page.getByTestId("explorer-rail-slot").element();
  const details = page
    .getByRole("region", { name: "Data Explorer details" })
    .element();
  const content = details.firstElementChild?.firstElementChild;
  if (!(content instanceof HTMLElement)) {
    throw new Error("Expected the Data Explorer detail content.");
  }

  const shellRect = shell.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const availableCenter = (railRect.right + shellRect.right) / 2;
  const contentCenter = (contentRect.left + contentRect.right) / 2;

  expect(contentRect.width).toBeLessThanOrEqual(900);
  expect(Math.abs(contentCenter - availableCenter)).toBeLessThanOrEqual(1);
});
