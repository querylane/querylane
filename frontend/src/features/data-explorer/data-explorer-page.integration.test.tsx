import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataExplorerPage } from "@/features/data-explorer/data-explorer-page";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";

const ACCOUNTS_BUTTON_NAME = /^accounts 48 KB$/i;

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => createMediaQueryList({ matches, query })),
  });
}

function createMediaQueryList({
  matches,
  query,
}: {
  matches: boolean;
  query: string;
}): MediaQueryList {
  return {
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    matches,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  prefetchRouteQueryOnIntent: vi.fn(),
  schemasQuery: {
    data: undefined as
      | {
          pages: Array<{
            schemas: Array<{
              displayName: string;
              name: string;
              owner: string;
            }>;
          }>;
        }
      | undefined,
    error: new Error("schema rpc failed") as Error | null,
    fetchNextPage: vi.fn(() => Promise.resolve()),
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  tablesQuery: {
    data: undefined as
      | {
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
      | undefined,
    error: null,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
  viewsQuery: {
    data: {
      pages: [
        {
          views: [] as Array<{
            displayName: string;
            name: string;
            rowCount: bigint;
            sizeBytes: bigint;
            viewType: number;
          }>,
        },
      ],
    },
    error: null,
    fetchNextPage: vi.fn(() => Promise.resolve()),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@connectrpc/connect-query", () => ({
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
  tableDetailQueryOptions: vi.fn(() => [
    { queryKey: ["columns"], staleTime: 1 },
    { queryKey: ["indexes"], staleTime: 1 },
    { queryKey: ["constraints"], staleTime: 1 },
    { queryKey: ["policies"], staleTime: 1 },
    { queryKey: ["triggers"], staleTime: 1 },
    { queryKey: ["partition-metadata"], staleTime: 1 },
  ]),
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
  useGetTableQuery: () => ({ data: undefined }),
  useListTablesInfiniteQuery: () => mocks.tablesQuery,
}));

vi.mock("@/hooks/api/view", () => ({
  useGetViewQuery: () => ({ data: undefined }),
  useListViewsInfiniteQuery: () => mocks.viewsQuery,
  viewsForSchemaQueryInput: vi.fn((input) => input),
}));

vi.mock("@/lib/db-context", () => ({
  useDb: () => ({ selectedDatabase: { name: "appdb" } }),
}));

vi.mock("@/lib/route-prefetch", () => ({
  prefetchRouteQueryOnIntent: mocks.prefetchRouteQueryOnIntent,
}));

function renderExplorer(search: DataExplorerSearch = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DataExplorerPage databaseId="db-1" instanceId="inst-1" search={search} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.schemasQuery.data = { pages: [{ schemas: [] }] };
  mocks.schemasQuery.error = new Error("schema rpc failed");
  mocks.schemasQuery.isFetching = false;
  mocks.schemasQuery.isFetchingNextPage = false;
  mocks.schemasQuery.isPending = false;
  mocks.schemasQuery.hasNextPage = false;
  mocks.tablesQuery.data = undefined;
  mocks.tablesQuery.error = null;
  mocks.tablesQuery.isLoading = false;
  mocks.viewsQuery.data = { pages: [{ views: [] }] };
  mocks.viewsQuery.error = null;
  mocks.viewsQuery.isLoading = false;
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "matchMedia");
  vi.clearAllMocks();
});

describe("DataExplorerPage", () => {
  it("keeps the explorer shell visible while schemas are loading", () => {
    mocks.schemasQuery.data = undefined;
    mocks.schemasQuery.error = null;
    mocks.schemasQuery.isFetching = true;
    mocks.schemasQuery.isPending = true;

    renderExplorer();

    expect(
      screen.getByRole("complementary", { name: "Database objects" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open object browser" })
    ).toBeTruthy();
    expect(screen.getByText("Loading schemas…")).toBeTruthy();
    expect(
      screen.queryByText("Fetching live metadata from the backend.")
    ).toBeNull();
  });

  it("shows a retryable page error when schema listing fails even if cached schema data is empty", () => {
    renderExplorer();

    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Error details" })).toBeTruthy();
    expect(screen.queryByText("No schemas")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Data Explorer" })).toBeNull();
  });

  it("renders the docked object browser on the first wide-screen paint", () => {
    setMatchMedia(true);
    mocks.schemasQuery.data = {
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
    };
    mocks.schemasQuery.error = null;

    renderExplorer();

    expect(
      screen.queryByRole("button", { name: "Open object browser" })
    ).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "Database objects" })
    ).toBeTruthy();
  });

  it("renders formatted table sizes in the sidebar table list", () => {
    mocks.schemasQuery.data = {
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
    };
    mocks.schemasQuery.error = null;
    mocks.tablesQuery.data = {
      pages: [
        {
          tables: [
            {
              displayName: "accounts",
              name: "instances/inst-1/databases/db-1/schemas/public/tables/accounts",
              rowCount: 42n,
              sizeBytes: 49_152n,
            },
          ],
        },
      ],
    };

    renderExplorer();

    const tableItem = screen.getByRole("button", {
      name: ACCOUNTS_BUTTON_NAME,
    });

    expect(tableItem.textContent).toContain("accounts");
    expect(tableItem.textContent).toContain("48 KB");
  });

  it("prefetches table detail queries when table navigation intent is shown", async () => {
    const user = userEvent.setup();
    mocks.schemasQuery.data = {
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
    };
    mocks.schemasQuery.error = null;
    mocks.tablesQuery.data = {
      pages: [
        {
          tables: [
            {
              displayName: "accounts",
              name: "instances/inst-1/databases/db-1/schemas/public/tables/accounts",
              rowCount: 42n,
              sizeBytes: 49_152n,
            },
          ],
        },
      ],
    };

    renderExplorer();

    await user.hover(
      screen.getByRole("button", { name: ACCOUNTS_BUTTON_NAME })
    );

    expect(mocks.prefetchRouteQueryOnIntent).toHaveBeenCalledTimes(6);
    for (const queryKey of [
      ["columns"],
      ["indexes"],
      ["constraints"],
      ["policies"],
      ["triggers"],
      ["partition-metadata"],
    ]) {
      expect(mocks.prefetchRouteQueryOnIntent).toHaveBeenCalledWith(
        expect.any(QueryClient),
        expect.objectContaining({ queryKey })
      );
    }
  });
});
