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
  ChevronRight,
  Database as DatabaseIcon,
  Folder,
  Search,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { RetryActionButton } from "@/components/retry-action-button";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogSyncNotice } from "@/features/data-explorer/catalog-sync-notice";
import {
  highlightMatch,
  matchesQuery,
  type SchemaSummary,
} from "@/features/data-explorer/data-explorer-model";
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
    }
  | {
      key: string;
      kind: "schema";
      schema: SchemaSummary;
    }
  | {
      hasNextPage: boolean;
      isFetchingNextPage: boolean;
      key: string;
      kind: "schemas-sentinel";
    }
  | {
      key: string;
      kind: "loading";
    }
  | {
      key: string;
      kind: "empty";
    };

interface ResourceListItemControls {
  activeSchemaId: string | null;
  isActiveSchemaExpanded: boolean;
  isCategoryOpen: (category: CategoryKey) => boolean;
  onLoadMoreCategory: (category: CategoryKey) => void;
  onLoadMoreSchemas: () => void;
  onResourceIntent?:
    | ((category: CategoryKey, name: string) => void)
    | undefined;
  onSelectResource: (category: CategoryKey, name: string) => void;
  onSelectSchema: (schema: SchemaSummary) => void;
  onToggleActiveSchema: () => void;
  query: string;
  scrollRoot: HTMLDivElement | null;
  selection: Selection;
  toggleCategory: (category: CategoryKey) => void;
}

type LoadingPhase = "idle" | "pending" | "skeleton";

const SKELETON_APPEAR_DELAY_MS = 300;
const SKELETON_MIN_VISIBLE_MS = 400;

/**
 * Paces the loading skeleton so schema expansion never flickers: nothing is
 * shown for the first 300ms (fast loads render content directly), and once
 * the skeleton appears it stays for at least 400ms so it is never yanked
 * out after a frame or two ("pending" = loading but skeleton suppressed).
 */
function useCalmLoadingPhase(isLoading: boolean): LoadingPhase {
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const shownAtRef = useRef(0);

  useEffect(
    function paceLoadingSkeleton() {
      if (isLoading) {
        setPhase((previous) =>
          previous === "skeleton" ? "skeleton" : "pending"
        );
        const timer = setTimeout(() => {
          shownAtRef.current = Date.now();
          setPhase("skeleton");
        }, SKELETON_APPEAR_DELAY_MS);
        return () => clearTimeout(timer);
      }
      const remainingVisible =
        shownAtRef.current + SKELETON_MIN_VISIBLE_MS - Date.now();
      if (shownAtRef.current > 0 && remainingVisible > 0) {
        const timer = setTimeout(() => {
          shownAtRef.current = 0;
          setPhase("idle");
        }, remainingVisible);
        return () => clearTimeout(timer);
      }
      shownAtRef.current = 0;
      setPhase("idle");
      return;
    },
    [isLoading]
  );

  // The effect lags the first paint by a frame; never let that frame render
  // the "No objects" row (or content) while a load is already in flight.
  if (isLoading && phase === "idle") {
    return "pending";
  }
  return phase;
}

const RESOURCE_LIST_FALLBACK_ITEM_SIZE = 32;
const RESOURCE_LIST_CATEGORY_ITEM_SIZE = 24;
const RESOURCE_LIST_RESOURCE_ITEM_SIZE = 26;
const RESOURCE_LIST_SENTINEL_ITEM_SIZE = 34;
const RESOURCE_LIST_SCHEMA_ITEM_SIZE = 28;
const RESOURCE_LIST_EMPTY_ITEM_SIZE = 24;
const RESOURCE_LIST_LOADING_ITEM_SIZE = 86;
const RESOURCE_LIST_INITIAL_RECT = { height: 420, width: 300 } satisfies Rect;
const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

function anySchemaNameMatches(
  schemas: SchemaSummary[],
  query: string
): boolean {
  return (
    query.trim().length > 0 &&
    schemas.some((schema) => matchesQuery(schema.name, query))
  );
}

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

