import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataExplorerPage } from "@/features/data-explorer/data-explorer-page";
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

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@connectrpc/connect-query", () => ({
  useMutation: vi.fn(),
  useQuery: () => ({ data: undefined }),
  useTransport: () => ({}),
}));

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
          <DataExplorerPage databaseId="app" instanceId="prod" search={{}} />
        </QueryClientProvider>
      </div>
    </ScreenshotFrame>
  );
}

function renderSelectedTableExplorerPage() {
  const queryClient = createTestQueryClient();

  render(
    <ScreenshotFrame>
      <div
        className="h-[720px] w-[1800px] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
        data-testid="wide-explorer-shell"
      >
        <QueryClientProvider client={queryClient}>
          <DataExplorerPage
            databaseId="app"
            instanceId="prod"
            search={{
              category: "tables",
              name: "page_views",
              schema: "analytics",
            }}
          />
        </QueryClientProvider>
      </div>
    </ScreenshotFrame>
  );
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

  renderSelectedTableExplorerPage();

  await expect.element(page.getByTestId("mock-table-data-grid")).toBeVisible();

  const shell = document.querySelector("[data-testid='wide-explorer-shell']");
  const sidebar = document.querySelector(
    "aside[aria-label='Database objects']"
  );
  const grid = document.querySelector("[data-testid='mock-table-data-grid']");
  const handle = document.querySelector("[data-slot='resizable-handle']");
  const tabsList = document.querySelector("[data-slot='tabs-list']");
  if (!(shell && sidebar && grid && handle && tabsList)) {
    throw new Error(
      "Expected explorer shell, sidebar, handle, tabs, and grid."
    );
  }

  const shellRect = shell.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const handleRect = handle.getBoundingClientRect();
  const tabsListRect = tabsList.getBoundingClientRect();
  const gapBetweenSidebarAndGrid = gridRect.left - sidebarRect.right;
  const unusedRightSpace = shellRect.right - gridRect.right;

  expect(sidebarRect.width).toBeGreaterThanOrEqual(300);
  expect(sidebarRect.width).toBeLessThanOrEqual(340);
  expect(tabsListRect.left).toBeGreaterThanOrEqual(sidebarRect.right - 1);
  expect(gridRect.left).toBeGreaterThanOrEqual(sidebarRect.right - 1);
  expect(handleRect.width).toBeGreaterThanOrEqual(16);
  expect(gapBetweenSidebarAndGrid).toBeLessThanOrEqual(64);
  expect(unusedRightSpace).toBeLessThanOrEqual(64);

  if (!(handle instanceof HTMLElement)) {
    throw new Error("Expected resizable handle to be focusable.");
  }
  expect(handle.getAttribute("role")).toBe("separator");
  expect(handle.tabIndex).toBeGreaterThanOrEqual(0);
  expect(handle.getAttribute("aria-orientation")).toBe("vertical");

  handle.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })
  );
  await expect
    .poll(() => sidebar.getBoundingClientRect().width)
    .toBeGreaterThan(sidebarRect.width + 40);

  handle.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Home" })
  );
  await expect
    .poll(() => sidebar.getBoundingClientRect().width)
    .toBeLessThan(240);

  const narrowedSidebarRect = sidebar.getBoundingClientRect();
  expect(narrowedSidebarRect.width).toBeGreaterThanOrEqual(192);
  expect(grid.getBoundingClientRect().left).toBeGreaterThanOrEqual(
    narrowedSidebarRect.right - 1
  );

  const filterInput = sidebar.querySelector("[data-slot='input']");
  const schemaPickerTrigger = Array.from(
    sidebar.querySelectorAll("button")
  ).find((button) => button.textContent?.includes("Schema"));
  if (
    !(
      filterInput instanceof HTMLElement &&
      schemaPickerTrigger instanceof HTMLElement
    )
  ) {
    throw new Error("Expected schema picker and filter input.");
  }
  const filterRect = filterInput.getBoundingClientRect();
  const schemaPickerRect = schemaPickerTrigger.getBoundingClientRect();
  const controlsAreStacked = filterRect.top >= schemaPickerRect.bottom - 1;
  const controlsShareRowWithoutOverlap =
    filterRect.left >= schemaPickerRect.right - 1;
  expect(controlsAreStacked || controlsShareRowWithoutOverlap).toBe(true);

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
  expect(tableNameRect.width).toBeGreaterThan(120);
  expect(sizeLabelRect.right).toBeLessThanOrEqual(
    sidebar.getBoundingClientRect().right
  );
  expect(sizeLabelRect.left).toBeGreaterThanOrEqual(tableNameRect.right - 1);
});
