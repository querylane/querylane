import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  columnFilteringFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  functionalUpdate,
  metaHelper,
  type PaginationState,
  type ReactTable,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useEffect, useEffectEvent, useId, useRef } from "react";
import {
  type ListColumnOption,
  useListColumnSelection,
  useListSorting,
} from "@/lib/list-columns";
import { compareListCellValues } from "@/lib/list-layout";
import type { PageSize } from "@/lib/pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

interface DataTableColumnMeta {
  cellClassName?: string;
  headerClassName?: string;
  label?: string;
}

const dataTableFeatures = tableFeatures({
  columnOrderingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    text: sortFn_text,
  },
});

type DataTableFeatures = typeof dataTableFeatures;
type DataTableColumnDef<RowValue extends RowData> = ColumnDef<
  DataTableFeatures,
  RowValue
>;

interface DataTableState {
  columnFilters: ColumnFiltersState;
  columnOrder: string[];
  columnVisibility: ColumnVisibilityState;
  pagination: PaginationState;
  sorting: SortingState;
}

type DataTableRowProps = Pick<
  React.HTMLAttributes<HTMLTableRowElement>,
  "onClick" | "onFocus" | "onMouseEnter"
>;

interface DataTableProps<RowValue extends RowData> {
  /** Externally owned selection; its picker lives in the caller toolbar. */
  columnSelection?: ReturnType<typeof useListColumnSelection>;
  columns: DataTableColumnDef<RowValue>[];
  data: RowValue[];
  density?: "metadata";
  distinguishEmpty?: boolean;
  emptyResourceName?: string;
  filterColumn?: string;
  filterPlaceholder?: string;
  filterValue?: string;
  getRowProps?: (row: RowValue) => DataTableRowProps;
  hasActiveFilters?: boolean;
  initialSorting?: SortingState;
  /**
   * When set, renders a refresh button + last-fetched label on the right of the
   * toolbar. The quicksearch (if `filterColumn` is set) moves to the left to
   * balance the row, matching the data grid toolbar.
   */
  isPending?: boolean;
  isRefreshing?: boolean;
  lastFetchedLabel?: string;
  onFilterChange?: (value: string) => void;
  onRefresh?: () => Promise<unknown> | undefined;
  onRowClick?: (row: RowValue) => void;
  onSortingChange?: (sorting: SortingState) => void;
  pageSize?: PageSize | undefined;
  pendingMessage?: string;
  renderToolbarFilters?: (() => React.ReactNode) | undefined;
  sorting?: SortingState;
  tableClassName?: string | undefined;
  tableKey?: string;
  toolbarFilters?: React.ReactNode;
}

type DataTableInstance<RowValue extends RowData> = ReactTable<
  DataTableFeatures,
  RowValue,
  DataTableState
>;

const CAMEL_CASE_BOUNDARY = /(?<lower>[a-z])(?<upper>[A-Z])/gu;
const FIRST_CHARACTER = /^./u;
function columnId<RowValue extends RowData>(
  column: DataTableColumnDef<RowValue>
) {
  if (column.id !== undefined) {
    return column.id;
  }
  if ("accessorKey" in column) {
    return String(column.accessorKey).replaceAll(".", "_");
  }
  return typeof column.header === "string" ? column.header : undefined;
}
function columnLabel<RowValue extends RowData>(
  column: DataTableColumnDef<RowValue>,
  id: string
) {
  if (column.meta?.label !== undefined) {
    return column.meta.label;
  }
  if (typeof column.header === "string") {
    return column.header;
  }
  return id
    .replaceAll(CAMEL_CASE_BOUNDARY, "$<lower> $<upper>")
    .replaceAll("_", " ")
    .replace(FIRST_CHARACTER, (letter) => letter.toUpperCase());
}
function listColumnDefinitions<RowValue extends RowData>(
  columns: readonly DataTableColumnDef<RowValue>[]
): ListColumnOption[] {
  return columns.flatMap((column) => {
    if ("columns" in column) {
      return listColumnDefinitions(column.columns);
    }
    const id = columnId(column);
    return id === undefined
      ? []
      : [
          {
            id,
            required: column.enableHiding === false,
            sortable:
              column.enableSorting !== false &&
              ("accessorKey" in column || "accessorFn" in column),
            label: columnLabel(column, id),
          },
        ];
  });
}

