"use client";

import { useEffect, useId } from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowData,
  type SortingState,
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Input } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from "@/lib/pagination";
import { cn } from "@/lib/utils";

interface DataTableColumnMeta {
  cellClassName?: string;
  headerClassName?: string;
}

const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
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
type DataTableColumnDef<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData,
  unknown
>;

interface DataTableState {
  columnFilters: ColumnFiltersState;
  pagination: PaginationState;
  sorting: SortingState;
}

interface DataTableFilterProps {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

function DataTableFilter({
  onChange,
  placeholder = "Filter...",
  value,
}: DataTableFilterProps) {
  return (
    <div className="relative w-52 max-w-full shrink-0">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={placeholder}
        className="h-8 pl-8 text-sm"
        name="table-filter"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

type DataTableRowProps = Pick<
  React.HTMLAttributes<HTMLTableRowElement>,
  "onClick" | "onFocus" | "onMouseEnter"
>;

interface DataTableProps<TData extends RowData> {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  emptyResourceName?: string;
  filterColumn?: string;
  filterPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  getRowProps?: (row: TData) => DataTableRowProps;
  initialSorting?: SortingState;
  /**
   * When set, renders a refresh button + last-fetched label on the right of the
   * toolbar. The quicksearch (if `filterColumn` is set) moves to the left to
   * balance the row, matching the data grid toolbar.
   */
  isRefreshing?: boolean;
  lastFetchedLabel?: string;
  onRefresh?: () => Promise<unknown> | undefined;
  onRowClick?: (row: TData) => void;
  pageSize?: PageSize | undefined;
  renderToolbarFilters?: (() => React.ReactNode) | undefined;
  tableClassName?: string | undefined;
  tableKey?: string;
  toolbarFilters?: React.ReactNode;
}

function SortableHeader<TData extends RowData>({
  children,
  className,
  column,
}: {
  children: React.ReactNode;
  className?: string;
  column: Column<DataTableFeatures, TData, unknown>;
}) {
  const label = typeof children === "string" ? children : "Column";
  const sort = column.table.store.state.sorting.find(
    (sortState) => sortState.id === column.id,
  );
  const sorted = sort == null ? false : sort.desc ? "desc" : "asc";
  const sortStateLabel =
    sorted === "asc"
      ? "sorted ascending"
      : sorted === "desc"
        ? "sorted descending"
        : "not sorted";

  return (
    <button
      aria-label={`${label}, ${sortStateLabel}`}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground",
        className,
      )}
      onClick={() => column.toggleSorting()}
      title="Sort column"
      type="button"
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp
          aria-hidden="true"
          className="size-4 text-foreground"
          data-slot="sort-indicator"
        />
      ) : sorted === "desc" ? (
        <ArrowDown
          aria-hidden="true"
          className="size-4 text-foreground"
          data-slot="sort-indicator"
        />
      ) : (
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 text-muted-foreground/75"
          data-slot="sort-indicator"
        />
      )}
    </button>
  );
}


