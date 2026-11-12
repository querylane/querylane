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
  metaHelper,
  type PaginationState,
  type RowData,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import type {
  ListColumnOption,
  useListColumnSelection,
} from "@/lib/list-columns";
import type { PageSize } from "@/lib/pagination";

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

type DataTableColumnDef<Row extends RowData> = ColumnDef<
  DataTableFeatures,
  Row
>;

interface DataTableState {
  columnFilters: ColumnFiltersState;
  columnOrder: string[];
  columnVisibility: ColumnVisibilityState;
  pagination: PaginationState;
  sorting: SortingState;
}

interface DataTableFilterProps {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

type DataTableRowProps = Pick<
  React.HTMLAttributes<HTMLTableRowElement>,
  "onClick" | "onFocus" | "onMouseEnter"
>;

interface DataTableProps<Row extends RowData> {
  /** Externally owned selection; its picker is rendered in the caller toolbar. */
  columnSelection?: ReturnType<typeof useListColumnSelection>;
  columns: DataTableColumnDef<Row>[];
  data: Row[];
  emptyResourceName?: string;
  filterColumn?: string;
  filterPlaceholder?: string;
  filterValue?: string;
  getRowProps?: (row: Row) => DataTableRowProps;
  initialSorting?: SortingState;
  /**
   * When set, renders a refresh button + last-fetched label on the right of the
   * toolbar. The quicksearch (if `filterColumn` is set) moves to the left to
   * balance the row, matching the data grid toolbar.
   */
  isRefreshing?: boolean;
  lastFetchedLabel?: string;
  onFilterChange?: (value: string) => void;
  onRefresh?: () => Promise<unknown> | undefined;
  onRowClick?: (row: Row) => void;
  pageSize?: PageSize | undefined;
  renderToolbarFilters?: (() => React.ReactNode) | undefined;
  tableClassName?: string | undefined;
  tableKey?: string;
  toolbarFilters?: React.ReactNode;
}

const WORD_BOUNDARY_PATTERN = /(?<lower>[a-z])(?<upper>[A-Z])/gu;
const FIRST_LETTER_PATTERN = /^./u;

function columnId<Row extends RowData>(column: DataTableColumnDef<Row>) {
  if (column.id !== undefined) {
    return column.id;
  }
  if ("accessorKey" in column) {
    return String(column.accessorKey).replaceAll(".", "_");
  }
  return typeof column.header === "string" ? column.header : undefined;
}

function columnLabel<Row extends RowData>(
  column: DataTableColumnDef<Row>,
  id: string
) {
  if (column.meta?.label !== undefined && column.meta.label !== "") {
    return column.meta.label;
  }
  if (typeof column.header === "string") {
    return column.header;
  }
  return id
    .replaceAll(WORD_BOUNDARY_PATTERN, "$<lower> $<upper>")
    .replaceAll("_", " ")
    .replace(FIRST_LETTER_PATTERN, (letter) => letter.toUpperCase());
}

function listColumnDefinitions<Row extends RowData>(
  columns: readonly DataTableColumnDef<Row>[]
): ListColumnOption[] {
  const definitions: ListColumnOption[] = [];
  for (const column of columns) {
    if ("columns" in column) {
      definitions.push(...listColumnDefinitions(column.columns));
      continue;
    }
    const id = columnId(column);
    if (id === undefined) {
      continue;
    }
    definitions.push({
      id,
      required: column.enableHiding === false,
      sortable:
        column.enableSorting !== false &&
        ("accessorKey" in column || "accessorFn" in column),
      label: columnLabel(column, id),
    });
  }
  return definitions;
}

export {
  type DataTableColumnDef,
  type DataTableColumnMeta,
  type DataTableFeatures,
  type DataTableFilterProps,
  type DataTableProps,
  type DataTableRowProps,
  type DataTableState,
  dataTableFeatures,
  listColumnDefinitions,
};