function ObjectTreeList({
  activeSchema,
  categoryPagination,
  expandedCategories,
  itemsByCategory,
  onLoadMoreCategory,
  onLoadMoreSchemas,
  onResourceIntent,
  onSelectResource,
  onSelectSchema,
  query,
  resourcesLoading,
  schemas,
  selection,
  setExpandedCategories,
}: {
  activeSchema: SchemaSummary | null;
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  expandedCategories: Set<CategoryKey>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
  onLoadMoreCategory: (category: CategoryKey) => void;
  onLoadMoreSchemas: () => void;
  onResourceIntent?:
    | ((category: CategoryKey, name: string) => void)
    | undefined;
  onSelectResource: (category: CategoryKey, name: string) => void;
  onSelectSchema: (schema: SchemaSummary) => void;
  query: string;
  resourcesLoading: boolean;
  schemas: SchemaSummary[];
  selection: Selection;
  setExpandedCategories: (
    update: (prev: Set<CategoryKey>) => Set<CategoryKey>
  ) => void;
}) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null
  );
  // Accordion: the active schema is the only one with loaded objects, and it
  // can be collapsed without switching schemas.
  const [collapsedSchemaId, setCollapsedSchemaId] = useState<string | null>(
    null
  );
  const activeSchemaId = activeSchema?.id ?? null;
  const isActiveSchemaExpanded =
    activeSchemaId !== null && collapsedSchemaId !== activeSchemaId;
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
  const loadingPhase = useCalmLoadingPhase(resourcesLoading);
  const flatItems = flattenObjectTreeItems({
    activeSchemaId,
    categoryPagination,
    expandedCategories,
    isActiveSchemaExpanded,
    itemsByCategory,
    loadingPhase,
    query,
    schemas,
  });
  const itemControls: ResourceListItemControls = {
    activeSchemaId,
    isActiveSchemaExpanded,
    isCategoryOpen,
    onLoadMoreCategory,
    onLoadMoreSchemas,
    onResourceIntent,
    onSelectResource,
    onSelectSchema: (schema) => {
      setCollapsedSchemaId(null);
      onSelectSchema(schema);
    },
    onToggleActiveSchema: () => {
      setCollapsedSchemaId(isActiveSchemaExpanded ? activeSchemaId : null);
    },
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
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(
    null
  );
  if (virtualizerRef.current === null) {
    virtualizerRef.current = new Virtualizer<HTMLDivElement, Element>({
      count: items.length,
      estimateSize: (index) => estimateResourceListItemSize(items[index]),
      getScrollElement: () => scrollElement,
      observeElementOffset,
      observeElementRect: observeResourceListRect,
      scrollToFn: elementScroll,
    });
  }
  const virtualizer = virtualizerRef.current;
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

function flattenActiveSchemaItems({
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

function expandedSchemaChildren({
  categoryPagination,
  expandedCategories,
  itemsByCategory,
  loadingPhase,
  query,
  schemaId,
}: {
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  expandedCategories: Set<CategoryKey>;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
  loadingPhase: LoadingPhase;
  query: string;
  schemaId: string;
}): VirtualResourceListItem[] {
  if (loadingPhase === "pending") {
    // Loading but within the skeleton delay: keep the area empty so a fast
    // response swaps straight to content without an intermediate flash.
    return [];
  }
  if (loadingPhase === "skeleton") {
    return [{ key: `schema:${schemaId}:loading`, kind: "loading" }];
  }
  const children = itemsByCategory
    ? flattenActiveSchemaItems({
        categoryPagination,
        expandedCategories,
        itemsByCategory,
      })
    : [];
  if (children.length === 0 && query.trim().length === 0) {
    return [{ key: `schema:${schemaId}:empty`, kind: "empty" }];
  }
  return children;
}

function flattenObjectTreeItems({
  activeSchemaId,
  categoryPagination,
  expandedCategories,
  isActiveSchemaExpanded,
  itemsByCategory,
  loadingPhase,
  query,
  schemas,
}: {
  activeSchemaId: string | null;
  categoryPagination: Record<CategoryKey | "schemas", CategoryPaginationState>;
  expandedCategories: Set<CategoryKey>;
  isActiveSchemaExpanded: boolean;
  itemsByCategory: Record<CategoryKey, ResourceItem[]> | null;
  loadingPhase: LoadingPhase;
  query: string;
  schemas: SchemaSummary[];
}): VirtualResourceListItem[] {
  const flatItems: VirtualResourceListItem[] = [];
  for (const schema of schemas) {
    const isActive = schema.id === activeSchemaId;
    // The filter always keeps the active schema visible: its objects are
    // filtered server-side, so hiding the node would orphan the matches.
    if (!(isActive || matchesQuery(schema.name, query))) {
      continue;
    }
    flatItems.push({ key: `schema:${schema.id}`, kind: "schema", schema });
    if (isActive && isActiveSchemaExpanded) {
      flatItems.push(
        ...expandedSchemaChildren({
          categoryPagination,
          expandedCategories,
          itemsByCategory,
          loadingPhase,
          query,
          schemaId: schema.id,
        })
      );
    }
  }
  const schemasPagination = categoryPagination.schemas;
  if (schemasPagination.hasNextPage || schemasPagination.isFetchingNextPage) {
    flatItems.push({
      hasNextPage: schemasPagination.hasNextPage,
      isFetchingNextPage: schemasPagination.isFetchingNextPage,
      key: "schemas:sentinel",
      kind: "schemas-sentinel",
    });
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
    case "schemas-sentinel":
      return RESOURCE_LIST_SENTINEL_ITEM_SIZE;
    case "schema":
      return RESOURCE_LIST_SCHEMA_ITEM_SIZE;
    case "loading":
      return RESOURCE_LIST_LOADING_ITEM_SIZE;
    case "empty":
      return RESOURCE_LIST_EMPTY_ITEM_SIZE;
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

/**
 * Indent guide for rows nested under a schema node, mirroring the design's
 * tree-sub style: rows sit flush vertically, so the per-row left border
 * reads as one continuous guide line.
 */
function NestedTreeRow({
  children,
  indented,
}: {
  children: ReactNode;
  indented?: boolean;
}) {
  return (
    <div
      className={cn(
        "ml-4 h-full border-border border-l",
        // Resource rows sit one level deeper than their Kind header so the
        // tree reads as objects nested under the group, not siblings of it.
        indented ? "pl-5" : "pl-1"
      )}
    >
      {children}
    </div>
  );
}

function SchemaTreeButton({
  controls,
  schema,
}: {
  controls: ResourceListItemControls;
  schema: SchemaSummary;
}) {
  const isActive = controls.activeSchemaId === schema.id;
  const isExpanded = isActive && controls.isActiveSchemaExpanded;
  return (
    <Button
      aria-expanded={isExpanded}
      className={cn(
        "h-7 w-full justify-start gap-2 px-2 py-0 font-normal",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() =>
        isActive
          ? controls.onToggleActiveSchema()
          : controls.onSelectSchema(schema)
      }
      title={schema.name}
      variant="ghost"
    >
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          isExpanded && "rotate-90"
        )}
      />
      <Folder
        className={cn(
          "size-4 shrink-0",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">
        {highlightMatch(schema.name, controls.query)}
      </span>
    </Button>
  );
}

const SCHEMA_SKELETON_ROWS = [
  { id: "first", width: "w-2/3" },
  { id: "second", width: "w-1/2" },
  { id: "third", width: "w-3/5" },
  { id: "fourth", width: "w-2/5" },
  { id: "fifth", width: "w-1/2" },
];

/**
 * Placeholder rows shaped like schema tree buttons (chevron + folder + label),
 * shown while the first schema page loads on a cold cache. Keeping the rail's
 * shape stable avoids the "text → whole tree pops in" flash on entry.
 */
function SchemaLoadingRows() {
  return (
    <div
      className="fade-in animate-in space-y-1 py-1 duration-200"
      data-testid="schema-list-loading"
      role="status"
    >
      {SCHEMA_SKELETON_ROWS.map((row) => (
        <div className="flex h-7 items-center gap-2 px-2" key={row.id}>
          <Skeleton className="size-3.5 shrink-0" />
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className={cn("h-3.5", row.width)} />
        </div>
      ))}
      <span className="sr-only">Loading schemas</span>
    </div>
  );
}

function NestedLoadingRows() {
  // Appearance pacing (delay + minimum visible time) lives in
  // useCalmLoadingPhase; this only softens the skeleton's entrance.
  return (
    <div
      className="fade-in animate-in space-y-1 py-1 duration-200"
      data-testid="resource-list-loading"
    >
      {["first", "second", "third"].map((rowId) => (
        <div className="flex h-[26px] items-center gap-2 px-3" key={rowId}>
          <Skeleton className="size-4 shrink-0" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

function ResourceListItem({
  controls,
  item,
}: {
  controls: ResourceListItemControls;
  item: VirtualResourceListItem;
}) {
  switch (item.kind) {
    case "schema":
      return <SchemaTreeButton controls={controls} schema={item.schema} />;
    case "schemas-sentinel":
      return (
        <CategoryInfiniteScrollSentinel
          hasNextPage={item.hasNextPage}
          isFetchingNextPage={item.isFetchingNextPage}
          onLoadMore={controls.onLoadMoreSchemas}
          scrollRoot={controls.scrollRoot}
        />
      );
    case "loading":
      return (
        <NestedTreeRow>
          <NestedLoadingRows />
        </NestedTreeRow>
      );
    case "empty":
      return (
        <NestedTreeRow>
          <p className="px-3 py-1 text-muted-foreground text-xs">No objects</p>
        </NestedTreeRow>
      );
    default:
      return (
        <NestedTreeRow indented={item.kind !== "category"}>
          <CategoryListItem controls={controls} item={item} />
        </NestedTreeRow>
      );
  }
}

function CategoryListItem({
  controls,
  item,
}: {
  controls: ResourceListItemControls;
  item: Extract<
    VirtualResourceListItem,
    { kind: "category" | "resource" | "sentinel" }
  >;
}) {
  const meta = CATEGORY_META[item.category];
  switch (item.kind) {
    case "category": {
      const isOpen = controls.isCategoryOpen(item.category);
      return (
        <Button
          aria-expanded={isOpen}
          // Kind headers are labels, not rows: hover brightens the text only
          // (per the concept design), so they read differently from the
          // background-highlighted object rows around them.
          className="h-6 w-full justify-start gap-2 px-2 py-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:text-foreground dark:hover:bg-transparent"
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

  if (schemasLoading) {
    return <SchemaLoadingRows />;
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
  const hasSchemaNameMatch = anySchemaNameMatches(schemas, query);
  const showSearchEmptyState =
    shouldShowSearchEmptyState({
      activeSchema,
      hasResourceLoadError,
      hasResourceLoading,
      hasVisibleResource,
      itemsByCategory,
      query,
    }) && !hasSchemaNameMatch;
  const showObjectTree = schemas.length > 0 && !showSearchEmptyState;
  // Object browser thresholds shed chrome in stages: below 18rem stacks search
  // controls, below 15rem hides row sizes, below 14rem hides icons and tightens
  // spacing.
  return (
    <aside
      aria-label="Database objects"
      className="@container/object-browser flex h-full min-h-0 w-full flex-1 flex-col"
    >
      <div className="flex flex-col gap-1.5 @max-[14rem]/object-browser:px-2 px-2 pt-2 pb-1.5">
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
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pr-7 pl-8 text-[13px]"
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

      <div className="flex min-h-0 flex-1 flex-col p-1.5">
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

        {showObjectTree ? (
          <ObjectTreeList
            activeSchema={activeSchema}
            categoryPagination={categoryPagination}
            expandedCategories={expandedCategories}
            itemsByCategory={itemsByCategory}
            onLoadMoreCategory={onLoadMoreCategory}
            onLoadMoreSchemas={onLoadMoreSchemas}
            onResourceIntent={onResourceIntent}
            onSelectResource={onSelectResource}
            onSelectSchema={onSelectSchema}
            query={query}
            resourcesLoading={hasResourceLoading && !hasVisibleResource}
            schemas={schemas}
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
