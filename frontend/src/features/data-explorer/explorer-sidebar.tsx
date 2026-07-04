"use client";

import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type Rect,
  Virtualizer,
} from "@tanstack/virtual-core";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Database as DatabaseIcon,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogSyncNotice } from "@/features/data-explorer/catalog-sync-notice";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type CategoryKey,
  type ResourceItem,
  type Selection,
} from "@/features/data-explorer/data-explorer-types";
import { ExplorerResourceButton } from "@/features/data-explorer/explorer-resource-button";
import type { catalogSyncNotice } from "@/features/data-explorer/use-data-explorer-state";
import { cn } from "@/lib/utils";

function SchemaPicker({
  hasNextPage,
  isFetchingNextPage,
  onChange,
  onLoadMore,
  schemas,
  value,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onChange: (schema: SchemaSummary) => void;
  onLoadMore: () => void;
  schemas: SchemaSummary[];
  value: SchemaSummary | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Schema
        </span>
        <span className="flex-1 truncate text-left font-mono text-[13px]">
          {value?.name ?? "—"}
        </span>
        <ChevronsUpDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandList className="pt-1">
            <CommandEmpty className="p-0">
              <SearchEmptyState
                className="min-h-24 py-6"
                resourceName="schemas"
              />
            </CommandEmpty>
            <CommandGroup heading="Switch schema">
              {schemas.map((schema) => (
                <CommandItem
                  data-checked={value?.id === schema.id}
                  key={schema.id}
                  onSelect={() => {
                    onChange(schema);
                    setOpen(false);
                  }}
                  value={schema.name}
                >
                  <Check
                    className={cn(
                      "size-3.5",
                      value?.id === schema.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-sm">{schema.name}</span>
                </CommandItem>
              ))}
              <CategoryInfiniteScrollSentinel
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={onLoadMore}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface CategoryPaginationState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading?: boolean | undefined;
}

type VirtualResourceListItem =
  | {
      category: CategoryKey;
      key: string;
      kind: "category";
    }
  | {
      category: CategoryKey;
      item: ResourceItem;
      key: string;
      kind: "resource";
    }
  | {
      category: CategoryKey;
      hasNextPage: boolean;
      isFetchingNextPage: boolean;
      key: string;
      kind: "sentinel";
    };

interface ResourceListItemControls {
  isCategoryOpen: (category: CategoryKey) => boolean;
  onLoadMoreCategory: (category: CategoryKey) => void;
  onResourceIntent?:
    | ((category: CategoryKey, name: string) => void)
    | undefined;
  onSelectResource: (category: CategoryKey, name: string) => void;
  query: string;
  scrollRoot: HTMLDivElement | null;
  selection: Selection;
  toggleCategory: (category: CategoryKey) => void;
}

const RESOURCE_LIST_FALLBACK_ITEM_SIZE = 32;
const RESOURCE_LIST_CATEGORY_ITEM_SIZE = 36;
const RESOURCE_LIST_RESOURCE_ITEM_SIZE = 30;
const RESOURCE_LIST_SENTINEL_ITEM_SIZE = 34;
const RESOURCE_LIST_INITIAL_RECT = { height: 420, width: 300 } satisfies Rect;
const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

function schemaEmptyMessage({
  schemaSelectionError,
  schemasLoading,
}: {
  schemaSelectionError: unknown;
  schemasLoading: boolean;
}): string {
  if (schemasLoading) {
    return "Loading schemas…";
  }
  if (schemaSelectionError) {
    return "Schema not found.";
  }
  return "No schemas";
}

function hasVisibleCategoryResource({
  categoryPagination,
  itemsByCategory,
}: {
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
}): boolean {
  if (itemsByCategory === null) {
    return false;
  }
  return CATEGORY_ORDER.some((category) => {
    const pagination = categoryPagination[category];
    return (
      itemsByCategory[category].length > 0 ||
      pagination.hasNextPage ||
      pagination.isFetchingNextPage
    );
  });
}

function ResourceListLoadingSkeleton() {
  return (
    <div className="space-y-3 px-2 py-2" data-testid="resource-list-loading">
      {CATEGORY_ORDER.map((category) => (
        <div className="space-y-1.5" key={category}>
          <div className="flex items-center gap-2 px-2 py-1">
            <Skeleton className="size-3.5 shrink-0" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-1">
            {["first", "second", "third"].map((rowId) => (
              <div
                className="flex h-7 items-center gap-2 rounded-md px-3"
                key={`${category}-${rowId}`}
              >
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function hasResourceLoadingState(
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>
): boolean {
  return CATEGORY_ORDER.some(
    (category) => categoryPagination[category].isLoading === true
  );
}

function shouldShowSearchEmptyState({
  activeSchema,
  hasResourceLoadError,
  hasResourceLoading,
  hasVisibleResource,
  itemsByCategory,
  query,
}: {
  activeSchema: SchemaSummary | null;
  hasResourceLoadError: boolean;
  hasResourceLoading: boolean;
  hasVisibleResource: boolean;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
  query: string;
}): boolean {
  return (
    activeSchema !== null &&
    itemsByCategory !== null &&
    query.trim().length > 0 &&
    !hasResourceLoadError &&
    !hasResourceLoading &&
    !hasVisibleResource
  );
}

function CategoryInfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  scrollRoot,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  scrollRoot?: Element | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(
    function loadMoreWhenVisible() {
      const element = ref.current;
      // No observer while a page is in flight: another onLoadMore would
      // cancel and restart the active fetchNextPage request. When the fetch
      // finishes, this effect re-runs and the fresh observer's initial
      // notification re-triggers the load if a short page left the sentinel
      // inside the viewport.
      if (!(element && hasNextPage) || isFetchingNextPage) {
        return;
      }
      if (scrollRoot === null) {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            onLoadMore();
          }
        },
        { root: scrollRoot ?? null }
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [hasNextPage, isFetchingNextPage, onLoadMore, scrollRoot]
  );

  if (!(hasNextPage || isFetchingNextPage)) {
    return null;
  }

  return (
    <div
      className="flex h-[34px] items-center px-3 text-muted-foreground text-xs"
      ref={ref}
    >
      {isFetchingNextPage ? "Loading more…" : "Scroll for more"}
    </div>
  );
}

function ResourceCategoryList({
  categoryPagination,
  expandedCategories,
  itemsByCategory,
  onLoadMoreCategory,
  onResourceIntent,
  onSelectResource,
  query,
  selection,
  setExpandedCategories,
}: {
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  expandedCategories: Set<CategoryKey>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]>;
  onLoadMoreCategory: (category: CategoryKey) => void;
  onResourceIntent?:
    | ((category: CategoryKey, name: string) => void)
    | undefined;
  onSelectResource: (category: CategoryKey, name: string) => void;
  query: string;
  selection: Selection;
  setExpandedCategories: (
    update: (prev: Set<CategoryKey>) => Set<CategoryKey>
  ) => void;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null
  );
  const isCategoryOpen = (category: CategoryKey) =>
    expandedCategories.has(category);
  const toggleCategory = (category: CategoryKey) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };
  const flatItems = flattenResourceListItems({
    categoryPagination,
    expandedCategories,
    itemsByCategory,
  });
  const itemControls: ResourceListItemControls = {
    isCategoryOpen,
    onLoadMoreCategory,
    onResourceIntent,
    onSelectResource,
    query,
    scrollRoot: scrollElement,
    selection,
    toggleCategory,
  };
  const virtualizer = useResourceListVirtualizer({
    items: flatItems,
    scrollElement,
  });
  const visibleItems = virtualizer.getVirtualItems();

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      data-testid="resource-list-scroll"
      ref={setScrollElement}
    >
      <ul
        className="relative m-0 w-full list-none p-0"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {visibleItems.map((virtualItem) => {
          const listItem = flatItems[virtualItem.index];
          if (!listItem) {
            return null;
          }
          return (
            <li
              className="absolute top-0 left-0 w-full"
              key={virtualItem.key}
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ResourceListItem controls={itemControls} item={listItem} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useResourceListVirtualizer({
  items,
  scrollElement,
}: {
  items: VirtualResourceListItem[];
  scrollElement: HTMLDivElement | null;
}): Virtualizer<HTMLDivElement, Element> {
  const rerender = useReducer((tick: number) => tick + 1, 0)[1];
  const [virtualizer] = useState(
    () =>
      new Virtualizer<HTMLDivElement, Element>({
        count: items.length,
        estimateSize: (index) => estimateResourceListItemSize(items[index]),
        getScrollElement: () => scrollElement,
        observeElementOffset,
        observeElementRect: observeResourceListRect,
        scrollToFn: elementScroll,
      })
  );
  virtualizer.setOptions({
    count: items.length,
    estimateSize: (index) => estimateResourceListItemSize(items[index]),
    getItemKey: (index) => getResourceListItemKey(items, index),
    getScrollElement: () => scrollElement,
    initialRect: RESOURCE_LIST_INITIAL_RECT,
    observeElementOffset,
    observeElementRect: observeResourceListRect,
    // Always re-render asynchronously: React 19 batches the update within the
    // same frame, and the synchronous flushSync path (virtual-core sets sync
    // while scrolling) forced layout-blocking renders that also dirtied
    // layout for every other ResizeObserver callback in the page.
    onChange: () => {
      rerender();
    },
    overscan: 8,
    scrollToFn: elementScroll,
  });

  useIsomorphicLayoutEffect(() => virtualizer._didMount(), [virtualizer]);
  useIsomorphicLayoutEffect(() => {
    virtualizer._willUpdate();
  });

  return virtualizer;
}

function observeResourceListRect(
  instance: Virtualizer<HTMLDivElement, Element>,
  callback: (rect: Rect) => void
) {
  // The list is vertical, so only height changes affect virtualization.
  // Forward a constant width and skip width-only rect changes: without this,
  // dragging the panel handle or resizing the window re-rendered the whole
  // sidebar on every frame.
  let lastHeight: number | null = null;
  return observeElementRect(instance, (rect) => {
    const height =
      rect.height > 0 ? rect.height : RESOURCE_LIST_INITIAL_RECT.height;
    if (height === lastHeight) {
      return;
    }
    lastHeight = height;
    callback({
      height,
      width: RESOURCE_LIST_INITIAL_RECT.width,
    });
  });
}

function flattenResourceListItems({
  categoryPagination,
  expandedCategories,
  itemsByCategory,
}: {
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  expandedCategories: Set<CategoryKey>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]>;
}): VirtualResourceListItem[] {
  const flatItems: VirtualResourceListItem[] = [];
  for (const category of CATEGORY_ORDER) {
    const allItems = itemsByCategory[category];
    const pagination = categoryPagination[category];
    if (
      allItems.length === 0 &&
      !(pagination.hasNextPage || pagination.isFetchingNextPage)
    ) {
      continue;
    }
    flatItems.push({
      category,
      key: `${category}:category`,
      kind: "category",
    });
    if (!expandedCategories.has(category)) {
      continue;
    }
    for (const item of allItems) {
      flatItems.push({
        category,
        item,
        key: `${category}:resource:${item.name}`,
        kind: "resource",
      });
    }
    if (pagination.hasNextPage || pagination.isFetchingNextPage) {
      flatItems.push({
        category,
        hasNextPage: pagination.hasNextPage,
        isFetchingNextPage: pagination.isFetchingNextPage,
        key: `${category}:sentinel`,
        kind: "sentinel",
      });
    }
  }
  return flatItems;
}

function estimateResourceListItemSize(
  item: VirtualResourceListItem | undefined
): number {
  if (!item) {
    return RESOURCE_LIST_FALLBACK_ITEM_SIZE;
  }
  switch (item.kind) {
    case "category":
      return RESOURCE_LIST_CATEGORY_ITEM_SIZE;
    case "resource":
      return RESOURCE_LIST_RESOURCE_ITEM_SIZE;
    case "sentinel":
      return RESOURCE_LIST_SENTINEL_ITEM_SIZE;
    default:
      return assertNeverVirtualResourceListItem(item);
  }
}

function assertNeverVirtualResourceListItem(_item: never): never {
  throw new Error("Unexpected resource list item");
}

function getResourceListItemKey(
  items: VirtualResourceListItem[],
  index: number
): string {
  const item = items[index];
  if (!item) {
    throw new Error("Expected virtual resource list item");
  }
  return item.key;
}

function ResourceListItem({
  controls,
  item,
}: {
  controls: ResourceListItemControls;
  item: VirtualResourceListItem;
}) {
  const meta = CATEGORY_META[item.category];
  switch (item.kind) {
    case "category": {
      const isOpen = controls.isCategoryOpen(item.category);
      return (
        <Button
          aria-expanded={isOpen}
          className="h-9 w-full justify-start gap-2 px-2 py-0 font-normal text-muted-foreground hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-muted aria-expanded:hover:text-foreground"
          onClick={() => controls.toggleCategory(item.category)}
          variant="ghost"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              isOpen && "rotate-90"
            )}
          />
          <span className="font-medium text-[11px] uppercase tracking-wider">
            {meta.label}
          </span>
        </Button>
      );
    }
    case "resource":
      return (
        <ExplorerResourceButton
          category={item.category}
          icon={meta.icon}
          item={item.item}
          onResourceIntent={controls.onResourceIntent}
          onSelectResource={controls.onSelectResource}
          query={controls.query}
          selection={controls.selection}
        />
      );
    case "sentinel":
      return (
        <CategoryInfiniteScrollSentinel
          hasNextPage={item.hasNextPage}
          isFetchingNextPage={item.isFetchingNextPage}
          onLoadMore={() => controls.onLoadMoreCategory(item.category)}
          scrollRoot={controls.scrollRoot}
        />
      );
    default:
      return assertNeverVirtualResourceListItem(item);
  }
}

function SchemaEmptyPanel({
  activeSchema,
  schemaSelectionError,
  schemasLoading,
}: {
  activeSchema: SchemaSummary | null;
  schemaSelectionError: unknown;
  schemasLoading: boolean;
}) {
  if (activeSchema) {
    return null;
  }

  return (
    <p className="px-3 py-6 text-center text-muted-foreground text-sm">
      {schemaEmptyMessage({ schemaSelectionError, schemasLoading })}
    </p>
  );
}

function schemaOverviewButtonLabel(databaseLabel: string) {
  return `View ${databaseLabel.trim() || "database"} schema overview`;
}

function ExplorerSidebar({
  activeSchema,
  className,
  databaseLabel,
  expandedCategories,
  itemsByCategory,
  categoryPagination,
  onLoadMoreCategory,
  onLoadMoreSchemas,
  onRetryTables,
  onRetryViews,
  onSelectSchemaOverview,
  onResourceIntent,
  onSelectResource,
  onSelectSchema,
  query,
  schemaSelectionError,
  schemasLoading,
  schemasSyncNotice,
  schemas,
  selection,
  setExpandedCategories,
  setQuery,
  tablesError,
  tablesSyncNotice,
  viewsError,
}: {
  activeSchema: SchemaSummary | null;
  className?: string;
  databaseLabel: string;
  expandedCategories: Set<CategoryKey>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  onLoadMoreCategory: (category: CategoryKey) => void;
  onLoadMoreSchemas: () => void;
  onRetryTables: () => Promise<unknown>;
  onRetryViews: () => Promise<unknown>;
  onResourceIntent?: (category: CategoryKey, name: string) => void;
  onSelectResource: (category: CategoryKey, name: string) => void;
  onSelectSchema: (schema: SchemaSummary) => void;
  onSelectSchemaOverview: () => void;
  query: string;
  schemaSelectionError: unknown;
  schemasLoading: boolean;
  schemasSyncNotice: ReturnType<typeof catalogSyncNotice>;
  schemas: SchemaSummary[];
  selection: Selection;
  setExpandedCategories: (
    update: (prev: Set<CategoryKey>) => Set<CategoryKey>
  ) => void;
  setQuery: (value: string) => void;
  tablesError: unknown;
  tablesSyncNotice: ReturnType<typeof catalogSyncNotice>;
  viewsError: unknown;
}) {
  const hasVisibleResource = hasVisibleCategoryResource({
    categoryPagination,
    itemsByCategory,
  });
  const hasResourceLoadError = tablesError !== null || viewsError !== null;
  const hasResourceLoading = hasResourceLoadingState(categoryPagination);
  const showSearchEmptyState = shouldShowSearchEmptyState({
    activeSchema,
    hasResourceLoadError,
    hasResourceLoading,
    hasVisibleResource,
    itemsByCategory,
    query,
  });
  // Object browser thresholds shed chrome in stages: below 18rem stacks search
  // controls, below 15rem hides row sizes, below 14rem hides icons and tightens
  // spacing.
  return (
    <aside
      aria-label="Database objects"
      className={cn(
        "@container/object-browser flex w-[300px] shrink-0 flex-col border-border border-r bg-sidebar/40",
        className
      )}
    >
      <div className="flex flex-col gap-2 @max-[14rem]/object-browser:px-2 px-3 pt-3 pb-2">
        <Button
          aria-label={schemaOverviewButtonLabel(databaseLabel)}
          className={cn(
            "h-auto justify-start @max-[14rem]/object-browser:gap-1.5 gap-2 px-1.5 py-1",
            selection.kind === "schema" && "bg-accent"
          )}
          onClick={onSelectSchemaOverview}
          variant="ghost"
        >
          <DatabaseIcon className="@max-[14rem]/object-browser:hidden size-4 text-muted-foreground" />
          <span className="truncate font-medium text-sm">{databaseLabel}</span>
        </Button>
        <SchemaPicker
          hasNextPage={categoryPagination.schemas.hasNextPage}
          isFetchingNextPage={categoryPagination.schemas.isFetchingNextPage}
          onChange={onSelectSchema}
          onLoadMore={onLoadMoreSchemas}
          schemas={schemas}
          value={activeSchema}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pr-7 pl-8 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            value={query}
          />
          {query ? (
            <Button
              aria-label="Clear filter"
              className="absolute top-1/2 right-1.5 size-5 -translate-y-1/2 p-0"
              onClick={() => setQuery("")}
              size="icon"
              variant="ghost"
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        {schemasSyncNotice ? (
          <CatalogSyncNotice notice={schemasSyncNotice} surface="sidebar" />
        ) : null}

        <SchemaEmptyPanel
          activeSchema={activeSchema}
          schemaSelectionError={schemaSelectionError}
          schemasLoading={schemasLoading}
        />

        {activeSchema && tablesError ? (
          <div className="mx-2 mb-2 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>Failed to load tables.</span>
            </div>
            <RetryActionButton
              className="self-start"
              label="Retry"
              onRetry={onRetryTables}
              size="xs"
              variant="outline"
            />
          </div>
        ) : null}

        {activeSchema && viewsError ? (
          <div className="mx-2 mb-2 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>Failed to load views.</span>
            </div>
            <RetryActionButton
              className="self-start"
              label="Retry"
              onRetry={onRetryViews}
              size="xs"
              variant="outline"
            />
          </div>
        ) : null}

        {activeSchema && tablesSyncNotice ? (
          <CatalogSyncNotice notice={tablesSyncNotice} surface="sidebar" />
        ) : null}

        {activeSchema && hasResourceLoading && !hasVisibleResource ? (
          <ResourceListLoadingSkeleton />
        ) : null}

        {activeSchema && itemsByCategory && hasVisibleResource ? (
          <ResourceCategoryList
            categoryPagination={categoryPagination}
            expandedCategories={expandedCategories}
            itemsByCategory={itemsByCategory}
            onLoadMoreCategory={onLoadMoreCategory}
            onResourceIntent={onResourceIntent}
            onSelectResource={onSelectResource}
            query={query}
            selection={selection}
            setExpandedCategories={setExpandedCategories}
          />
        ) : null}
        {showSearchEmptyState ? (
          <SearchEmptyState resourceName="database objects" />
        ) : null}
      </div>
    </aside>
  );
}

export { CategoryInfiniteScrollSentinel, ExplorerSidebar };
