import type { RowData } from "@tanstack/react-table";
import { DataTableToolbar } from "@/components/querylane-ui/data-table-controls";
import {
  DataTableFooter,
  DataTableStatus,
} from "@/components/querylane-ui/data-table-footer";
import {
  type DataTableProps,
  useDataTableModel,
} from "@/components/querylane-ui/data-table-model";
import {
  DataTableBody,
  DataTableHeaders,
} from "@/components/querylane-ui/data-table-view";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function DataTable<RowValue extends RowData>(props: DataTableProps<RowValue>) {
  const {
    data,
    density,
    distinguishEmpty = false,
    emptyResourceName = "results",
    filterColumn,
    filterValue,
    onFilterChange,
    getRowProps,
    isPending = false,
    hasActiveFilters = false,
    pendingMessage,
    isRefreshing,
    onRowClick,
    tableClassName,
  } = props;
  const { table, definitions, visibleIds, setSelection } =
    useDataTableModel(props);
  const isControlled =
    filterColumn !== undefined && onFilterChange !== undefined;
  const controlledFilterValue = isControlled ? (filterValue ?? "") : undefined;
  const showSkeleton = isPending && data.length === 0;
  const busy =
    isPending || (props.isPending !== undefined && isRefreshing === true);
  const isFiltered =
    hasActiveFilters ||
    Boolean(controlledFilterValue) ||
    table.state.columnFilters.length > 0;
  const pageCount = Math.max(1, table.getPageCount());
  const totalRows = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.state.pagination;

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        columnSelection={{ definitions, visibleIds, setSelection }}
        isControlled={isControlled}
        props={props}
        table={table}
      />

      <DataTableStatus
        busy={busy}
        pendingMessage={pendingMessage}
        resourceName={emptyResourceName}
        showSkeleton={showSkeleton}
      />
      <div className="border-border overflow-hidden rounded-lg border">
        <Table
          aria-busy={busy ? true : undefined}
          className={cn(density === "metadata" && "text-sm", tableClassName)}
        >
          <DataTableHeaders sorting={table.state.sorting} table={table} />
          <DataTableBody
            getRowProps={getRowProps}
            isFiltered={isFiltered || !distinguishEmpty}
            onRowClick={onRowClick}
            pending={showSkeleton}
            resourceName={emptyResourceName}
            rows={table.getRowModel().rows}
            table={table}
          />
        </Table>
      </div>

      <DataTableFooter
        currentPageSize={currentPageSize}
        pageCount={pageCount}
        pageIndex={pageIndex}
        showSkeleton={showSkeleton}
        table={table}
        totalRows={totalRows}
      />
    </div>
  );
}

export { DataTable };
