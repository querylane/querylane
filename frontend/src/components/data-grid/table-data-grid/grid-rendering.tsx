import { Rows3 } from "lucide-react";
import type { ClipboardEvent } from "react";
import {
  type CellCopyArgs,
  type CellMouseArgs,
  type CellMouseEvent,
  type CellSelectArgs,
  type Column,
  DataGrid,
  type DefaultColumnOptions,
  type Renderers,
  type SortColumn,
} from "react-data-grid";
import { DataGridCheckbox } from "@/components/data-grid/table-data-grid/data-grid-checkbox";
import {
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { SearchEmptyState } from "@/components/search-empty-state";
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
  hasActiveFilter: boolean;
  isLoading: boolean;
  onCellContextMenu: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onCellCopy: (
    args: CellCopyArgs<GridRow>,
    event: ClipboardEvent<HTMLDivElement>
  ) => void;
  onColumnsReorder: (sourceColumnKey: string, targetColumnKey: string) => void;
  onSelectedCellChange: (args: CellSelectArgs<GridRow>) => void;
  onSelectedRowsChange: (next: ReadonlySet<string>) => void;
  onSortChange: (next: SortColumn[]) => void;
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  sortColumns: SortColumn[];
}

function GridBody({
  columns,
  hasActiveFilter,
  isLoading,
  onCellContextMenu,
  onCellCopy,
  onColumnsReorder,
  onSelectedCellChange,
  onSelectedRowsChange,
  onSortChange,
  rows,
  selectedRows,
  sortColumns,
}: GridBodyProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }
  if (rows.length === 0) {
    if (hasActiveFilter) {
      return <SearchEmptyState className="border" resourceName="rows" />;
    }
    return <EmptyStatePanel icon={Rows3}>No rows found</EmptyStatePanel>;
  }
  return (
    <DataGrid
      className={cn("querylane-data-grid", "rdg-light dark:rdg-dark")}
      columns={columns}
      defaultColumnOptions={DATA_GRID_DEFAULT_COLUMN_OPTIONS}
      // Keep RDG virtualization on. Wide/complex result sets otherwise mount
      // every visible-page cell and stall the explorer.
      enableVirtualization={true}
      headerRowHeight={36}
      onCellContextMenu={onCellContextMenu}
      onCellCopy={onCellCopy}
      onColumnsReorder={onColumnsReorder}
      onSelectedCellChange={onSelectedCellChange}
      onSelectedRowsChange={onSelectedRowsChange}
      onSortColumnsChange={onSortChange}
      renderers={DATA_GRID_RENDERERS}
      rowHeight={32}
      rowKeyGetter={gridRowKeyGetter}
      rows={rows}
      selectedRows={selectedRows}
      sortColumns={sortColumns}
    />
  );
}

export { GridBody };
