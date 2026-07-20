import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CATEGORY_ORDER,
  type CategoryKey,
  type ResourceItem,
} from "@/features/data-explorer/data-explorer-types";
import {
  CategoryInfiniteScrollSentinel,
  ExplorerSidebar,
} from "@/features/data-explorer/explorer-sidebar";

type IntersectionCallback = (
  entries: Array<{ isIntersecting: boolean }>
) => void;

const FIRST_VIRTUAL_TABLE_RE = /table_0000/i;
const LAST_VIRTUAL_TABLE_RE = /table_0999/i;
const VIRTUAL_TABLE_BUTTON_RE = /^table_/i;
const LONG_TABLE_BUTTON_RE = /this_is_a_very_long/;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  private readonly callback: IntersectionCallback;
  private disconnected = false;
  observedCount = 0;
  root: Element | Document | null;

  constructor(
    callback: IntersectionCallback,
    options?: IntersectionObserverInit
  ) {
    this.callback = callback;
    this.root = options?.root ?? null;
    MockIntersectionObserver.instances.push(this);
  }

  observe() {
    this.observedCount += 1;
  }

  disconnect() {
    this.disconnected = true;
  }

  // Simulates the browser delivering an intersection notification. A real
  // observer never notifies after disconnect.
  intersect() {
    if (this.disconnected) {
      return;
    }
    this.callback([{ isIntersecting: true }]);
  }
}

function liveObserver(): MockIntersectionObserver {
  const observer = MockIntersectionObserver.instances.at(-1);
  if (!observer) {
    throw new Error("expected an IntersectionObserver instance");
  }
  return observer;
}

function categoryPagination() {
  return Object.fromEntries(
    CATEGORY_ORDER.map((category) => [
      category,
      { hasNextPage: false, isFetchingNextPage: false, isLoading: false },
    ])
  ) as Record<
    CategoryKey,
    { hasNextPage: boolean; isFetchingNextPage: boolean; isLoading: boolean }
  >;
}

type ExplorerSidebarProps = ComponentProps<typeof ExplorerSidebar>;

const defaultSchema = {
  id: "schema-public",
  name: "public",
  owner: "admin",
};

function explorerSidebarProps(
  overrides: Partial<ExplorerSidebarProps> = {}
): ExplorerSidebarProps {
  return {
    activeSchema: defaultSchema,
    categoryPagination: {
      schemas: { hasNextPage: false, isFetchingNextPage: false },
      ...categoryPagination(),
    },
    expandedCategories: new Set(CATEGORY_ORDER),
    itemsByCategory: {
      tables: [{ name: "orders", sizeLabel: "12 KB" }],
      views: [],
    },
    onLoadMoreCategory: vi.fn(),
    onLoadMoreSchemas: vi.fn(),
    onRetryTables: vi.fn(),
    onRetryViews: vi.fn(),
    onSelectResource: vi.fn(),
    onSelectSchema: vi.fn(),
    query: "",
    schemaSelectionError: null,
    schemas: [defaultSchema],
    schemasLoading: false,
    schemasSyncNotice: null,
    selection: { kind: "schema" },
    setExpandedCategories: vi.fn(),
    setQuery: vi.fn(),
    tablesError: null,
    tablesSyncNotice: null,
    viewsError: null,
    ...overrides,
  };
}

function renderExplorerSidebar(overrides: Partial<ExplorerSidebarProps> = {}) {
  return render(<ExplorerSidebar {...explorerSidebarProps(overrides)} />);
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExplorerSidebar resources", () => {
  it("exposes full resource names to native hover tooltips", () => {
    const longTableName =
      "this_is_a_very_long_table_name_that_should_not_be_hidden";

    renderExplorerSidebar({
      itemsByCategory: {
        tables: [{ name: longTableName, sizeLabel: "1.3 MB" }],
        views: [],
      },
    });

    expect(
      screen
        .getByRole("button", { name: LONG_TABLE_BUTTON_RE })
        .getAttribute("title")
    ).toBe(longTableName);
  });
});

