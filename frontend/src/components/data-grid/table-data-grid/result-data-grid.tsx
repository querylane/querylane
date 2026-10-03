"use client";

import {
  type ClipboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "react-data-grid/lib/styles.css";
import type {
  CellCopyArgs,
  CellKeyboardEvent,
  CellKeyDownArgs,
  CellMouseArgs,
  CellMouseEvent,
  Column,
  SortColumn,
} from "react-data-grid";
import { CellContextMenu } from "@/components/data-grid/table-data-grid/cell-context-menu";
import {
  buildCellInteractionHandlers,
  type ContextMenuState,
} from "@/components/data-grid/table-data-grid/cell-interaction-handlers";
import { getDisplayedDataColumnKeys } from "@/components/data-grid/table-data-grid/cell-selection-copy";
import {
  type CellSelectionStore,
  type CellSelectionSummary,
  createCellSelectionStore,
  getCellSelectionSummary,
} from "@/components/data-grid/table-data-grid/cell-selection-state";
import { DataGridToolbar } from "@/components/data-grid/table-data-grid/data-grid-toolbar";
import { DataValueDialogProvider } from "@/components/data-grid/table-data-grid/data-value-dialog-provider";
import type {
  RenderOpenReferencedTableLink,
  TableForeignKeyReference,
} from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import {
  getGridCell,
  setGridCell,
} from "@/components/data-grid/table-data-grid/grid-cell-access";
import { GridBody } from "@/components/data-grid/table-data-grid/grid-rendering";
import {
  fallbackRowKey,
  type GridRow,
  isGridActionColumnKey,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import { GridStatusBar } from "@/components/data-grid/table-data-grid/grid-status-bar";
import { GridSurface } from "@/components/data-grid/table-data-grid/grid-surface";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { RecordDetailDrawer } from "@/components/data-grid/table-data-grid/record-detail-drawer";
import type {
  GridEmptyMessage,
  ResultDataGridFilters,
  ResultDataGridPagination,
  ResultDataGridRefresh,
  ResultRow,
} from "@/components/data-grid/table-data-grid/result-data-grid-types";
import { useGridColumns } from "@/components/data-grid/table-data-grid/use-grid-columns";
import { useSelectionActions } from "@/components/data-grid/table-data-grid/use-selection-actions";
import {
  staticColumnLayout,
  type TableColumnLayoutController,
} from "@/components/data-grid/table-data-grid/use-table-column-layout";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/querylane-ui/dialog";
import type { FetchFullCell } from "@/features/data-explorer/table-data/full-cell-resolver";
import type { GridStatusItem } from "@/features/data-explorer/table-data/grid-status";
import type { ExportFormat } from "@/features/data-explorer/table-data/selection-formatters";
import { tryParseRelationQualifiedName } from "@/lib/console-resources";
import { HIGH_VOLUME_PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import type { RowIdentity_Source } from "@/protogen/querylane/console/v1alpha1/table_pb";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

/**
 * The interactive result grid shared by the Data Explorer and the SQL
 * workbench: multi-cell selection (drag, shift, ctrl, keyboard, select all),
 * the cell context menu, selection copy/export, the value dialog, the record
 * drawer, column header menus and the column layout. It renders whatever
 * rows it is given; fetching, paging, filtering and refreshing belong to the
 * caller and arrive as optional capabilities.
 */

interface ResultDataGridProps {
  /** Rendered under the toolbar (query errors, invalid filters). */
  alerts?: ReactNode;
  /** Offers "Copy row as SQL INSERT" and SQL export; defaults to true. */
  allowSqlExport?: boolean | undefined;
  /** Accessible name of the grid; defaults to "Table data". */
  ariaLabel?: string | undefined;
  /** Column catalog for the column/sort pickers; defaults to the result columns. */
  availableColumns?: TableResultColumn[] | undefined;
  /** Column order/visibility; omit for grids that show results as returned. */
  columnLayout?: TableColumnLayoutController | undefined;
  /**
   * Column header menu (sort, hide, freeze) and drag-to-reorder; defaults to
   * true. Query results turn it off: their shape belongs to the SQL.
   */
  columnMenu?: boolean | undefined;
  /** Replaces the default empty-grid copy. */
  emptyMessage?: GridEmptyMessage | undefined;
  /** Resolves truncated cell previews (ReadCellValue); omit when never truncated. */
  fetchFullCell?: FetchFullCell | undefined;
  /** Grow with the parent panel instead of keeping the explorer's minimum height. */
  fill?: boolean | undefined;
  filters?: ResultDataGridFilters | undefined;
  foreignKeyReferences?: readonly TableForeignKeyReference[] | undefined;
  /** Initial load: shows the skeleton instead of the grid. */
  isLoading?: boolean | undefined;
  /** Rows on screen belong to the previous request: dim them. */
  isRefetchingRows?: boolean | undefined;
  /** Server sort; omit for results whose order the statement decides. */
  onSortChange?: ((next: SortColumn[]) => void) | undefined;
  pagination?: ResultDataGridPagination | undefined;
  /** Hides the empty state while an error explains the missing rows. */
  queryErrorActive?: boolean | undefined;
  /** Record drawer heading; defaults to the resource's schema.table. */
  recordTitle?: string | undefined;
  refresh?: ResultDataGridRefresh | undefined;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
  /** Selections are scoped to one result: a new key clears them. */
  resetKey: string;
  /** Table resource name: export file names, INSERT target, record fields. */
  resourceName: string;
  resultColumns: TableResultColumn[];
  resultRows: readonly ResultRow[];
  rowIdentity?:
    | { columnNames: string[]; source: RowIdentity_Source }
    | null
    | undefined;
  /** Row checkboxes for copying/exporting whole rows; defaults to true. */
  rowSelection?: boolean | undefined;
  showRowNumbers?: boolean | undefined;
  sortColumns?: SortColumn[] | undefined;
  statusItems?: GridStatusItem[] | undefined;
  /** Drops the status bar and pagination (stale or failed requests). */
  suppressStatusAndPagination?: boolean | undefined;
  /** Filter/sort/columns/expand toolbar; defaults to true. */
  toolbar?: boolean | undefined;
}

// Stable default so the grid columns are not rebuilt every render for tables
// without foreign keys.
const NO_FOREIGN_KEY_REFERENCES: readonly TableForeignKeyReference[] = [];
const NO_STATUS_ITEMS: GridStatusItem[] = [];
const NO_SORT_COLUMNS: SortColumn[] = [];
function ignoreSortChange() {
  // Results without server sort: the statement's ORDER BY decides.
}

function useCellSelectionStore(): CellSelectionStore {
  const storeRef = useRef<CellSelectionStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createCellSelectionStore();
  }
  return storeRef.current;
}

function useOpenRowState(rows: GridRow[]) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const openRowIndex =
    openRowKey === null
      ? null
      : rows.findIndex((row) => row[ROW_KEY_FIELD] === openRowKey);
  const resolvedOpenRowIndex =
    openRowIndex !== null && openRowIndex >= 0 ? openRowIndex : null;

  function setOpenRowIndex(next: number | null) {
    setOpenRowKey(next === null ? null : (rows[next]?.[ROW_KEY_FIELD] ?? null));
  }

  return {
    openRowIndex: resolvedOpenRowIndex,
    setOpenRowIndex,
  };
}

function buildGridRows(
  resultRows: readonly ResultRow[],
  resultColumns: TableResultColumn[]
): GridRow[] {
  return resultRows.map((row, rowIndex) => {
    const grouped: GridRow = {
      [ROW_KEY_FIELD]: row.rowKey || fallbackRowKey(rowIndex),
      cells: new Map(),
    };
    resultColumns.forEach((column, columnIndex) => {
      setGridCell(grouped, column, row.values[columnIndex]);
    });
    return grouped;
  });
}

function buildOpenRowCells(
  openRow: GridRow | undefined,
  resultColumns: TableResultColumn[]
): Map<string, TableCell | undefined> {
  const openRowCells = new Map<string, TableCell | undefined>();
  if (!openRow) {
    return openRowCells;
  }

  for (const column of resultColumns) {
    openRowCells.set(column.columnName, getGridCell(openRow, column));
  }
  return openRowCells;
}

function RecordDetailDrawerHost({
  name,
  openRowIndex,
  pkColumnSet,
  resultColumns,
  rows,
  setOpenRowIndex,
  title,
}: {
  name: string;
  openRowIndex: number | null;
  pkColumnSet: Set<string>;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  setOpenRowIndex: (next: number | null) => void;
  title?: string | undefined;
}) {
  const relationQualifiedName = tryParseRelationQualifiedName(name) ?? {
    relation: "",
    schema: "",
  };
  const openRow =
    openRowIndex !== null && openRowIndex >= 0 && openRowIndex < rows.length
      ? rows[openRowIndex]
      : undefined;
  const openRowCells = buildOpenRowCells(openRow, resultColumns);

  return (
    <RecordDetailDrawer
      columns={resultColumns}
      hasNext={openRowIndex !== null && openRowIndex < rows.length - 1}
      hasPrev={openRowIndex !== null && openRowIndex > 0}
      name={name}
      onNext={() => {
        if (openRowIndex !== null && openRowIndex < rows.length - 1) {
          setOpenRowIndex(openRowIndex + 1);
        }
      }}
      onOpenChange={(next) => {
        if (!next) {
          setOpenRowIndex(null);
        }
      }}
      onPrev={() => {
        if (openRowIndex !== null && openRowIndex > 0) {
          setOpenRowIndex(openRowIndex - 1);
        }
      }}
      onRowIndexChange={(nextRowIndex) => setOpenRowIndex(nextRowIndex)}
      open={openRow !== undefined}
      pkColumnSet={pkColumnSet}
      rowCells={openRowCells}
      rowCount={rows.length}
      rowIndex={openRowIndex ?? 0}
      tableName={{
        schema: relationQualifiedName.schema,
        table: relationQualifiedName.relation,
      }}
      title={title}
    />
  );
}

function pluralizedCount(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function getCellSelectionLiveLabel(summary: CellSelectionSummary): string {
  if (summary.cellCount === 0) {
    return "Cell selection cleared.";
  }
  if (summary.rangeCount !== 1) {
    return `${pluralizedCount(
      summary.cellCount,
      "cell"
    )} selected in ${pluralizedCount(summary.rangeCount, "range")}.`;
  }
  return `${pluralizedCount(
    summary.cellCount,
    "cell"
  )} selected in ${pluralizedCount(
    summary.rowCount ?? 0,
    "row"
  )} by ${pluralizedCount(summary.columnCount ?? 0, "column")}.`;
}

function CellSelectionLiveStatus({
  cellSelectionStore,
}: {
  cellSelectionStore: CellSelectionStore;
}) {
  const state = useSyncExternalStore(
    cellSelectionStore.subscribe,
    cellSelectionStore.getState,
    cellSelectionStore.getState
  );
  const summary = getCellSelectionSummary(state);
  const hasHadSelectionRef = useRef(summary.cellCount > 0);
  const liveLabel =
    state.isDragging || (summary.cellCount === 0 && !hasHadSelectionRef.current)
      ? ""
      : getCellSelectionLiveLabel(summary);

  useEffect(
    function rememberCellSelection() {
      if (summary.cellCount > 0) {
        hasHadSelectionRef.current = true;
      }
    },
    [summary.cellCount]
  );

  return (
    <span
      aria-label="Cell selection"
      aria-live="polite"
      className="sr-only"
      role="status"
    >
      {liveLabel}
    </span>
  );
}

interface ResultDataGridChromeProps {
  alerts?: ReactNode;
  allowSqlExport: boolean;
  ariaLabel?: string | undefined;
  availableColumns: TableResultColumn[];
  cellSelectionStore: CellSelectionStore;
  columnLayout: TableColumnLayoutController;
  columns: Column<GridRow>[];
  emptyMessage?: GridEmptyMessage | undefined;
  fill: boolean;
  filters?: ResultDataGridFilters | undefined;
  isLoading: boolean;
  isRefetchingRows: boolean;
  onCellContextMenu: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onCellCopy: (
    args: CellCopyArgs<GridRow>,
    event: ClipboardEvent<HTMLDivElement>
  ) => void;
  onCellKeyDown: (
    args: CellKeyDownArgs<GridRow>,
    event: CellKeyboardEvent
  ) => void;
  onCellMouseDown: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onClearSelection: () => void;
  onCopySelection: (format: ExportFormat) => void;
  onExportSelection: (format: ExportFormat) => void;
  onSelectedRowsChange: (next: ReadonlySet<string>) => void;
  onSortChange: (next: SortColumn[]) => void;
  onToggleExpanded: () => void;
  pagination?: ResultDataGridPagination | undefined;
  queryErrorActive: boolean;
  refresh?: ResultDataGridRefresh | undefined;
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  showToolbar: boolean;
  sortColumns: SortColumn[];
  statusItems: GridStatusItem[];
  suppressStatusAndPagination: boolean;
  variant: "default" | "expanded";
}

function ResultDataGridPager({
  isFlush,
  pagination: {
    currentPageIndex,
    hasNext,
    onNext,
    onPageSizeChange,
    onPrev,
    pageLabel,
    pageSize,
  },
}: {
  isFlush: boolean;
  pagination: ResultDataGridPagination;
}) {
  return (
    <PaginationFooter
      className={isFlush ? "px-3 py-2 sm:px-4" : undefined}
      hasNext={hasNext}
      hasPrev={currentPageIndex > 0}
      onNext={onNext}
      onPageSizeChange={onPageSizeChange}
      onPrev={onPrev}
      pageLabel={pageLabel}
      pageSize={pageSize}
      pageSizeOptions={HIGH_VOLUME_PAGE_SIZE_OPTIONS}
    />
  );
}

function ResultDataGridFooter({
  isFlush,
  pagination,
  statusItems,
}: {
  isFlush: boolean;
  pagination?: ResultDataGridPagination | undefined;
  statusItems: GridStatusItem[];
}) {
  return (
    <>
      {statusItems.length > 0 || pagination ? (
        <GridStatusBar
          className={isFlush ? "border-t-0 px-3 pt-1.5 sm:px-4" : undefined}
          items={statusItems}
        />
      ) : null}
      {pagination ? (
        <ResultDataGridPager isFlush={isFlush} pagination={pagination} />
      ) : null}
    </>
  );
}

/** Toolbar and alerts above the grid; renders nothing when both are absent. */
function ResultDataGridHeader({
  alerts,
  isFlush,
  toolbar,
}: {
  alerts?: ReactNode;
  isFlush: boolean;
  toolbar: ReactNode;
}) {
  if (!(toolbar || alerts)) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2",
        isFlush && "px-3 pt-2 pb-2 sm:px-4"
      )}
    >
      {toolbar}
      {alerts}
    </div>
  );
}

