import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useDataExplorerPageController } from "@/features/data-explorer/data-explorer-page-controller";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import { createTestQueryClient } from "@/test/query-client";

interface TableListData {
  pages: Array<{
    syncMetadata?: undefined;
    tables: Array<{
      displayName: string;
      name: string;
      rowCount: bigint;
      sizeBytes: bigint;
    }>;
  }>;
}

interface ViewListData {
  pages: Array<{
    syncMetadata?: undefined;
    views: Array<{
      displayName: string;
      name: string;
      rowCount: bigint;
      sizeBytes: bigint;
      viewType: number;
    }>;
  }>;
}

const mocks = rs.hoisted(() => {
  const emptyListQuery = <T,>() => ({
    data: undefined as T | undefined,
    error: null,
    fetchNextPage: rs.fn(() => Promise.resolve()),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: rs.fn(() => Promise.resolve()),
  });
  return {
    filteredTablesQuery: emptyListQuery<TableListData>(),
    navigate: rs.fn(),
    schemasQuery: {
      data: {
        pages: [
          {
            schemas: [
              {
                displayName: "public",
                name: "instances/inst-1/databases/db-1/schemas/public",
                owner: "app_owner",
              },
            ],
          },
        ],
      },
      error: null as Error | null,
      fetchNextPage: rs.fn(() => Promise.resolve()),
      hasNextPage: false,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      isPending: false,
      refetch: rs.fn(() => Promise.resolve()),
    },
    tablesQuery: emptyListQuery<TableListData>(),
    useListTablesInfiniteQuery: rs.fn(),
    useListViewsInfiniteQuery: rs.fn(),
    viewsQuery: emptyListQuery<ViewListData>(),
  };
});

rs.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

rs.mock("@connectrpc/connect-query", () => ({
  useQuery: () => ({ data: undefined }),
  useTransport: () => ({}),
}));

rs.mock("@/hooks/api/schema", () => ({
  schemasForDatabaseQueryInput: rs.fn((input) => input),
  useGetSchemaQuery: () => ({
    data: undefined,
    error: null,
    isFetching: false,
    isLoading: false,
  }),
  useListSchemasInfiniteQuery: () => mocks.schemasQuery,
}));

rs.mock("@/hooks/api/table", () => ({
  assertNoUnhandledTableDetailQueries: rs.fn(),
  tableDetailQueryOptions: rs.fn(() => []),
  tablesForSchemaQueryInput: rs.fn((input) => input),
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
    refetch: rs.fn(() => Promise.resolve()),
  }),
  useGetTableQuery: () => ({ data: undefined, error: null }),
  useListTablesInfiniteQuery: mocks.useListTablesInfiniteQuery,
}));

rs.mock("@/hooks/api/view", () => ({
  useGetViewQuery: () => ({ data: undefined, error: null }),
  useListViewsInfiniteQuery: mocks.useListViewsInfiniteQuery,
  viewsForSchemaQueryInput: rs.fn((input) => input),
}));

rs.mock("@/lib/db-context", () => ({
  useDb: () => ({
    selectedDatabase: { name: "appdb" },
    selectedInstance: { allowMutations: true },
  }),
}));

rs.mock("@/lib/route-prefetch", () => ({
  prefetchRouteQueryOnIntent: rs.fn(),
}));

const BASE_SEARCH = {
  category: "tables",
  name: "accounts",
  schema: "public",
} satisfies DataExplorerSearch;

function tablePage(names: string[]): TableListData {
  return {
    pages: [
      {
        tables: names.map((name) => ({
          displayName: name,
          name: `instances/inst-1/databases/db-1/schemas/public/tables/${name}`,
          rowCount: 1n,
          sizeBytes: 1024n,
        })),
      },
    ],
  };
}

function renderController(search: DataExplorerSearch) {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useDataExplorerPageController({
        databaseId: "db-1",
        instanceId: "inst-1",
        search,
      }),
    { wrapper }
  );
}

function activeTableOrder() {
  const activeCall = mocks.useListTablesInfiniteQuery.mock.calls
    .filter(([, options]) => options?.enabled === true)
    .at(-1);
  return activeCall?.[0]?.orderBy;
}

beforeEach(() => {
  rs.useFakeTimers();
  mocks.tablesQuery.data = tablePage(["accounts", "events"]);
  mocks.tablesQuery.hasNextPage = false;
  mocks.filteredTablesQuery.data = tablePage(["accounts"]);
  mocks.viewsQuery.data = { pages: [{ views: [] }] };
  mocks.viewsQuery.hasNextPage = false;
  mocks.useListTablesInfiniteQuery.mockImplementation(
    (input?: { filter?: string }) =>
      input?.filter ? mocks.filteredTablesQuery : mocks.tablesQuery
  );
  mocks.useListViewsInfiniteQuery.mockImplementation(() => mocks.viewsQuery);
});

afterEach(() => {
  rs.useRealTimers();
  rs.clearAllMocks();
});

describe("data explorer search navigation", () => {
  it("pushes a new history entry when selecting a resource", () => {
    const { result } = renderController({ schema: "public" });

    act(() => {
      result.current.onSelectResource("tables", "accounts");
    });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ replace: false })
    );
  });

  it("hydrates sidebar search from the URL and debounces URL writes", () => {
    const { result } = renderController({ q: "acct", schema: "public" });

    expect(result.current.query).toBe("acct");

    act(() => {
      result.current.setQuery("accounts");
    });

    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => {
      rs.advanceTimersByTime(200);
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true })
    );
  });
});

it("requests table catalog pages ordered by name", () => {
  renderController({ ...BASE_SEARCH });

  expect(activeTableOrder()).toBe("name asc");
});

it("keeps sidebar table sort local while updating table ordering", () => {
  const { result } = renderController({ ...BASE_SEARCH });

  act(() => {
    result.current.onTableListSortChange("size-desc");
  });

  expect(activeTableOrder()).toBe("size_bytes desc, name asc");
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("persists the schema map tab without creating a sidebar destination", () => {
  const { result } = renderController({ schema: "public" });

  act(() => {
    result.current.onSchemaTabChange("map");
  });

  expect(mocks.navigate).toHaveBeenCalledTimes(1);
  const navigation = mocks.navigate.mock.calls[0]?.[0];
  expect(navigation).toMatchObject({
    params: { databaseId: "db-1", instanceId: "inst-1" },
    replace: false,
    to: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  expect(navigation.search({ schema: "public" })).toEqual({
    schema: "public",
    tab: "map",
  });
});

describe("schema overview stats", () => {
  it("drives the schema overview from unfiltered catalog lists", () => {
    const { result } = renderController({ schema: "public" });

    act(() => {
      result.current.setQuery("acc");
    });
    act(() => {
      rs.advanceTimersByTime(250);
    });

    // The sidebar list honors the typed filter…
    expect(
      result.current.itemsByCategory?.tables.map((table) => table.name)
    ).toEqual(["accounts"]);
    // …while the schema overview keeps the full unfiltered catalog, so
    // header counts and sizes do not change while the user types.
    expect(
      result.current.schemaOverview.tables.map((table) => table.name)
    ).toEqual(["accounts", "events"]);
  });

  it("reports partial catalogs so the overview can mark stats as lower bounds", () => {
    mocks.tablesQuery.hasNextPage = true;

    const { result } = renderController({ schema: "public" });

    expect(result.current.schemaOverview.hasMoreTables).toBe(true);
    expect(result.current.schemaOverview.hasMoreViews).toBe(false);
  });
});
