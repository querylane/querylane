import { useEffect } from "react";
import type { SortColumn } from "react-data-grid";
import {
  buildRowFilter,
  type FilterColumnMeta,
  filterStateForColumnNames,
  getInvalidFilterRules,
  parseTableFilterSearchResult,
  serializeTableFilterSearch,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import { useTableDataController } from "@/features/data-explorer/table-data/use-table-data-controller";
import { useListTableColumnsQuery } from "@/hooks/api/table";
import { useReadRowsQuery } from "@/hooks/api/table-data";
import { QUERY_STALE_TIME } from "@/lib/query-policy";

interface TableDataSearchState {
  filterSearch?: string | undefined;
  sortSearch?: string | undefined;
}

interface UseTableDataQueryArgs extends TableDataSearchState {
  name: string;
  onFilterSearchChange: (next: string | undefined) => void;
  onPageSizeChange: (next: number) => void;
  onSortSearchChange: (next: string | undefined) => void;
  pageSize: number;
}

const SORT_COLUMN_KEY_QUERY_META_PATTERN = /[&=+]/g;
const HEX_RADIX = 16;
const FILTER_SEARCH_ERROR_ID = "filter-search";

function encodeQueryMetaCharacter(value: string): string {
  return `%${value.charCodeAt(0).toString(HEX_RADIX).toUpperCase()}`;
}

function decodeSortColumnKey(value: string): string {
  const querySafeValue = value.replace(
    SORT_COLUMN_KEY_QUERY_META_PATTERN,
    encodeQueryMetaCharacter
  );
  return new URLSearchParams(`column=${querySafeValue}`).get("column") ?? "";
}

function hasInvalidSortSeparator(separator: number, valueLength: number) {
  return separator <= 0 || separator === valueLength - 1;
}

function parseSortSearch(value: string | undefined): SortColumn[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  const parsed: SortColumn[] = [];

  for (const part of value.split(",")) {
    const raw = part.trim();
    if (!raw) {
      continue;
    }

    const separator = raw.lastIndexOf(":");
    if (hasInvalidSortSeparator(separator, raw.length)) {
      continue;
    }

    const columnKey = decodeSortColumnKey(raw.slice(0, separator).trim());
    const direction = raw
      .slice(separator + 1)
      .trim()
      .toUpperCase();
    if (
      !columnKey ||
      seen.has(columnKey) ||
      (direction !== "ASC" && direction !== "DESC")
    ) {
      continue;
    }

    seen.add(columnKey);
    parsed.push({ columnKey, direction });
  }

  return parsed;
}

function serializeSortSearch(
  sortColumns: readonly SortColumn[]
): string | undefined {
  if (sortColumns.length === 0) {
    return;
  }

  const parts = sortColumns.map(
    (sort) =>
      `${encodeURIComponent(sort.columnKey)}:${sort.direction.toLowerCase()}`
  );
  return parts.length > 0 ? parts.join(",") : undefined;
}

function filterSortColumnsForNames(
  sortColumns: readonly SortColumn[],
  columnNames: readonly string[]
): SortColumn[] {
  const allowed = new Set(columnNames);
  return sortColumns.filter((sort) => allowed.has(sort.columnKey));
}

function resolveTableDataQueryState({
  columnCatalog,
  filterSearch,
  sortSearch,
}: {
  columnCatalog?: FilterColumnMeta[] | undefined;
  filterSearch?: string | undefined;
  sortSearch?: string | undefined;
}): {
  filterColumns: FilterColumnMeta[];
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  invalidFilterRules: Array<{ id: string; message: string }>;
  normalizedFilterSearch?: string | undefined;
  normalizedSortSearch?: string | undefined;
  shouldLoadColumnCatalog: boolean;
  sortColumns: SortColumn[];
} {
  const parsedSortColumns = parseSortSearch(sortSearch);
  const parsedFilterSearch = parseTableFilterSearchResult(filterSearch);
  const parsedFilterState = parsedFilterSearch.state;
  const shouldLoadColumnCatalog =
    parsedSortColumns.length > 0 ||
    (parsedFilterSearch.ok && parsedFilterState.rules.length > 0);
  const columnNames = columnCatalog?.map((column) => column.columnName);
  const sortColumns = columnNames
    ? filterSortColumnsForNames(parsedSortColumns, columnNames)
    : [];
  const invalidFilterRules = [
    ...(parsedFilterSearch.ok
      ? []
      : [
          {
            id: FILTER_SEARCH_ERROR_ID,
            message: parsedFilterSearch.error,
          },
        ]),
    ...(columnCatalog
      ? getInvalidFilterRules(parsedFilterState.rules, columnCatalog)
      : []),
  ];

  const filterState =
    invalidFilterRules.length === 0 &&
    parsedFilterState.rules.length > 0 &&
    columnNames
      ? filterStateForColumnNames(parsedFilterState, columnNames)
      : parsedFilterState;

  return {
    filterColumns: columnCatalog ?? [],
    filterLogic: filterState.logic,
    filterRules: filterState.rules,
    invalidFilterRules,
    normalizedFilterSearch:
      invalidFilterRules.length > 0
        ? filterSearch
        : serializeTableFilterSearch(filterState),
    normalizedSortSearch: serializeSortSearch(sortColumns),
    shouldLoadColumnCatalog,
    sortColumns,
  };
}

function useTableDataQuery({
  filterSearch,
  name,
  onFilterSearchChange,
  onPageSizeChange,
  onSortSearchChange,
  pageSize,
  sortSearch,
}: UseTableDataQueryArgs) {
  const parsed = resolveTableDataQueryState({ filterSearch, sortSearch });
  const columnCatalog = useListTableColumnsQuery(
    { parent: name },
    {
      enabled: parsed.shouldLoadColumnCatalog,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: QUERY_STALE_TIME.static,
    }
  );
  const queryState = resolveTableDataQueryState({
    columnCatalog: columnCatalog.data?.columns.map((column) => ({
      columnName: column.columnName,
      dataType: column.dataType,
    })),
    filterSearch,
    sortSearch,
  });
  const filter = buildRowFilter(
    queryState.filterRules,
    queryState.filterColumns,
    queryState.filterLogic
  );
  const controller = useTableDataController({
    filter,
    name,
    onPageSizeChange,
    onSortColumnsChange: (next) =>
      onSortSearchChange(serializeSortSearch(next)),
    pageSize,
    sortColumns: queryState.sortColumns,
  });
  const rowsQuery = useReadRowsQuery(controller.request, {
    enabled:
      !(
        (queryState.shouldLoadColumnCatalog &&
          columnCatalog.data === undefined &&
          !columnCatalog.isError) ||
        columnCatalog.error
      ) && queryState.invalidFilterRules.length === 0,
    // Keep the previous page rendered (dimmed, with a refreshing pill) while
    // a page/sort/filter change loads, instead of blanking to a skeleton.
    keepPreviousData: true,
  });

  useEffect(
    function normalizeSortSearch() {
      if (
        (queryState.shouldLoadColumnCatalog && !columnCatalog.data) ||
        queryState.normalizedSortSearch === sortSearch
      ) {
        return;
      }
      onSortSearchChange(queryState.normalizedSortSearch);
    },
    [
      columnCatalog.data,
      onSortSearchChange,
      queryState.normalizedSortSearch,
      queryState.shouldLoadColumnCatalog,
      sortSearch,
    ]
  );

  useEffect(
    function normalizeFilterSearch() {
      if (
        (queryState.shouldLoadColumnCatalog && !columnCatalog.data) ||
        queryState.normalizedFilterSearch === filterSearch
      ) {
        return;
      }
      onFilterSearchChange(queryState.normalizedFilterSearch);
    },
    [
      columnCatalog.data,
      filterSearch,
      onFilterSearchChange,
      queryState.normalizedFilterSearch,
      queryState.shouldLoadColumnCatalog,
    ]
  );

  const refetch = () => {
    if (columnCatalog.error) {
      return columnCatalog.refetch();
    }

    return rowsQuery.refetch();
  };

  return {
    controller,
    error: columnCatalog.error ?? null,
    filterLogic: queryState.filterLogic,
    filterRules: queryState.filterRules,
    invalidFilterRules: queryState.invalidFilterRules,
    isLoading:
      queryState.shouldLoadColumnCatalog &&
      columnCatalog.data === undefined &&
      !columnCatalog.isError,
    refetch,
    rowsQuery,
  };
}

export type { TableDataSearchState };
export {
  parseSortSearch,
  resolveTableDataQueryState,
  serializeSortSearch,
  useTableDataQuery,
};