function ResultDataGridChrome({
  alerts,
  showToolbar,
  allowSqlExport,
  ariaLabel,
  availableColumns,
  cellSelectionStore,
  columnLayout,
  columns,
  emptyMessage,
  fill,
  filters,
  isLoading,
  isRefetchingRows,
  onCellContextMenu,
  onCellCopy,
  onCellKeyDown,
  onCellMouseDown,
  onClearSelection,
  onCopySelection,
  onExportSelection,
  onSelectedRowsChange,
  onSortChange,
  onToggleExpanded,
  pagination,
  queryErrorActive,
  refresh,
  rows,
  selectedRows,
  sortColumns,
  statusItems,
  suppressStatusAndPagination,
  variant,
}: ResultDataGridChromeProps) {
  // Default variant renders full-bleed inside its pane: the toolbar, status
  // bar, and pagination become padded bars while the grid itself runs
  // edge-to-edge. The expanded dialog keeps the inset, rounded look.
  const isFlush = variant !== "expanded";
  const {
    reorderColumns: handleColumnsReorder,
    reset: handleColumnLayoutReset,
    setColumnOrder: handleColumnOrderChange,
    setColumnVisibility: handleColumnVisibilityChange,
    setFetchVisibleColumns: handleFetchVisibleColumnsChange,
  } = columnLayout;
  return (
    <>
      <ResultDataGridHeader
        alerts={alerts}
        isFlush={isFlush}
        toolbar={
          showToolbar ? (
            <DataGridToolbar
              allowSqlExport={allowSqlExport}
              className={variant === "expanded" ? "pr-12" : undefined}
              columnOrder={columnLayout.columnOrder}
              columns={availableColumns}
              fetchVisibleColumns={columnLayout.fetchVisibleColumns}
              filterLogic={filters?.logic}
              filterRules={filters?.rules}
              filterTitle={filters?.title}
              hiddenColumnKeys={columnLayout.hiddenColumnKeys}
              isColumnLayoutCustomized={columnLayout.isCustomized}
              isExpanded={variant === "expanded"}
              isFetching={refresh?.isFetching ?? false}
              lastFetchedLabel={refresh?.lastFetchedLabel}
              onClearSelection={onClearSelection}
              onColumnLayoutReset={handleColumnLayoutReset}
              onColumnOrderChange={handleColumnOrderChange}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              onCopySelection={onCopySelection}
              onExportSelection={onExportSelection}
              onFetchVisibleColumnsChange={handleFetchVisibleColumnsChange}
              onFilterChange={filters?.onChange}
              onRefresh={refresh?.onRefresh}
              onSortChange={onSortChange}
              onToggleExpanded={onToggleExpanded}
              selectedCount={selectedRows.size}
              sortColumns={sortColumns}
            />
          ) : null
        }
      />

      <GridSurface
        busy={isRefetchingRows}
        fill={fill}
        loading={isLoading || isRefetchingRows}
        refreshStatusLabel={refresh?.lastFetchedLabel}
        variant={variant}
      >
        <GridBody
          ariaLabel={ariaLabel}
          cellSelectionStore={cellSelectionStore}
          columns={columns}
          emptyMessage={emptyMessage}
          flush={isFlush}
          hasActiveFilter={(filters?.rules.length ?? 0) > 0}
          isLoading={isLoading}
          onCellContextMenu={onCellContextMenu}
          onCellCopy={onCellCopy}
          onCellKeyDown={onCellKeyDown}
          onCellMouseDown={onCellMouseDown}
          onColumnsReorder={handleColumnsReorder}
          onSelectedRowsChange={onSelectedRowsChange}
          onSortChange={onSortChange}
          rows={rows}
          selectedRows={selectedRows}
          sortColumns={sortColumns}
          suppressEmptyState={queryErrorActive}
        />
      </GridSurface>

      {suppressStatusAndPagination ? null : (
        <ResultDataGridFooter
          isFlush={isFlush}
          pagination={pagination}
          statusItems={statusItems}
        />
      )}
    </>
  );
}