function DataTable<TData extends RowData>({
  columns,
  data,
  emptyResourceName = "results",
  filterColumn,
  filterPlaceholder = "Filter...",
  filterValue,
  onFilterChange,
  getRowProps,
  initialSorting,
  isRefreshing,
  lastFetchedLabel,
  onRefresh,
  onRowClick,
  pageSize = DEFAULT_PAGE_SIZE,
  renderToolbarFilters,
  tableClassName,
  tableKey,
  toolbarFilters,
}: DataTableProps<TData>) {
  const fallbackTableKey = useId();
  const controlled = filterColumn != null && onFilterChange != null;
  const controlledFilterValue = controlled ? (filterValue ?? "") : undefined;

  const table = useTable<DataTableFeatures, TData, DataTableState>(
    {
      features: dataTableFeatures,
      key: tableKey ?? `querylane-data-table-${fallbackTableKey}`,
      columns,
      data,
      enableSortingRemoval: true,
      initialState: {
        pagination: { pageIndex: 0, pageSize },
        sorting: initialSorting ?? [],
      },
      // Override TanStack's desc-first default for numeric columns so every
      // column's first click sorts ascending (cycle: asc → desc → unsorted).
      sortDescFirst: false,
    },
    (state) => ({
      columnFilters: state.columnFilters,
      pagination: state.pagination,
      sorting: state.sorting,
    }),
  );
  useEffect(
    function syncControlledFilterValue() {
      if (!controlled || filterColumn == null) {
        return;
      }

      const column = table.getColumn(filterColumn);
      const currentFilterValue = column?.getFilterValue();

      if (controlledFilterValue === "") {
        if (currentFilterValue != null && currentFilterValue !== "") {
          column?.setFilterValue(undefined);
        }
        return;
      }

      if (currentFilterValue !== controlledFilterValue) {
        column?.setFilterValue(controlledFilterValue);
      }
    },
    [controlled, controlledFilterValue, filterColumn, table]
  );

  const pageCount = Math.max(1, table.getPageCount());
  const totalRows = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.state.pagination;
  useEffect(
    function clampPageToShrunkData() {
      if (pageIndex > 0 && pageIndex >= pageCount) {
        table.setPageIndex(pageCount - 1);
      }
    },
    [pageIndex, pageCount, table]
  );
  const start = pageIndex * currentPageSize + 1;
  const end = Math.min((pageIndex + 1) * currentPageSize, totalRows);
  const quicksearch =
    filterColumn && !controlled ? (
      <DataTableFilter
        onChange={(value) =>
          table.getColumn(filterColumn)?.setFilterValue(value)
        }
        placeholder={filterPlaceholder}
        value={
          (table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""
        }
      />
    ) : null;
  const refreshControl =
    onRefresh != null && lastFetchedLabel != null ? (
      <RefreshControl
        className="text-muted-foreground text-xs"
        isRefreshing={isRefreshing}
        labelClassName="sm:not-sr-only"
        lastFetchedLabel={lastFetchedLabel}
        onRefresh={onRefresh}
      />
    ) : null;
  const toolbarFilterContent = renderToolbarFilters
    ? renderToolbarFilters()
    : toolbarFilters;
  const toolbarControls =
    quicksearch || toolbarFilterContent ? (
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-2",
          refreshControl && "flex-1"
        )}
      >
        {quicksearch}
        {toolbarFilterContent}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {toolbarControls || refreshControl ? (
        <div
          className={cn(
            "flex min-h-8 flex-wrap items-center gap-2",
            refreshControl ? "justify-between" : "justify-end"
          )}
        >
          {toolbarControls}
          {refreshControl}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table className={tableClassName}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                className="border-border hover:bg-transparent"
                key={headerGroup.id}
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn(
                      "text-muted-foreground text-xs",
                      header.column.columnDef.meta?.headerClassName,
                    )}
                    key={header.id}
                  >
                    {header.isPlaceholder
                      ? null
                      : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="border-border">
                <TableCell
                  className="p-0"
                  colSpan={columns.length}
                >
                  <SearchEmptyState
                    className="min-h-24 py-8"
                    resourceName={emptyResourceName}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const rowProps = getRowProps?.(row.original);
                const { onClick: rowPropsOnClick, ...restRowProps } =
                  rowProps ?? {};

                return (
                  <TableRow
                    {...restRowProps}
                    className={cn(
                      "border-border",
                      onRowClick &&
                        "cursor-pointer group transition-colors hover:bg-muted/50",
                    )}
                    key={row.id}
                    onClick={(event) => {
                      rowPropsOnClick?.(event);
                      if (!event.defaultPrevented) {
                        onRowClick?.(row.original);
                      }
                    }}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick(row.original);
                            }
                          }
                        : undefined
                    }
                    role={onRowClick ? "button" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        className={cn(
                          cell.column.columnDef.meta?.cellClassName,
                        )}
                        key={cell.id}
                      >
                        {<table.FlexRender cell={cell} />}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs">
        {totalRows > 0 ? (
          <span className="shrink-0 tabular-nums">
            Showing {start}&ndash;{end} of {totalRows}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <PaginationFooter
            hasNext={table.getCanNextPage()}
            hasPrev={table.getCanPreviousPage()}
            onNext={() => table.nextPage()}
            onPageSizeChange={(nextPageSize) => table.setPageSize(nextPageSize)}
            onPrev={() => table.previousPage()}
            pageLabel={`Page ${pageIndex + 1} of ${pageCount}`}
            pageSize={currentPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </div>
      </div>
    </div>
  );
}

export { DataTable, DataTableFilter, SortableHeader };
export type { DataTableColumnDef, DataTableProps };