function useDataTableModel<RowValue extends RowData>({
  columns,
  columnSelection: providedColumnSelection,
  data,
  filterColumn,
  filterValue,
  onFilterChange,
  sorting: providedSorting,
  onSortingChange,
  initialSorting,
  pageSize = DEFAULT_PAGE_SIZE,
  tableKey,
}: DataTableProps<RowValue>) {
  const fallbackTableId = useId();
  const isControlled =
    filterColumn !== undefined && onFilterChange !== undefined;
  const controlledFilterValue = isControlled ? (filterValue ?? "") : undefined;

  const definitions = listColumnDefinitions(columns);
  const fallbackColumnSelection = useListColumnSelection(tableKey, definitions);
  const columnSelection = providedColumnSelection ?? fallbackColumnSelection;
  const { visibleIds, columnOrder } = columnSelection;
  const fallbackSorting = useListSorting(
    tableKey,
    definitions.flatMap((column) =>
      column.sortable === true ? [column.id] : []
    ),
    initialSorting
  );
  const sorting = providedSorting ?? fallbackSorting.sorting;
  const visible = new Set(visibleIds);
  const columnVisibility = Object.fromEntries(
    definitions.map((column) => [column.id, visible.has(column.id)])
  );
  const table = useTable<DataTableFeatures, RowValue, DataTableState>(
    {
      features: dataTableFeatures,
      key: tableKey ?? `querylane-data-table-${fallbackTableId}`,
      columns,
      data,
      defaultColumn: {
        sortUndefined: "last",
        sortFn: (left, right, id) =>
          compareListCellValues(left.getValue(id), right.getValue(id)),
      },
      enableSortingRemoval: true,
      autoResetPageIndex: false,
      state: { columnVisibility, columnOrder, sorting },
      onColumnOrderChange: (updater) => {
        columnSelection.setColumnOrder(functionalUpdate(updater, columnOrder));
      },
      onSortingChange: (updater) => {
        const next = functionalUpdate(updater, sorting);
        if (providedSorting === undefined) {
          fallbackSorting.setSorting(next);
        } else {
          onSortingChange?.(next);
        }
      },
      initialState: {
        pagination: { pageIndex: 0, pageSize },
        sorting: initialSorting ?? [],
      },
      // Override TanStack's desc-first default for numeric columns so every
      // column's first click sorts ascending (cycle: asc → desc → unsorted).
      sortDescFirst: false,
    },
    (state) => ({
      columnOrder: state.columnOrder,
      columnFilters: state.columnFilters,
      columnVisibility: state.columnVisibility,
      pagination: state.pagination,
      sorting: state.sorting,
    })
  );
  const sortingKey = JSON.stringify(sorting);
  const filterKey = JSON.stringify(table.state.columnFilters);
  const resetPage = useEffectEvent(() => {
    table.setPageIndex(0);
  });
  const previousPageInputsRef = useRef({ data, sortingKey, filterKey });
  useEffect(
    function resetPageAfterSortOrFilterChange() {
      const previous = previousPageInputsRef.current;
      previousPageInputsRef.current = { data, sortingKey, filterKey };
      if (
        previous.data !== data ||
        previous.sortingKey !== sortingKey ||
        previous.filterKey !== filterKey
      ) {
        resetPage();
      }
    },
    [data, sortingKey, filterKey]
  );
  useEffect(
    function syncControlledFilterValue() {
      if (!isControlled || filterColumn === undefined) {
        return;
      }

      const column = table.getColumn(filterColumn);
      const currentFilterValue = column?.getFilterValue();

      const nextFilterValue =
        controlledFilterValue === "" ? undefined : controlledFilterValue;
      if (currentFilterValue !== nextFilterValue) {
        column?.setFilterValue(nextFilterValue);
      }
    },
    [isControlled, controlledFilterValue, filterColumn, table]
  );

  const pageCount = Math.max(1, table.getPageCount());
  const { pageIndex } = table.state.pagination;
  useEffect(
    function clampPageToShrunkData() {
      if (pageIndex > 0 && pageIndex >= pageCount) {
        table.setPageIndex(pageCount - 1);
      }
    },
    [pageIndex, pageCount, table]
  );

  return { table, definitions, columnSelection };
}

export type {
  DataTableColumnDef,
  DataTableFeatures,
  DataTableInstance,
  DataTableProps,
  DataTableRowProps,
  DataTableState,
};
export { dataTableFeatures, listColumnDefinitions, useDataTableModel };
