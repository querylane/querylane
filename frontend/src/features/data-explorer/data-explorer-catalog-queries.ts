import { Code, ConnectError } from "@connectrpc/connect";
import {
  getItemsForCategory,
  pickDefaultSchema,
  type SchemaSummary,
  type TableSummary,
  type ViewSummary,
} from "@/features/data-explorer/data-explorer-model";
import type { DataExplorerSearch } from "@/features/data-explorer/data-explorer-route-search";
import {
  buildSelectedResourceName,
  injectSelectedResource,
  selectedTableName,
  selectedViewName,
} from "@/features/data-explorer/data-explorer-selected-resource";
import {
  type TableListSort,
  tableListSortToOrderBy,
} from "@/features/data-explorer/data-explorer-table-list-sort";
import {
  CATEGORY_ORDER,
  type CategoryKey,
  type ResourceItem,
} from "@/features/data-explorer/data-explorer-types";
import type { selectionFromSearch } from "@/features/data-explorer/use-data-explorer-state";
import {
  schemasForDatabaseQueryInput,
  useGetSchemaQuery,
  useListSchemasInfiniteQuery,
} from "@/hooks/api/schema";
import {
  tablesForSchemaQueryInput,
  useGetTableQuery,
  useListTablesInfiniteQuery,
} from "@/hooks/api/table";
import {
  useGetViewQuery,
  useListViewsInfiniteQuery,
  viewsForSchemaQueryInput,
} from "@/hooks/api/view";
import { buildSchemaName, parseResourceLeafId } from "@/lib/console-resources";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  View_ViewType,
  ViewView,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

type ExplorerSelection = ReturnType<typeof selectionFromSearch>;

function useExplorerSchemaState({
  databaseId,
  instanceId,
  search,
}: {
  databaseId: string;
  instanceId: string;
  search: DataExplorerSearch;
}) {
  const schemasQuery = useListSchemasInfiniteQuery(
    schemasForDatabaseQueryInput({ databaseId, instanceId }),
    {}
  );
  const schemas = flattenSchemaSummaries(schemasQuery.data?.pages);
  const selectedSchemaName = search.schema
    ? buildSchemaName(instanceId, databaseId, search.schema)
    : undefined;
  const selectedSchemaQuery = useGetSchemaQuery(selectedSchemaName);
  const requestedSchema = schemas.find(
    (schema) => schema.name === search.schema
  );
  const fetchedRequestedSchema = schemaSummaryFromQuery(
    selectedSchemaQuery.data?.schema
  );
  const fallbackSchema = pickDefaultSchema(schemas);
  const requestedSchemaError =
    search.schema && !requestedSchema && selectedSchemaQuery.error
      ? selectedSchemaQuery.error
      : undefined;
  const schemaSearchNeedsReset = Boolean(
    fallbackSchema && isNotFoundError(requestedSchemaError)
  );
  const selectedSchemaError = schemaSearchNeedsReset
    ? undefined
    : requestedSchemaError;

  return {
    activeSchema: resolveActiveSchema({
      fallbackSchema,
      fetchedRequestedSchema,
      hasSchemaSearch: Boolean(search.schema),
      requestedSchema,
      selectedSchemaError,
      selectedSchemaQuery,
    }),
    schemaSearchNeedsReset,
    schemas,
    schemasQuery,
    selectedSchemaError,
  };
}

