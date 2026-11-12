import {
  type Column,
  functionalUpdate,
  type RowData,
  Subscribe,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListColumnSelector } from "@/components/ui/list-column-selector";
import { RefreshControl } from "@/components/ui/refresh-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useListColumnSelection, useListSorting } from "@/lib/list-columns";
import { compareListCellValues, listSortDirection } from "@/lib/list-layout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  type DataTableFeatures,
  type DataTableFilterProps,
  type DataTableProps,
  type DataTableState,
  dataTableFeatures,
  listColumnDefinitions,
} from "./data-table-model";

type DataTableInstance<Row extends RowData> = ReturnType<
  typeof useTable<DataTableFeatures, Row, DataTableState>
>;

function renderDataTableRow<Row extends RowData>({
  row,
  table,
  getRowProps,
  onRowClick,
}: {
  row: ReturnType<DataTableInstance<Row>["getRowModel"]>["rows"][number];
  table: DataTableInstance<Row>;
  getRowProps: DataTableProps<Row>["getRowProps"];
  onRowClick: DataTableProps<Row>["onRowClick"];
}) {
  const rowProps = getRowProps?.(row.original);
  const { onClick: rowPropsOnClick, ...restRowProps } = rowProps ?? {};
  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>) {
    rowPropsOnClick?.(event);
    if (!event.defaultPrevented) {
      onRowClick?.(row.original);
    }
  }
  function handleRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (onRowClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onRowClick(row.original);
    }
  }
  return (
    <TableRow
      key={row.id}
      {...restRowProps}
      className={cn(
        "border-border",
        onRowClick && "group cursor-pointer transition-colors hover:bg-muted/50"
      )}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      role={onRowClick ? "button" : undefined}
      tabIndex={onRowClick ? 0 : undefined}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell
          className={cn(cell.column.columnDef.meta?.cellClassName)}
          key={cell.id}
        >
          <table.FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function filterText(value: unknown) {
  return typeof value === "string" ? value : "";
}
function sortedHeaderLabel(sorted: string | false) {
  if (sorted === "asc") {
    return "sorted ascending";
  }
  if (sorted === "desc") {
    return "sorted descending";
  }
  return "not sorted";
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
        onValueChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function SortableHeader<Row extends RowData>({
  children,
  className,
  column,
}: {
  children: React.ReactNode;
  className?: string;
  column: Column<DataTableFeatures, Row>;
}) {
  const label = typeof children === "string" ? children : "Column";

  return (
    <Subscribe
      selector={(sorting) => {
        const sort = sorting.find((sortState) => sortState.id === column.id);
        if (sort === undefined) {
          return false;
        }
        return sort.desc ? "desc" : "asc";
      }}
      source={column.table.atoms.sorting}
    >
      {(sorted) => {
        const sortStateLabel = sortedHeaderLabel(sorted);
        const SortIcon = sorted === "asc" ? ArrowUp : ArrowDown;
        const icon =
          sorted === false ? (
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 text-muted-foreground/75"
              data-querylane-slot="sort-indicator"
            />
          ) : (
            <SortIcon
              aria-hidden="true"
              className="size-4 text-foreground"
              data-querylane-slot="sort-indicator"
            />
          );

        return (
          <Button
            aria-label={`${label}, ${sortStateLabel}`}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground",
              className
            )}
            onClick={() => {
              column.toggleSorting();
            }}
            title="Sort column"
            type="button"
            variant="ghost"
          >
            {children}
            {icon}
          </Button>
        );
      }}
    </Subscribe>
  );
}

