import type { Transport } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buildNameContainsFilter } from "@/features/data-explorer/data-explorer-catalog-filter";
import {
  itemsByCategory,
  useExplorerResourceState,
  useExplorerSchemaState,
  useSchemaOverviewState,
  viewListItems,
} from "@/features/data-explorer/data-explorer-catalog-queries";
import { useDebouncedValue } from "@/features/data-explorer/data-explorer-filter-url-state";
import type { SchemaSummary } from "@/features/data-explorer/data-explorer-model";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import { selectedResourceQueryError } from "@/features/data-explorer/data-explorer-selected-resource";
import { DEFAULT_TABLE_LIST_SORT } from "@/features/data-explorer/data-explorer-table-list-sort";
import type { CategoryKey } from "@/features/data-explorer/data-explorer-types";
import {
  buildExplorerSearch,
  catalogSyncNotice,
  selectionFromSearch,
} from "@/features/data-explorer/use-data-explorer-state";
import {
  assertNoUnhandledTableDetailQueries,
  tableDetailQueryOptions,
} from "@/hooks/api/table";
import { parseResourceLeafId } from "@/lib/console-resources";
import { useDb } from "@/lib/db-context";
import { handleNavigationResult } from "@/lib/navigation-errors";
import { handleQueryActionError } from "@/lib/query-action-errors";
import { createResourceLoader } from "@/lib/resource-loader";
import { prefetchRouteQueryOnIntent } from "@/lib/route-prefetch";

const EXPLORER_SEARCH_DEBOUNCE_MS = 200;

function useDataExplorerPageController({
  databaseId,
  instanceId,
  search,
}: {
  databaseId: string;
  instanceId: string;
  search: DataExplorerSearch;
}) {
  const navigate = useNavigate({
    from: "/instances/$instanceId/databases/$databaseId/explorer",
  });
  const queryClient = useQueryClient();
  const transport = useTransport();
  const { selectedDatabase } = useDb();
  const [query, setQuery] = useState(() => search.q ?? "");
  const debouncedQuery = useDebouncedValue(query, EXPLORER_SEARCH_DEBOUNCE_MS);
  const [expandedCategories, setExpandedCategories] = useState<
    Set<CategoryKey>
  >(() => new Set<CategoryKey>(["tables", "views"]));

  const { activeSchema, schemas, schemasQuery, selectedSchemaError } =
    useExplorerSchemaState({ databaseId, instanceId, search });

  const selection = selectionFromSearch(search);
  const listFilter = buildNameContainsFilter(debouncedQuery);
  const resourceState = useExplorerResourceState({
    activeSchema,
    databaseId,
    debouncedQuery,
    instanceId,
    listFilter,
    selection,
    tableListSort: DEFAULT_TABLE_LIST_SORT,
  });
  const overviewState = useSchemaOverviewState({
    activeSchema,
    databaseId,
    instanceId,
    selection,
  });
  const {
    rawTables,
    rawViews,
    selectedTableQuery,
    selectedViewQuery,
    tables,
    tablesQuery,
    views,
    viewsQuery,
  } = resourceState;
  const updateSearch = (
    patch: ExplorerSearchPatch,
    options?: { replace?: boolean }
  ) => {
    handleNavigationResult(
      navigate({
        params: { databaseId, instanceId },
        // Filter and sort tweaks replace the current entry so Back leaves the
        // table instead of stepping through every keystroke's search state.
        replace: options?.replace === true,
        search: (previous) => buildExplorerSearch(previous, patch),
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      }),
      { area: "data-explorer.search" }
    );
  };

  useEffect(
    function syncSidebarSearchFromUrl() {
      setQuery(search.q ?? "");
    },
    [search.q]
  );

  useEffect(
    function flushSidebarSearchToUrl() {
      const nextQuery = debouncedQuery.trim() ? debouncedQuery : undefined;
      if (nextQuery === search.q) {
        return;
      }
      handleNavigationResult(
        navigate({
          params: { databaseId, instanceId },
          replace: true,
          search: (previous) =>
            buildExplorerSearch(previous, {
              q: nextQuery,
            }),
          to: "/instances/$instanceId/databases/$databaseId/explorer",
        }),
        { area: "data-explorer.sidebar-search" }
      );
    },
    [databaseId, debouncedQuery, instanceId, navigate, search.q]
  );

  const onResourceIntent = (category: CategoryKey, name: string) => {
    if (!(activeSchema && category === "tables")) {
      return;
    }
    prefetchTableDetails({
      activeSchema,
      databaseId,
      instanceId,
      name,
      queryClient,
      rawTables,
      transport,
    });
  };
  const onRetryTables = () =>
    tablesQuery.refetch().catch((error: unknown) => {
      handleQueryActionError(error, {
        action: "retry",
        area: "data-explorer.tables",
      });
    });
  const onRetryViews = () =>
    viewsQuery.refetch().catch((error: unknown) => {
      handleQueryActionError(error, {
        action: "retry",
        area: "data-explorer.views",
      });
    });

  return {
    activeSchema,
    databaseId,
    databaseLabel: selectedDatabase?.name ?? databaseId,
    expandedCategories,
    instanceId,
    itemsByCategory: itemsByCategory(activeSchema, tables, views),
    onLoadMoreCategory: (category: CategoryKey) => {
      if (category === "tables") {
        return tablesQuery.fetchNextPage().catch((error: unknown) => {
          handleQueryActionError(error, {
            action: "load-more",
            area: "data-explorer.tables",
          });
        });
      }
      return viewsQuery.fetchNextPage().catch((error: unknown) => {
        handleQueryActionError(error, {
          action: "load-more",
          area: "data-explorer.views",
        });
      });
    },
    onLoadMoreSchemas: () =>
      schemasQuery.fetchNextPage().catch((error: unknown) => {
        handleQueryActionError(error, {
          action: "load-more",
          area: "data-explorer.schemas",
        });
      }),
    onResourceIntent,
    onRetryTables,
    onRetryViews,
    onSelectResource: (category: CategoryKey, name: string) => {
      updateSearch({
        category,
        name,
        schema: activeSchema?.name,
      });
    },
    onSelectSchema: (schema: SchemaSummary) => {
      updateSearch({
        category: undefined,
        name: undefined,
        schema: schema.name,
      });
    },
    onSelectSchemaOverview: () => {
      updateSearch({
        category: undefined,
        name: undefined,
        schema: activeSchema?.name,
      });
    },
    query,
    rawTables,
    rawViews,
    schemaOverview: {
      hasMoreTables: Boolean(overviewState.tablesQuery.hasNextPage),
      hasMoreViews: Boolean(overviewState.viewsQuery.hasNextPage),
      rawTables: overviewState.rawTables,
      rawViews: overviewState.rawViews,
      tables: overviewState.tables,
      tablesError: overviewState.tablesQuery.error,
      tablesLoading: overviewState.tablesQuery.isLoading,
      tablesSyncNotice: catalogSyncNotice(
        overviewState.tablesQuery.data?.pages.at(-1)?.syncMetadata
      ),
      views: viewListItems(overviewState.views),
      viewsError: overviewState.viewsQuery.error,
      viewsLoading: overviewState.viewsQuery.isLoading,
    },
    schemaPageStateProps: {
      ...createResourceLoader(schemasQuery, "data-explorer.schemas")
        .pageStateProps,
      hasData:
        createResourceLoader(schemasQuery, "data-explorer.schemas")
          .pageStateProps.hasData && !schemasQuery.error,
    },
    schemaSelectionError: selectedSchemaError,
    schemas,
    schemasPagination: {
      hasNextPage: Boolean(schemasQuery.hasNextPage),
      isFetchingNextPage: schemasQuery.isFetchingNextPage,
    },
    schemasSyncNotice: catalogSyncNotice(
      schemasQuery.data?.pages.at(-1)?.syncMetadata
    ),
    selectedResourceError:
      selectedSchemaError ??
      selectedResourceQueryError({
        selectedTableError: selectedTableQuery.error,
        selectedViewError: selectedViewQuery.error,
        selection,
      }),
    selection,
    setExpandedCategories,
    setQuery,
    tablesError: tablesQuery.error,
    tablesPagination: {
      hasNextPage: Boolean(tablesQuery.hasNextPage),
      isFetchingNextPage: tablesQuery.isFetchingNextPage,
      isLoading: tablesQuery.isLoading,
    },
    tablesSyncNotice: catalogSyncNotice(
      tablesQuery.data?.pages.at(-1)?.syncMetadata
    ),
    viewsError: viewsQuery.error,
    viewsPagination: {
      hasNextPage: Boolean(viewsQuery.hasNextPage),
      isFetchingNextPage: viewsQuery.isFetchingNextPage,
      isLoading: viewsQuery.isLoading,
    },
  };
}