function ExpandedDataGridDialog({
  chromeProps,
  onOpenChange,
  open,
}: {
  chromeProps: ResultDataGridChromeProps;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog
      onOpenChange={(nextOpen, eventDetails) => {
        // RDG prevents Escape when it clears a cell range. Honor that handled
        // key instead of also dismissing the expanded grid.
        if (
          !nextOpen &&
          eventDetails.reason === "escape-key" &&
          eventDetails.event.defaultPrevented
        ) {
          eventDetails.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent
        className="!flex !max-w-[calc(100vw-1rem)] sm:!max-w-[calc(100vw-2rem)] h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]"
        presentation="canvas"
      >
        <DialogTitle className="sr-only">Expanded data grid</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ResultDataGridChrome
            {...chromeProps}
            onToggleExpanded={() => onOpenChange(false)}
            variant="expanded"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultDataGridContent({
  chromeProps,
  contextMenu,
  fill,
  isDataGridExpanded,
  name,
  onCloseContextMenu,
  onContextMenuCopyCell,
  onContextMenuCopyRow,
  onContextMenuCopyRowAsSql,
  onDataGridExpandedChange,
  openRowIndex,
  pkColumnSet,
  recordTitle,
  resultColumns,
  rows,
  setOpenRowIndex,
}: {
  chromeProps: ResultDataGridChromeProps;
  contextMenu: ContextMenuState | null;
  fill: boolean;
  isDataGridExpanded: boolean;
  name: string;
  onCloseContextMenu: () => void;
  onContextMenuCopyCell: () => void;
  onContextMenuCopyRow: () => void;
  onContextMenuCopyRowAsSql?: (() => void) | undefined;
  onDataGridExpandedChange: (next: boolean) => void;
  openRowIndex: number | null;
  pkColumnSet: Set<string>;
  recordTitle?: string | undefined;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  setOpenRowIndex: (next: number | null) => void;
}) {
  // The parent owns the available height; keep RDG at that finite height so
  // row virtualization stays active. Spacing between chrome pieces comes
  // from the flush bars' own padding, not a flex gap. The explorer keeps a
  // minimum height; a resizable panel (`fill`) may be smaller.
  return (
    <div
      className={cn(
        "flex h-full flex-col",
        fill ? "min-h-0 flex-1" : "min-h-[480px]"
      )}
    >
      <CellSelectionLiveStatus
        cellSelectionStore={chromeProps.cellSelectionStore}
      />
      <ResultDataGridChrome {...chromeProps} />
      <ExpandedDataGridDialog
        chromeProps={chromeProps}
        onOpenChange={onDataGridExpandedChange}
        open={isDataGridExpanded}
      />

      {contextMenu ? (
        <CellContextMenu
          left={contextMenu.left}
          onClose={onCloseContextMenu}
          onCopyCell={onContextMenuCopyCell}
          onCopyRow={onContextMenuCopyRow}
          onCopyRowAsSql={onContextMenuCopyRowAsSql}
          returnFocusTo={contextMenu.returnFocusTo}
          top={contextMenu.top}
        />
      ) : null}

      <RecordDetailDrawerHost
        name={name}
        openRowIndex={openRowIndex}
        pkColumnSet={pkColumnSet}
        resultColumns={resultColumns}
        rows={rows}
        setOpenRowIndex={setOpenRowIndex}
        title={recordTitle}
      />
    </div>
  );
}

function optionalHandler(
  enabled: boolean,
  handler: () => void
): (() => void) | undefined {
  return enabled ? handler : undefined;
}

/**
 * Runs `onChange` after a committed render in which `key` changed. Compares
 * committed keys so StrictMode's mount-effect replay stays a no-op, and keeps
 * the callback out of the dependencies so the state it touches does not
 * retrigger the effect.
 */
function useOnKeyChange(key: string, onChange: () => void) {
  const handleChange = useEffectEvent(onChange);
  const previousKeyRef = useRef(key);

  useEffect(
    function runOnKeyChange() {
      if (previousKeyRef.current === key) {
        return;
      }
      previousKeyRef.current = key;
      handleChange();
    },
    [key]
  );
}

/** RDG column index of the first result column, after the action columns. */
function dataColumnStartIndex(columns: Column<GridRow>[]): number {
  return columns.filter((column) => isGridActionColumnKey(column.key)).length;
}

function ResultDataGrid({
  alerts,
  allowSqlExport = true,
  ariaLabel,
  availableColumns,
  columnLayout: providedColumnLayout,
  columnMenu = true,
  emptyMessage,
  fetchFullCell,
  fill = false,
  filters,
  foreignKeyReferences = NO_FOREIGN_KEY_REFERENCES,
  isLoading = false,
  isRefetchingRows = false,
  onSortChange = ignoreSortChange,
  pagination,
  queryErrorActive = false,
  recordTitle,
  refresh,
  renderOpenReferencedTableLink,
  resetKey,
  resourceName,
  resultColumns,
  resultRows,
  rowIdentity,
  rowSelection = true,
  showRowNumbers = false,
  sortColumns = NO_SORT_COLUMNS,
  statusItems = NO_STATUS_ITEMS,
  suppressStatusAndPagination = false,
  toolbar = true,
}: ResultDataGridProps) {
  const columnLayout =
    providedColumnLayout ?? staticColumnLayout(resultColumns);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isDataGridExpanded, setIsDataGridExpanded] = useState(false);
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const cellSelectionStore = useCellSelectionStore();
  const rows = buildGridRows(resultRows, resultColumns);
  const { openRowIndex, setOpenRowIndex } = useOpenRowState(rows);

  // Selection and the open record drawer are scoped to one result: prior
  // keys don't map across page/sort/filter changes or a new query.
  useOnKeyChange(resetKey, () => {
    cellSelectionStore.clear();
    if (selectedRows.size > 0) {
      setSelectedRows(new Set());
    }
    if (openRowIndex !== null) {
      setOpenRowIndex(null);
    }
  });

  const [frozenColumns, setFrozenColumns] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const { columns, pkColumnSet } = useGridColumns({
    displayColumns: columnLayout.displayColumns,
    foreignKeyReferences,
    frozenColumns,
    onFrozenColumnsChange: setFrozenColumns,
    onHideColumn: (columnKey) =>
      columnLayout.setColumnVisibility(columnKey, false),
    renderOpenReferencedTableLink,
    resultColumns,
    rowIdentity,
    setOpenRowIndex,
    setSortColumns: onSortChange,
    columnMenu,
    rowSelection,
    showRowNumbers,
    sortColumns,
  });
  const dataColumnStart = dataColumnStartIndex(columns);
  const displayedDataColumnKeys = getDisplayedDataColumnKeys(columns);
  // A cell selection is positional, so it cannot survive columns or rows
  // moving under it.
  useOnKeyChange(
    JSON.stringify([
      displayedDataColumnKeys,
      rows.map((row) => row[ROW_KEY_FIELD]),
    ]),
    () => cellSelectionStore.clear()
  );

  const selectionActions = useSelectionActions({
    cellSelectionStore,
    columns,
    dataColumnStart,
    fetchFullCell,
    resourceName,
    resultColumns,
    rows,
    selectedRows,
    setSelectedRows,
  });
  const cellHandlers = buildCellInteractionHandlers({
    cellSelectionStore,
    contextMenu,
    dataColumnCount: displayedDataColumnKeys.length,
    dataColumnStart,
    rowCount: rows.length,
    selectionActions,
    setContextMenu,
  });

  const chromeProps: ResultDataGridChromeProps = {
    alerts,
    showToolbar: toolbar,
    allowSqlExport,
    ariaLabel,
    availableColumns: availableColumns ?? resultColumns,
    cellSelectionStore,
    columnLayout,
    columns,
    emptyMessage,
    fill,
    filters,
    isLoading,
    isRefetchingRows,
    onCellContextMenu: cellHandlers.handleCellContextMenu,
    onCellCopy: selectionActions.handleCellCopy,
    onCellKeyDown: cellHandlers.handleCellKeyDown,
    onCellMouseDown: cellHandlers.handleCellMouseDown,
    onClearSelection: selectionActions.clearSelection,
    onCopySelection: selectionActions.handleCopySelection,
    onExportSelection: selectionActions.handleExportSelection,
    onSelectedRowsChange: setSelectedRows,
    onSortChange,
    onToggleExpanded: () => setIsDataGridExpanded(true),
    pagination,
    queryErrorActive,
    refresh,
    rows,
    selectedRows,
    sortColumns,
    statusItems,
    suppressStatusAndPagination,
    variant: "default",
  };

  return (
    <DataValueDialogProvider>
      <ResultDataGridContent
        chromeProps={chromeProps}
        contextMenu={contextMenu}
        fill={fill}
        isDataGridExpanded={isDataGridExpanded}
        name={resourceName}
        onCloseContextMenu={() => setContextMenu(null)}
        onContextMenuCopyCell={cellHandlers.handleContextMenuCopyCell}
        onContextMenuCopyRow={cellHandlers.handleContextMenuCopyRow}
        onContextMenuCopyRowAsSql={optionalHandler(
          allowSqlExport,
          cellHandlers.handleContextMenuCopyRowAsSql
        )}
        onDataGridExpandedChange={setIsDataGridExpanded}
        openRowIndex={openRowIndex}
        pkColumnSet={pkColumnSet}
        recordTitle={recordTitle}
        resultColumns={resultColumns}
        rows={rows}
        setOpenRowIndex={setOpenRowIndex}
      />
    </DataValueDialogProvider>
  );
}

export { ResultDataGrid };