function useDataTableState<Row extends RowData>({
  columns,
  columnSelection: providedColumnSelection,
  data,
  filterColumn,
  filterValue,
  onFilterChange,
  initialSorting,
  pageSize = DEFAULT_PAGE_SIZE,
  tableKey,
}: DataTableProps<Row>) {
  const fallbackTableId = useId();
  const controlled = filterColumn !== undefined && onFilterChange !== undefined;
  const controlledFilterValue = controlled ? (filterValue ?? "") : undefined;

  const definitions = listColumnDefinitions(columns);
  const fallbackColumnSelection = useListColumnSelection(tableKey, definitions);
  const columnSelection = providedColumnSelection ?? fallbackColumnSelection;
  const { visibleIds, columnOrder } = columnSelection;
  const { sorting, setSorting } = useListSorting(
    tableKey,
    definitions.flatMap((column) =>
      column.sortable === true ? [column.id] : []
    ),
    initialSorting
  );
  const visible = new Set(visibleIds);
  const columnVisibility = Object.fromEntries(
    definitions.map((column) => [column.id, visible.has(column.id)])
  );
  const table = useTable<DataTableFeatures, Row, DataTableState>(
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
        setSorting(functionalUpdate(updater, sorting));
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
  const previousPageInputsRef = useRef({ data, sortingKey, filterKey });
  useEffect(
    function resetPageAfterSortOrFilterChange() {
      const previous = previousPageInputsRef.current;
      if (
        previous.data !== data ||
        previous.sortingKey !== sortingKey ||
        previous.filterKey !== filterKey
      ) {
        table.setPageIndex(0);
      }
      previousPageInputsRef.current = { data, sortingKey, filterKey };
    },
    [table, data, sortingKey, filterKey]
  );
  useEffect(
    function syncControlledFilterValue() {
      if (!controlled || filterColumn === undefined) {
        return;
      }

      const column = table.getColumn(filterColumn);
      const currentFilterValue = column?.getFilterValue();

      const nextValue =
        controlledFilterValue === "" ? undefined : controlledFilterValue;
      if (currentFilterValue !== nextValue) {
        column?.setFilterValue(nextValue);
      }
    },
    [controlled, controlledFilterValue, filterColumn, table]
  );

  const columnSelector =
    Boolean(tableKey) && !providedColumnSelection ? (
      <ListColumnSelector columns={definitions} {...columnSelection} />
    ) : null;

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
  return {
    table,
    columnSelector,
    controlled,
    sorting,
    pageCount,
    totalRows,
    pageIndex,
    currentPageSize,
    start,
    end,
  };
}

function DataTableControls<Row extends RowData>({
  props,
  table,
  columnSelector,
  controlled,
}: {
  props: DataTableProps<Row>;
  table: DataTableInstance<Row>;
  columnSelector: React.ReactNode;
  controlled: boolean;
}) {
  const {
    filterColumn,
    filterPlaceholder = "Filter…",
    isRefreshing,
    lastFetchedLabel,
    onRefresh,
    renderToolbarFilters,
    toolbarFilters,
  } = props;
  const quicksearch =
    filterColumn !== undefined && filterColumn !== "" && !controlled ? (
      <DataTableFilter
        onChange={(value) =>
          table.getColumn(filterColumn)?.setFilterValue(value)
        }
        placeholder={filterPlaceholder}
        value={filterText(table.getColumn(filterColumn)?.getFilterValue())}
      />
    ) : null;
  const showRefresh = onRefresh !== undefined && lastFetchedLabel !== undefined;
  const refreshControl = showRefresh ? (
    <RefreshControl
      className="text-xs text-muted-foreground"
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
    quicksearch !== null || Boolean(toolbarFilterContent) ? (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {quicksearch}
        {toolbarFilterContent}
      </div>
    ) : null;

  const hasToolbar = Boolean(
    toolbarControls ?? refreshControl ?? columnSelector
  );
  return hasToolbar ? (
    <div className="flex min-h-8 min-w-0 items-start gap-2">
      {toolbarControls}
      <div className="ms-auto flex shrink-0 items-center gap-2">
        {columnSelector}
        {refreshControl}
      </div>
    </div>
  ) : null;
}

function DataTable<Row extends RowData>(props: DataTableProps<Row>) {
  const {
    emptyResourceName = "results",
    onRowClick,
    getRowProps,
    tableClassName,
  } = props;
  const {
    table,
    columnSelector,
    controlled,
    sorting,
    pageCount,
    totalRows,
    pageIndex,
    currentPageSize,
    start,
    end,
  } = useDataTableState(props);
  function renderHeader(
    header: ReturnType<typeof table.getHeaderGroups>[number]["headers"][number]
  ) {
    let content: React.ReactNode = null;
    if (!header.isPlaceholder) {
      content =
        typeof header.column.columnDef.header === "string" &&
        header.column.getCanSort() ? (
          <SortableHeader column={header.column}>
            {header.column.columnDef.header}
          </SortableHeader>
        ) : (
          <table.FlexRender header={header} />
        );
    }
    return (
      <TableHead
        aria-label={
          typeof header.column.columnDef.header === "string"
            ? header.column.columnDef.header
            : undefined
        }
        aria-sort={listSortDirection(header.column.id, sorting)}
        className={cn(
          "text-xs text-muted-foreground",
          header.column.columnDef.meta?.headerClassName
        )}
        key={header.id}
      >
        {content}
      </TableHead>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <DataTableControls
        columnSelector={columnSelector}
        controlled={controlled}
        props={props}
        table={table}
      />

      <div
        className="overflow-hidden rounded-lg border border-border"
        data-agent-hidden={true}
      >
        <Table className={tableClassName}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                className="border-border hover:bg-transparent"
                key={headerGroup.id}
              >
                {headerGroup.headers.map(renderHeader)}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="border-border">
                <TableCell
                  className="p-0"
                  colSpan={table.getVisibleLeafColumns().length}
                >
                  <SearchEmptyState
                    className="min-h-24 py-8"
                    resourceName={emptyResourceName}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table
                .getRowModel()
                .rows.map((row) =>
                  renderDataTableRow({ row, table, getRowProps, onRowClick })
                )
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {totalRows > 0 ? (
          <span className="shrink-0 tabular-nums">
            Showing {start}&ndash;{end} of {totalRows}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <PaginationFooter
            hasNext={table.getCanNextPage()}
            hasPrev={table.getCanPreviousPage()}
            onNext={() => {
              table.nextPage();
            }}
            onPageSizeChange={(nextPageSize) => {
              table.setPageSize(nextPageSize);
            }}
            onPrev={() => {
              table.previousPage();
            }}
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