interface ExplorerSearchPatch {
  category?: CategoryKey | undefined;
  name?: string | undefined;
  q?: string | undefined;
  schema?: string | undefined;
}

function prefetchTableDetails({
  activeSchema,
  databaseId,
  instanceId,
  name,
  queryClient,
  rawTables,
  transport,
}: {
  activeSchema: SchemaSummary;
  databaseId: string;
  instanceId: string;
  name: string;
  queryClient: ReturnType<typeof useQueryClient>;
  rawTables: Array<{ displayName: string; name: string }>;
  transport: Transport;
}) {
  const table = rawTables.find((candidate) => {
    const tableId = parseResourceLeafId(candidate.name);
    return candidate.displayName === name || tableId === name;
  });
  const tableId = table ? parseResourceLeafId(table.name) : name;
  const [
    columnsQuery,
    indexesQuery,
    constraintsQuery,
    policiesQuery,
    triggersQuery,
    partitionMetadataQuery,
    ...unhandledQueries
  ] = tableDetailQueryOptions({
    databaseId,
    instanceId,
    schemaId: activeSchema.id,
    tableId,
    transport,
  });
  assertNoUnhandledTableDetailQueries(unhandledQueries);

  prefetchRouteQueryOnIntent(queryClient, columnsQuery);
  prefetchRouteQueryOnIntent(queryClient, indexesQuery);
  prefetchRouteQueryOnIntent(queryClient, constraintsQuery);
  prefetchRouteQueryOnIntent(queryClient, policiesQuery);
  prefetchRouteQueryOnIntent(queryClient, triggersQuery);
  prefetchRouteQueryOnIntent(queryClient, partitionMetadataQuery);
}

export { prefetchTableDetails, useDataExplorerPageController };
