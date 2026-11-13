import type { RowData } from "@tanstack/react-table";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import type { DataTableInstance } from "@/components/querylane-ui/data-table-model";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

function DataTableFooter<RowValue extends RowData>({
  table,
  totalRows,
  pageIndex,
  pageCount,
  currentPageSize,
  showSkeleton,
}: {
  table: DataTableInstance<RowValue>;
  totalRows: number;
  pageIndex: number;
  pageCount: number;
  currentPageSize: number;
  showSkeleton: boolean;
}) {
  const start = pageIndex * currentPageSize + 1;
  const end = Math.min((pageIndex + 1) * currentPageSize, totalRows);
  return (
    <div
      className="flex min-h-8 flex-wrap items-center gap-4 text-xs text-muted-foreground"
      data-slot="data-table-footer"
    >
      {showSkeleton ? (
        <Skeleton
          aria-hidden="true"
          className="h-8 w-full motion-reduce:animate-none"
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
function DataTableStatus({
  busy,
  showSkeleton,
  pendingMessage,
  resourceName,
}: {
  busy: boolean | undefined;
  showSkeleton: boolean;
  pendingMessage: string | undefined;
  resourceName: string;
}) {
  if (busy !== true) {
    return null;
  }
  const message = showSkeleton
    ? (pendingMessage ?? `Loading ${resourceName}…`)
    : `Refreshing ${resourceName}…`;
  return (
    <p className="sr-only" role="status">
      {message}
    </p>
  );
}

export { DataTableFooter, DataTableStatus };
