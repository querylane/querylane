import type { Row, RowData, SortingState } from "@tanstack/react-table";
import type {
  DataTableFeatures,
  DataTableInstance,
  DataTableProps,
} from "@/components/querylane-ui/data-table-model";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function sortAnnouncement(
  sorting: SortingState,
  id: string
): "none" | "ascending" | "descending" {
  const sort = sorting.find((value) => value.id === id);
  if (!sort) {
    return "none";
  }
  return sort.desc ? "descending" : "ascending";
}
function DataTableHeaders<RowValue extends RowData>({
  table,
  sorting,
}: {
  table: DataTableInstance<RowValue>;
  sorting: SortingState;
}) {
  return (
    <TableHeader>
      {table.getHeaderGroups().map((group) => (
        <TableRow className="border-border hover:bg-transparent" key={group.id}>
          {group.headers.map((header) => (
            <TableHead
              aria-sort={
                header.column.getCanSort()
                  ? sortAnnouncement(sorting, header.column.id)
                  : undefined
              }
              className={cn(
                "text-muted-foreground text-xs",
                header.column.columnDef.meta?.headerClassName
              )}
              key={header.id}
            >
              {header.isPlaceholder ? null : (
                <table.FlexRender header={header} />
              )}
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}
const pendingRowIds = [
  "pending-a",
  "pending-b",
  "pending-c",
  "pending-d",
  "pending-e",
];
function DataTableBody<RowValue extends RowData>({
  table,
  rows,
  pending,
  isFiltered,
  resourceName,
  getRowProps,
  onRowClick,
}: {
  table: DataTableInstance<RowValue>;
  rows: Row<DataTableFeatures, RowValue>[];
  pending: boolean;
  isFiltered: boolean;
  resourceName: string;
  getRowProps: DataTableProps<RowValue>["getRowProps"];
  onRowClick: DataTableProps<RowValue>["onRowClick"];
}) {
  if (pending) {
    return (
      <TableBody>
        {pendingRowIds.map((id) => (
          <TableRow
            aria-hidden="true"
            className="border-border hover:bg-transparent"
            key={id}
          >
            {table.getVisibleLeafColumns().map((column) => (
              <TableCell key={column.id}>
                <Skeleton className="h-5 w-full motion-reduce:animate-none" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    );
  }
  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow className="border-border">
          <TableCell
            className="p-0"
            colSpan={table.getVisibleLeafColumns().length}
          >
            {isFiltered ? (
              <SearchEmptyState
                className="min-h-24 py-8"
                resourceName={resourceName}
              />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No {resourceName} available.
              </p>
            )}
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }
  return (
    <TableBody>
      {rows.map((row) => (
        <DataTableDataRow
          getRowProps={getRowProps}
          key={row.id}
          onRowClick={onRowClick}
          row={row}
          table={table}
        />
      ))}
    </TableBody>
  );
}
function DataTableDataRow<RowValue extends RowData>({
  row,
  table,
  getRowProps,
  onRowClick,
}: {
  row: Row<DataTableFeatures, RowValue>;
  table: DataTableInstance<RowValue>;
  getRowProps: DataTableProps<RowValue>["getRowProps"];
  onRowClick: DataTableProps<RowValue>["onRowClick"];
}) {
  const { onClick, ...rowProps } = getRowProps?.(row.original) ?? {};
  return (
    <TableRow
      {...rowProps}
      className={cn(
        "border-border",
        onRowClick && "group hover:bg-muted/50 cursor-pointer transition-colors"
      )}
      onClick={(event) => {
        onClick?.(event);
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
      {row.getVisibleCells().map((cell) => (
        <TableCell
          className={cell.column.columnDef.meta?.cellClassName}
          key={cell.id}
        >
          <table.FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  );
}

export { DataTableBody, DataTableHeaders };