function useExplorerResourceState({
  activeSchema,
  databaseId,
  debouncedQuery,
  instanceId,
  listFilter,
  selection,
  tableListSort,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  debouncedQuery: string;
  instanceId: string;
  listFilter: string | undefined;
  selection: ExplorerSelection;
  tableListSort: TableListSort;
}) {
  const tablesQuery = useListTablesInfiniteQuery(
    tableListInput({
      activeSchema,
      databaseId,
      filter: listFilter,
      instanceId,
      tableListSort,
    }),
    { enabled: Boolean(activeSchema) }
  );
  const viewsQuery = useListViewsInfiniteQuery(
    viewListInput({ activeSchema, databaseId, filter: listFilter, instanceId }),
    { enabled: Boolean(activeSchema) }
  );
  const selectedResourceName = buildSelectedResourceName({
    activeSchema,
    databaseId,
    instanceId,
    selection,
  });
  const selectedTableQuery = useGetTableQuery(
    selectedTableName(selection, selectedResourceName)
  );
  const selectedViewResourceName = selectedViewName(
    selection,
    selectedResourceName
  );
  const selectedViewListQuery = useGetViewQuery(
    selectedViewResourceName,
    ViewView.BASIC
  );
  const selectedViewQuery = useGetViewQuery(
    selectedViewResourceName,
    ViewView.FULL
  );
  const rawTables = injectSelectedResource(
    tablesQuery.data?.pages.flatMap((page) => page.tables) ?? [],
    selectedTableQuery.data?.table,
    debouncedQuery
  );
  const rawViews = injectSelectedResource(
    viewsQuery.data?.pages.flatMap((page) => page.views) ?? [],
    selectedViewQuery.data?.view ?? selectedViewListQuery.data?.view,
    debouncedQuery
  );

  return {
    rawTables,
    rawViews,
    selectedTableQuery,
    selectedViewQuery,
    tables: tableSummaries(rawTables),
    tablesQuery,
    views: viewSummaries(rawViews),
    viewsQuery,
  };
}

function useSchemaOverviewState({
  activeSchema,
  databaseId,
  instanceId,
  selection,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  instanceId: string;
  selection: ExplorerSelection;
}) {
  // The schema overview must not inherit the sidebar search filter: header
  // counts and sizes describe the schema, not the currently typed filter.
  // Without a filter both hooks share the sidebar query's cache entry. The
  // API exposes no schema-level aggregates, so stats can only cover the
  // loaded pages; hasMoreTables/hasMoreViews flag them as lower bounds.
  const isSchemaOverview = selection.kind === "schema";
  const tablesQuery = useListTablesInfiniteQuery(
    tableListInput({ activeSchema, databaseId, instanceId }),
    { enabled: Boolean(activeSchema) && isSchemaOverview }
  );
  const viewsQuery = useListViewsInfiniteQuery(
    viewListInput({ activeSchema, databaseId, instanceId }),
    { enabled: Boolean(activeSchema) && isSchemaOverview }
  );

  const overviewTables =
    tablesQuery.data?.pages.flatMap((page) => page.tables) ?? [];
  const overviewViews =
    viewsQuery.data?.pages.flatMap((page) => page.views) ?? [];

  return {
    // Raw protos for the schema overview's own inventory/aggregates. These must
    // stay separate from the sidebar's filtered rawTables/rawViews so the
    // overview is not narrowed by the currently typed sidebar query.
    rawTables: overviewTables,
    rawViews: overviewViews,
    tables: tableSummaries(overviewTables),
    tablesQuery,
    views: viewSummaries(overviewViews),
    viewsQuery,
  };
}

function tableListInput({
  activeSchema,
  databaseId,
  filter,
  instanceId,
  tableListSort,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
  tableListSort?: TableListSort | undefined;
}) {
  return activeSchema
    ? tablesForSchemaQueryInput({
        databaseId,
        filter,
        instanceId,
        orderBy: tableListSort
          ? tableListSortToOrderBy(tableListSort)
          : undefined,
        schemaId: activeSchema.id,
      })
    : undefined;
}

function viewListInput({
  activeSchema,
  databaseId,
  filter,
  instanceId,
}: {
  activeSchema: SchemaSummary | null;
  databaseId: string;
  filter?: string | undefined;
  instanceId: string;
}) {
  return activeSchema
    ? viewsForSchemaQueryInput({
        databaseId,
        filter,
        instanceId,
        schemaId: activeSchema.id,
      })
    : undefined;
}