describe("CategoryInfiniteScrollSentinel", () => {
  it("renders nothing when there are no further pages", () => {
    render(
      <CategoryInfiniteScrollSentinel
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.queryByText("Scroll for more")).toBeNull();
  });

  it("does not load more while a page is already being fetched", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />
    );

    liveObserver().intersect();
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={true}
        onLoadMore={onLoadMore}
      />
    );

    // While the next page is in flight the sentinel must not request again:
    // a second fetchNextPage call cancels and restarts the active request.
    liveObserver().intersect();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("re-observes after a fetch finishes so a still-visible sentinel keeps loading", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />
    );

    liveObserver().intersect();
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={true}
        onLoadMore={onLoadMore}
      />
    );
    const observerCountWhileFetching =
      MockIntersectionObserver.instances.length;

    rerender(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />
    );

    // A short page can leave the sentinel inside the viewport without any
    // further intersection change, so the component must create a fresh
    // observer whose initial notification re-triggers the load.
    expect(MockIntersectionObserver.instances.length).toBeGreaterThan(
      observerCountWhileFetching
    );
    liveObserver().intersect();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("uses the provided scroll root for intersection checks", () => {
    const scrollRoot = document.createElement("div");

    render(
      <CategoryInfiniteScrollSentinel
        hasNextPage={true}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
        scrollRoot={scrollRoot}
      />
    );

    expect(liveObserver().root).toBe(scrollRoot);
  });
});

describe("ExplorerSidebar search empty state", () => {
  it("keeps large object lists bounded to the visible window", async () => {
    const largeTables = Array.from({ length: 1000 }, (_, index) => ({
      name: `table_${index.toString().padStart(4, "0")}`,
      sizeLabel: `${index + 1} KB`,
    }));

    renderExplorerSidebar({
      expandedCategories: new Set(["tables"]),
      itemsByCategory: {
        tables: largeTables,
        views: [],
      },
    });

    expect(
      await screen.findByRole("button", { name: FIRST_VIRTUAL_TABLE_RE })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: LAST_VIRTUAL_TABLE_RE })
    ).toBeNull();
    // The happy-dom environment has no layout, so this verifies the initialRect
    // fallback keeps the virtual window bounded until a real browser measurement arrives.
    expect(
      screen.queryAllByRole("button", { name: VIRTUAL_TABLE_BUTTON_RE }).length
    ).toBeLessThan(60);
  });

  it("shows empty copy when a resource filter matches nothing", () => {
    const emptyItemsByCategory: Record<CategoryKey, ResourceItem[]> = {
      tables: [],
      views: [],
    };

    renderExplorerSidebar({
      itemsByCategory: emptyItemsByCategory,
      query: "sdsd",
    });

    expect(screen.getByText("No database objects found")).toBeTruthy();
  });

  it("paces the loading skeleton: hidden at first, shown for slow loads", () => {
    vi.useFakeTimers();
    try {
      const emptyItemsByCategory: Record<CategoryKey, ResourceItem[]> = {
        tables: [],
        views: [],
      };

      renderExplorerSidebar({
        categoryPagination: {
          schemas: { hasNextPage: false, isFetchingNextPage: false },
          tables: {
            hasNextPage: false,
            isFetchingNextPage: false,
            isLoading: true,
          },
          views: {
            hasNextPage: false,
            isFetchingNextPage: false,
            isLoading: true,
          },
        },
        itemsByCategory: emptyItemsByCategory,
        query: "orders",
      });

      // Within the appear delay nothing renders: no premature skeleton, and
      // no misleading empty state either.
      expect(screen.queryByText("No database objects found")).toBeNull();
      expect(screen.queryByTestId("resource-list-loading")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(screen.getByTestId("resource-list-loading")).toBeTruthy();
      expect(screen.queryByText("No database objects found")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
