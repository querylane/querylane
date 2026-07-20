import { Rows3, SearchX } from "lucide-react";
import type { ClipboardEvent } from "react";
import {
  type CellCopyArgs,
  type CellMouseArgs,
  type CellMouseEvent,
  type Column,
  DataGrid,
  type DefaultColumnOptions,
  type PositionChangeArgs,
  type Renderers,
  type SortColumn,
} from "react-data-grid";
import { DataGridCheckbox } from "@/components/data-grid/table-data-grid/data-grid-checkbox";
import {
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SKELETON_ROW_COUNT = 8;
const SKELETON_ROW_IDS = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => `skeleton-row-${index}`
);

const DATA_GRID_DEFAULT_COLUMN_OPTIONS = {
  minWidth: 80,
  resizable: true,
  sortable: false,
} satisfies DefaultColumnOptions<GridRow, unknown>;

const DATA_GRID_RENDERERS = {
  renderCheckbox: DataGridCheckbox,
} satisfies Renderers<GridRow, unknown>;

function gridRowKeyGetter(row: GridRow): string {
  return row[ROW_KEY_FIELD];
}

/**
 * Centered message over the empty grid body. The grid itself stays mounted so
 * the header keeps showing the table's columns and types; this overlay starts
 * below the 36px header row and ignores pointer events, so header interactions
 * (resize, reorder, context menus) keep working.
 */
function NoRowsOverlay({ hasActiveFilter }: { hasActiveFilter: boolean }) {
  const Icon = hasActiveFilter ? SearchX : Rows3;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-9 bottom-0 flex items-center justify-center p-6"
      data-slot="grid-no-rows-overlay"
    >
      <Empty className="flex-none border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden={true} className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-sm">No rows found</EmptyTitle>
          <EmptyDescription>
            {hasActiveFilter
              ? "Try a different search or filter."
              : "This table is empty."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      {SKELETON_ROW_IDS.map((rowId) => (
        <Skeleton className="h-6 w-full" key={rowId} />
      ))}
    </div>
  );
}

interface GridBodyProps {
  columns: Column<GridRow>[];
  /** Full-bleed mode: no side borders/rounding; inset loading/empty panels. */
  flush?: boolean;
  hasActiveFilter: boolean;
  isLoading: boolean;
  onActivePositionChange: (args: PositionChangeArgs<GridRow>) => void;
  onCellContextMenu: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onCellCopy: (
    args: CellCopyArgs<GridRow>,
    event: ClipboardEvent<HTMLDivElement>
  ) => void;
  onColumnsReorder: (sourceColumnKey: string, targetColumnKey: string) => void;
  onSelectedRowsChange: (next: ReadonlySet<string>) => void;
  onSortChange: (next: SortColumn[]) => void;
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  sortColumns: SortColumn[];
}

function GridBody({
  columns,
  flush = false,
  hasActiveFilter,
  isLoading,
  onCellContextMenu,
  onCellCopy,
  onColumnsReorder,
  onActivePositionChange,
  onSelectedRowsChange,
  onSortChange,
  rows,
  selectedRows,
  sortColumns,
}: GridBodyProps) {
  if (isLoading) {
    return (
      <div className={cn(flush && "p-3")}>
        <LoadingSkeleton />
      </div>
    );
  }
  return (
    <div className="contents" data-keyboard-shortcut-scope="grid">
      <DataGrid
        className={cn(
          "rdg-light dark:rdg-dark [&_.rdg-checkbox-input]:size-4! [&_.rdg-checkbox-input]:accent-primary",
          flush && "rounded-none! border-x-0!"
        )}
        columns={columns}
        defaultColumnOptions={DATA_GRID_DEFAULT_COLUMN_OPTIONS}
        // Keep RDG virtualization on. Wide/complex result sets otherwise mount
        // every visible-page cell and stall the explorer.
        enableVirtualization={true}
        headerRowHeight={36}
        onActivePositionChange={onActivePositionChange}
        onCellContextMenu={onCellContextMenu}
        onCellCopy={onCellCopy}
        onColumnsReorder={onColumnsReorder}
        onSelectedRowsChange={onSelectedRowsChange}
        onSortColumnsChange={onSortChange}
        renderers={DATA_GRID_RENDERERS}
        rowHeight={32}
        rowKeyGetter={gridRowKeyGetter}
        rows={rows}
        selectedRows={selectedRows}
        sortColumns={sortColumns}
      />
      {rows.length === 0 ? (
        <NoRowsOverlay hasActiveFilter={hasActiveFilter} />
      ) : null}
    </div>
  );
}

export { GridBody };