function resolveActiveSchema({
  fallbackSchema,
  fetchedRequestedSchema,
  hasSchemaSearch,
  requestedSchema,
  selectedSchemaError,
  selectedSchemaQuery,
}: {
  fallbackSchema: SchemaSummary | null;
  fetchedRequestedSchema: SchemaSummary | null;
  hasSchemaSearch: boolean;
  requestedSchema: SchemaSummary | undefined;
  selectedSchemaError: unknown;
  selectedSchemaQuery: {
    isFetching: boolean;
    isLoading: boolean;
    error: unknown;
  };
}) {
  const isWaitingForRequestedSchema =
    hasSchemaSearch &&
    !requestedSchema &&
    !fetchedRequestedSchema &&
    !selectedSchemaQuery.error &&
    (selectedSchemaQuery.isLoading || selectedSchemaQuery.isFetching);
  if (selectedSchemaError || isWaitingForRequestedSchema) {
    return null;
  }
  return requestedSchema ?? fetchedRequestedSchema ?? fallbackSchema;
}

function schemaSummaryFromQuery(
  schema: { displayName: string; name: string; owner: string } | undefined
): SchemaSummary | null {
  if (!schema) {
    return null;
  }
  return {
    id: parseResourceLeafId(schema.name),
    name: schema.displayName || parseResourceLeafId(schema.name),
    owner: schema.owner,
  };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof ConnectError && error.code === Code.NotFound;
}

function tableSummaries(
  rawTables: Array<{
    displayName: string;
    name: string;
    rowCount: bigint;
    sizeBytes: bigint;
    tableType?: Table_TableType | undefined;
  }>
): TableSummary[] {
  return rawTables.map((table) => ({
    id: parseResourceLeafId(table.name),
    name: table.displayName || parseResourceLeafId(table.name),
    rowCount: table.rowCount,
    sizeBytes: table.sizeBytes,
    type: table.tableType ?? Table_TableType.UNSPECIFIED,
  }));
}

function viewSummaries(
  rawViews: Array<{
    displayName: string;
    name: string;
    rowCount: bigint;
    sizeBytes: bigint;
    viewType: View_ViewType;
  }>
): ViewSummary[] {
  return rawViews.map((view) => ({
    id: parseResourceLeafId(view.name),
    name: view.displayName || parseResourceLeafId(view.name),
    rowCount: view.rowCount,
    sizeBytes: view.sizeBytes,
    type: view.viewType,
  }));
}

function itemsByCategory(
  activeSchema: SchemaSummary | null,
  tables: TableSummary[],
  views: ViewSummary[]
): Record<CategoryKey, ResourceItem[]> | null {
  if (!activeSchema) {
    return null;
  }
  return CATEGORY_ORDER.reduce<Record<CategoryKey, ResourceItem[]>>(
    (accumulator, category) => {
      accumulator[category] = getItemsForCategory(category, tables, views);
      return accumulator;
    },
    { tables: [], views: [] }
  );
}

function viewListItems(views: ViewSummary[]) {
  return views.map((view) => ({
    name: view.name,
    rowCount: view.rowCount,
    sizeBytes: view.sizeBytes,
    typeLabel: view.type === View_ViewType.MATERIALIZED ? "mat" : "view",
  }));
}

function flattenSchemaSummaries(
  pages:
    | Array<{
        schemas: Array<{ displayName: string; name: string; owner: string }>;
      }>
    | undefined
): SchemaSummary[] {
  if (!pages) {
    return [];
  }
  const schemas: SchemaSummary[] = [];
  for (const page of pages) {
    for (const schema of page.schemas) {
      schemas.push({
        id: parseResourceLeafId(schema.name),
        name: schema.displayName || parseResourceLeafId(schema.name),
        owner: schema.owner,
      });
    }
  }
  return schemas;
}

export {
  itemsByCategory,
  useExplorerResourceState,
  useExplorerSchemaState,
  useSchemaOverviewState,
  viewListItems,
};
