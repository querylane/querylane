"use client";

import { Maximize2 } from "lucide-react";
import {
  type ClipboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import "react-data-grid/lib/styles.css";
import {
  type CellCopyArgs,
  type CellMouseArgs,
  type CellMouseEvent,
  type CellSelectArgs,
  type Column,
  SELECT_COLUMN_KEY,
  SelectColumn,
  type SortColumn,
} from "react-data-grid";
import { toast } from "sonner";
import { AppInlineError } from "@/components/app-error-view";
import { CellContextMenu } from "@/components/data-grid/table-data-grid/cell-context-menu";
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
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import {
  buildColumn,
  buildPageLabel,
} from "@/components/data-grid/table-data-grid/grid-helpers";
import { GridBody } from "@/components/data-grid/table-data-grid/grid-rendering";
import {
  EXPAND_COLUMN_KEY,
  EXPAND_COLUMN_WIDTH,
  fallbackRowKey,
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import { GridStatusBar } from "@/components/data-grid/table-data-grid/grid-status-bar";
import { GridSurface } from "@/components/data-grid/table-data-grid/grid-surface";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { RecordDetailDrawer } from "@/components/data-grid/table-data-grid/record-detail-drawer";
import { useTableColumnLayout } from "@/components/data-grid/table-data-grid/use-table-column-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatLastFetchedLabel } from "@/features/data-explorer/last-fetched-label";
import {
  serializeTableFilterSearch,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import {
  buildGridStatusItems,
  type GridStatusItem,
} from "@/features/data-explorer/table-data/grid-status";
import {
  buildExport,
  type ExportFormat,
  type ExportResult,
  formatCellForClipboard,
  type SelectedRow,
} from "@/features/data-explorer/table-data/selection-formatters";
import { toggleColumnSortDirection } from "@/features/data-explorer/table-data/sort-state";
import {
  serializeSortSearch,
  useTableDataQuery,
} from "@/features/data-explorer/table-data/table-data-query";
import {
  type RefreshIntervalMs,
  useRefreshSettingsStore,
} from "@/features/user-settings/refresh-settings";
import { parseTableQualifiedName } from "@/lib/console-resources";
import { downloadBlob } from "@/lib/download-blob";
import { HIGH_VOLUME_PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { normalizeAppUiError } from "@/lib/ui-error";
import { cn } from "@/lib/utils";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { RowIdentity_Source } from "@/protogen/querylane/console/v1alpha1/table_pb";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

type TableSearchControlProps =
  | {
      filterSearch?: never;
      onFilterSearchChange?: never;
    }
  | {
      filterSearch: string | undefined;
      onFilterSearchChange: (next: string | undefined) => void;
    };

type TableSortControlProps =
  | {
      onSortSearchChange?: never;
      sortSearch?: never;
    }
  | {
      onSortSearchChange: (next: string | undefined) => void;
      sortSearch: string | undefined;
    };

// These "*Search" props are a controlled-state escape hatch for callers that
// intentionally own grid state. Data Explorer production wiring omits them:
// table filters, sort, selected rows, page size, frozen columns, and row drawer
// state stay local per docs/adr/frontend-url-state-policy.md.
type TableDataGridProps = {
  children?: (state: {
    grid: ReactNode;
    lastFetchedLabel: string;
  }) => ReactNode;
  foreignKeyReferences?: readonly TableForeignKeyReference[] | undefined;
  frozenColumnsSearch?: string | undefined;
  initialPageSize?: number | undefined;
  name: string;
  onCellSearchChange?: (next: string | undefined) => void;
  onFrozenColumnsSearchChange?: (next: string | undefined) => void;
  onOpenRowSearchChange?: (next: string | undefined) => void;
  onPageSizeSearchChange?: (next: number | undefined) => void;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
  onSelectedRowsSearchChange?: (next: string | undefined) => void;
  openRowSearch?: string | undefined;
  pageSizeSearch?: number | undefined;
  selectedRowsSearch?: string | undefined;
} & TableSearchControlProps &
  TableSortControlProps;

interface ContextMenuState {
  columnKey: string;
  left: number;
  returnFocusTo: HTMLElement;
  row: GridRow;
  top: number;
}

const DEFAULT_PAGE_SIZE = 50;

function decodeUrlList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value.split(",").flatMap((part) => {
    try {
      const decoded = decodeURIComponent(part);
      return decoded ? [decoded] : [];
    } catch {
      return [];
    }
  });
}

function encodeUrlList(values: Iterable<string>): string | undefined {
  const encoded: string[] = [];
  for (const value of values) {
    if (value) {
      encoded.push(encodeURIComponent(value));
    }
  }
  return encoded.length > 0 ? encoded.join(",") : undefined;
}

function encodeSelectedCellSearch({
  columnKey,
  rowKey,
}: {
  columnKey: string;
  rowKey: string;
}): string {
  return `${encodeURIComponent(rowKey)}:${encodeURIComponent(columnKey)}`;
}

function reportAutoRefreshError(error: unknown) {
  toast.error("Auto refresh failed", {
    description:
      error instanceof Error
        ? error.message
        : "Refresh the table manually to try again.",
  });
}

function useAutoRefresh({
  dataUpdatedAt,
  intervalMs,
  isFetching,
  onRefresh,
}: {
  dataUpdatedAt: number;
  intervalMs: RefreshIntervalMs;
  isFetching: boolean;
  onRefresh: () => Promise<unknown> | undefined;
}) {
  const [manualRefreshAt, setManualRefreshAt] = useState(0);
  const refreshRef = useRef(onRefresh);
  const timerEpochMs = Math.max(dataUpdatedAt, manualRefreshAt);

  useEffect(function keepRefreshHandlerCurrent() {
    refreshRef.current = onRefresh;
  });

  useEffect(
    function scheduleAutoRefresh() {
      if (intervalMs === null || isFetching) {
        return;
      }
      const startAt = timerEpochMs > 0 ? timerEpochMs : Date.now();
      const remaining = Math.max(0, startAt + intervalMs - Date.now());
      const timeoutId = window.setTimeout(() => {
        setManualRefreshAt(Date.now());
        Promise.resolve(refreshRef.current()).catch(reportAutoRefreshError);
      }, remaining);
      return () => window.clearTimeout(timeoutId);
    },
    [intervalMs, isFetching, timerEpochMs]
  );

  function refreshNow() {
    setManualRefreshAt(Date.now());
    return refreshRef.current();
  }

  return {
    refreshNow,
  };
}

function useDataGridRefreshState({
  dataUpdatedAt,
  isFetching,
  refetch,
}: {
  dataUpdatedAt: number;
  isFetching: boolean;
  refetch: () => Promise<unknown> | undefined;
}) {
  const refreshIntervalMs = useRefreshSettingsStore(
    (state) => state.refreshIntervalMs
  );
  const autoRefresh = useAutoRefresh({
    dataUpdatedAt,
    intervalMs: refreshIntervalMs,
    isFetching,
    onRefresh: refetch,
  });
  return {
    lastFetchedLabel: formatLastFetchedLabel(dataUpdatedAt),
    refreshNow: autoRefresh.refreshNow,
  };
}

function useLocalSearchValue({
  externalValue,
  onExternalChange,
}: {
  externalValue: string | undefined;
  onExternalChange: ((next: string | undefined) => void) | undefined;
}) {
  const [localValue, setLocalValue] = useState(externalValue);

  function setValue(next: string | undefined) {
    if (onExternalChange) {
      onExternalChange(next);
      return;
    }
    setLocalValue(next);
  }

  return [onExternalChange ? externalValue : localValue, setValue] as const;
}

function useResetSelectionOnNavigation({
  currentPageIndex,
  filterLogic,
  name,
  pageSize,
  resetSelection,
  sortColumns,
  filterRules,
}: {
  currentPageIndex: number;
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  name: string;
  pageSize: number;
  resetSelection: () => void;
  sortColumns: SortColumn[];
}) {
  const resetCurrentSelection = useEffectEvent(resetSelection);
  const navigationStateKey = `${name}:${currentPageIndex}:${pageSize}:${
    serializeTableFilterSearch({ logic: filterLogic, rules: filterRules }) ?? ""
  }:${serializeSortSearch(sortColumns) ?? ""}`;
  const previousNavigationStateKeyRef = useRef(navigationStateKey);

  // Selection and the open record drawer are page-scoped: prior keys don't map
  // across page/sort changes. Compare committed navigation keys so StrictMode's
  // mount-effect replay stays a no-op, and keep state/callback refs out of the
  // navigation dependencies because the URL-sync wrappers change each render.
  useEffect(
    function resetSelectionOnPageChange() {
      if (previousNavigationStateKeyRef.current === navigationStateKey) {
        return;
      }
      previousNavigationStateKeyRef.current = navigationStateKey;
      resetCurrentSelection();
    },
    [navigationStateKey]
  );
}

function useSelectedRowsUrlState({
  onSelectedRowsSearchChange,
  selectedRowsSearch,
}: {
  onSelectedRowsSearchChange: (next: string | undefined) => void;
  selectedRowsSearch: string | undefined;
}) {
  const [selectedRowsState, setSelectedRowsState] = useState<{
    rows: ReadonlySet<string>;
    search: string | undefined;
  }>(() => ({
    rows: new Set(decodeUrlList(selectedRowsSearch)),
    search: selectedRowsSearch,
  }));

  if (selectedRowsState.search !== selectedRowsSearch) {
    setSelectedRowsState({
      rows: new Set(decodeUrlList(selectedRowsSearch)),
      search: selectedRowsSearch,
    });
  }

  function setSelectedRows(next: ReadonlySet<string>) {
    setSelectedRowsState({ rows: next, search: selectedRowsSearch });
    onSelectedRowsSearchChange(encodeUrlList(next));
  }

  return {
    selectedRows: selectedRowsState.rows,
    setSelectedRows,
  };
}

function useFrozenColumnsUrlState({
  frozenColumnsSearch,
  onFrozenColumnsSearchChange,
}: {
  frozenColumnsSearch: string | undefined;
  onFrozenColumnsSearchChange: (next: string | undefined) => void;
}) {
  const [frozenColumnsState, setFrozenColumnsState] = useState<{
    columns: ReadonlySet<string>;
    search: string | undefined;
  }>(() => ({
    columns: new Set(decodeUrlList(frozenColumnsSearch)),
    search: frozenColumnsSearch,
  }));

  if (frozenColumnsState.search !== frozenColumnsSearch) {
    setFrozenColumnsState({
      columns: new Set(decodeUrlList(frozenColumnsSearch)),
      search: frozenColumnsSearch,
    });
  }

  function setFrozenColumns(next: ReadonlySet<string>) {
    setFrozenColumnsState({ columns: next, search: frozenColumnsSearch });
    onFrozenColumnsSearchChange(encodeUrlList(next));
  }

  return {
    frozenColumns: frozenColumnsState.columns,
    setFrozenColumns,
  };
}

function useOpenRowUrlState({
  onOpenRowSearchChange,
  openRowSearch,
  rows,
}: {
  onOpenRowSearchChange: (next: string | undefined) => void;
  openRowSearch: string | undefined;
  rows: GridRow[];
}) {
  const [openRowState, setOpenRowState] = useState<{
    rowKey: string | null;
    search: string | undefined;
  }>(() => ({
    rowKey: openRowSearch ?? null,
    search: openRowSearch,
  }));

  if (openRowState.search !== openRowSearch) {
    setOpenRowState({
      rowKey: openRowSearch ?? null,
      search: openRowSearch,
    });
  }

  const openRowIndex =
    openRowState.rowKey === null
      ? null
      : rows.findIndex((row) => row[ROW_KEY_FIELD] === openRowState.rowKey);
  const resolvedOpenRowIndex =
    openRowIndex !== null && openRowIndex >= 0 ? openRowIndex : null;

  function rowKeyAt(index: number | null) {
    return index === null ? undefined : rows[index]?.[ROW_KEY_FIELD];
  }

  function setOpenRowIndex(next: number | null) {
    const nextRowKey = rowKeyAt(next);
    setOpenRowState((previous) => {
      const rowKey = nextRowKey ?? null;
      if (previous.rowKey === rowKey && previous.search === openRowSearch) {
        return previous;
      }
      return { rowKey, search: openRowSearch };
    });
    onOpenRowSearchChange(nextRowKey);
  }

  return {
    openRowIndex: resolvedOpenRowIndex,
    setOpenRowIndex,
  };
}

function usePageSizeUrlState({
  initialPageSize,
  onPageSizeSearchChange,
  pageSizeSearch,
}: {
  initialPageSize: number;
  onPageSizeSearchChange: (next: number | undefined) => void;
  pageSizeSearch: number | undefined;
}) {
  const [pageSizeState, setPageSizeState] = useState<{
    pageSize: number;
    search: number | undefined;
  }>(() => ({
    pageSize: pageSizeSearch ?? initialPageSize,
    search: pageSizeSearch,
  }));

  if (pageSizeState.search !== pageSizeSearch) {
    setPageSizeState({
      pageSize: pageSizeSearch ?? initialPageSize,
      search: pageSizeSearch,
    });
  }

  function setPageSize(next: number) {
    setPageSizeState({ pageSize: next, search: pageSizeSearch });
    onPageSizeSearchChange(next === DEFAULT_PAGE_SIZE ? undefined : next);
  }

  return {
    pageSize: pageSizeState.pageSize,
    setPageSize,
  };
}

// Stable empties keep row/column derivations referentially equal across
// renders while data is undefined, so the React Compiler can memoize
// buildGridRows and everything downstream of it.
const EMPTY_RESULT_COLUMNS: TableResultColumn[] = [];
const EMPTY_RESULT_ROWS: Array<{ rowKey: string; values: TableCell[] }> = [];
// Stable default so the grid columns are not rebuilt every render for tables
// without foreign keys.
const NO_FOREIGN_KEY_REFERENCES: readonly TableForeignKeyReference[] = [];

function buildGridRows(
  resultRows: Array<{ rowKey: string; values: TableCell[] }>,
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
}: {
  name: string;
  openRowIndex: number | null;
  pkColumnSet: Set<string>;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  setOpenRowIndex: (next: number | null) => void;
}) {
  const tableQualifiedName = parseTableQualifiedName(name);
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
      tableName={tableQualifiedName}
    />
  );
}

function collectSelectedRows({
  resultColumns,
  rows,
  selectedRows,
}: {
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
}): SelectedRow[] {
  if (selectedRows.size === 0) {
    return [];
  }

  const collected: SelectedRow[] = [];
  for (const row of rows) {
    if (!selectedRows.has(row[ROW_KEY_FIELD])) {
      continue;
    }
    const cells = new Map<string, TableCell | undefined>();
    for (const column of resultColumns) {
      cells.set(column.columnName, getGridCell(row, column));
    }
    collected.push({ cells });
  }
  return collected;
}

function reportTruncatedExport(result: ExportResult & { ok: false }) {
  const rowWord = result.truncatedRowCount === 1 ? "row" : "rows";
  toast.error(
    `Can't export ${result.truncatedRowCount} selected ${rowWord} with truncated values`,
    {
      description:
        "Open the row drawer to fetch full cell values, or narrow your selection.",
    }
  );
}

function TableDataGridAlerts({
  invalidFilterRules,
  onClearFilters,
  onRetry,
  queryError,
}: {
  invalidFilterRules: Array<{ id: string; message: string }>;
  onClearFilters: () => void;
  onRetry: () => Promise<unknown> | undefined;
  queryError: Error | null;
}) {
  if (queryError) {
    return (
      <AppInlineError
        error={normalizeAppUiError(queryError, {
          action: "read_rows",
          area: "data-explorer.table-data-grid.rows",
          endpoint: "ReadRows",
          source: "query",
          surface: "inline",
        })}
        onRetry={onRetry}
        retryLabel="Retry"
      />
    );
  }
  if (invalidFilterRules.length > 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle aria-level={2} role="heading">
          Filter not applied
        </AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            {invalidFilterRules.map((rule) => (
              <li key={rule.id}>{rule.message}</li>
            ))}
          </ul>
          <Button
            className="mt-2"
            onClick={onClearFilters}
            size="sm"
            type="button"
            variant="outline"
          >
            Clear filters
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

interface TableDataGridChromeProps {
  columnOrder: readonly string[];
  columns: Column<GridRow>[];
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  filterTitle: string;
  hiddenColumnKeys: ReadonlySet<string>;
  invalidFilterRules: Array<{ id: string; message: string }>;
  isColumnLayoutCustomized: boolean;
  lastFetchedLabel: string;
  onCellContextMenu: (
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) => void;
  onCellCopy: (
    args: CellCopyArgs<GridRow>,
    event: ClipboardEvent<HTMLDivElement>
  ) => void;
  onClearFilters: () => void;
  onClearSelection: () => void;
  onColumnLayoutReset: () => void;
  onColumnOrderChange: (columnOrder: string[]) => void;
  onColumnsReorder: (sourceColumnKey: string, targetColumnKey: string) => void;
  onColumnVisibilityChange: (columnKey: string, visible: boolean) => void;
  onCopySelection: (format: ExportFormat) => void;
  onExportSelection: (format: ExportFormat) => void;
  onFilterChange: (
    nextRules: TableFilterRule[],
    nextLogic?: TableFilterLogic
  ) => void;
  onNext: () => void;
  onPageSizeChange: (next: number) => void;
  onPrev: () => void;
  onRefresh: () => Promise<unknown> | undefined;
  onSelectedCellChange: (args: CellSelectArgs<GridRow>) => void;
  onSelectedRowsChange: (next: ReadonlySet<string>) => void;
  onSortChange: (next: SortColumn[]) => void;
  onToggleExpanded: () => void;
  queryError: Error | null;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  selectedCount: number;
  selectedRows: ReadonlySet<string>;
  sortColumns: SortColumn[];
  state: {
    currentPageIndex: number;
    gridLoading: boolean;
    hasNext: boolean;
    isFetching: boolean;
    isRefetchingRows: boolean;
    pageLabel: string;
    pageSize: number;
    variant: "default" | "expanded";
  };
  statusItems: GridStatusItem[];
}

function TableDataGridChrome({
  columnOrder,
  columns,
  filterLogic,
  filterRules,
  filterTitle,
  invalidFilterRules,
  hiddenColumnKeys,
  isColumnLayoutCustomized,
  lastFetchedLabel,
  onCellContextMenu,
  onCellCopy,
  onClearFilters,
  onClearSelection,
  onColumnOrderChange,
  onColumnLayoutReset,
  onColumnsReorder,
  onColumnVisibilityChange,
  onCopySelection,
  onExportSelection,
  onFilterChange,
  onNext,
  onPageSizeChange,
  onPrev,
  onRefresh,
  onSelectedCellChange,
  onSelectedRowsChange,
  onSortChange,
  onToggleExpanded,
  queryError,
  resultColumns,
  rows,
  selectedCount,
  selectedRows,
  sortColumns,
  state,
  statusItems,
}: TableDataGridChromeProps) {
  // Default variant renders full-bleed inside the explorer pane: the toolbar,
  // status bar, and pagination become padded bars while the grid itself runs
  // edge-to-edge. The expanded dialog keeps the inset, rounded look.
  const isFlush = state.variant !== "expanded";
  return (
    <>
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2",
          isFlush && "px-3 pt-2 pb-2 sm:px-4"
        )}
      >
        <DataGridToolbar
          className={state.variant === "expanded" ? "pr-12" : undefined}
          columnOrder={columnOrder}
          columns={resultColumns}
          filterLogic={filterLogic}
          filterRules={filterRules}
          filterTitle={filterTitle}
          hiddenColumnKeys={hiddenColumnKeys}
          isColumnLayoutCustomized={isColumnLayoutCustomized}
          isExpanded={state.variant === "expanded"}
          isFetching={state.isFetching}
          lastFetchedLabel={lastFetchedLabel}
          onClearSelection={onClearSelection}
          onColumnLayoutReset={onColumnLayoutReset}
          onColumnOrderChange={onColumnOrderChange}
          onColumnVisibilityChange={onColumnVisibilityChange}
          onCopySelection={onCopySelection}
          onExportSelection={onExportSelection}
          onFilterChange={onFilterChange}
          onRefresh={onRefresh}
          onSortChange={onSortChange}
          onToggleExpanded={onToggleExpanded}
          selectedCount={selectedCount}
          sortColumns={sortColumns}
        />

        <TableDataGridAlerts
          invalidFilterRules={invalidFilterRules}
          onClearFilters={onClearFilters}
          onRetry={onRefresh}
          queryError={queryError}
        />
      </div>

      <GridSurface
        busy={state.isRefetchingRows}
        loading={state.gridLoading || state.isRefetchingRows}
        refreshStatusLabel={lastFetchedLabel}
        variant={state.variant}
      >
        <GridBody
          columns={columns}
          flush={isFlush}
          hasActiveFilter={filterRules.length > 0}
          isLoading={state.gridLoading}
          onCellContextMenu={onCellContextMenu}
          onCellCopy={onCellCopy}
          onColumnsReorder={onColumnsReorder}
          onSelectedCellChange={onSelectedCellChange}
          onSelectedRowsChange={onSelectedRowsChange}
          onSortChange={onSortChange}
          rows={rows}
          selectedRows={selectedRows}
          sortColumns={sortColumns}
        />
      </GridSurface>

      <GridStatusBar
        className={isFlush ? "border-t-0 px-3 pt-1.5 sm:px-4" : undefined}
        items={statusItems}
      />

      <PaginationFooter
        className={isFlush ? "px-3 py-2 sm:px-4" : undefined}
        hasNext={state.hasNext}
        hasPrev={state.currentPageIndex > 0}
        onNext={onNext}
        onPageSizeChange={onPageSizeChange}
        onPrev={onPrev}
        pageLabel={state.pageLabel}
        pageSize={state.pageSize}
        pageSizeOptions={HIGH_VOLUME_PAGE_SIZE_OPTIONS}
      />
    </>
  );
}

function ExpandedDataGridDialog({
  chromeProps,
  onOpenChange,
  open,
}: {
  chromeProps: TableDataGridChromeProps;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="!flex !max-w-[calc(100vw-1rem)] sm:!max-w-[calc(100vw-2rem)] h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col gap-3 overflow-hidden p-3 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:p-4">
        <DialogTitle className="sr-only">Expanded data grid</DialogTitle>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <TableDataGridChrome
            {...chromeProps}
            onToggleExpanded={() => onOpenChange(false)}
            state={{ ...chromeProps.state, variant: "expanded" }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function copyCellValue(
  row: GridRow,
  resultColumns: TableResultColumn[],
  columnKey: string
) {
  const meta = resultColumns.find((column) => column.columnName === columnKey);
  if (!meta) {
    return;
  }
  const cell = getGridCell(row, meta);
  if (cell === undefined) {
    return;
  }
  writeClipboard(formatCellForClipboard(cell));
}

function copyRowValues(row: GridRow, resultColumns: TableResultColumn[]) {
  const parts = resultColumns.map((meta) =>
    formatCellForClipboard(getGridCell(row, meta))
  );
  writeClipboard(parts.join("\t"));
}

function isNodeInside(parent: Node, child: Node | null): boolean {
  return child !== null && parent.contains(child);
}

function hasActiveTextSelectionInsideGrid(
  event: ClipboardEvent<HTMLDivElement> | undefined
): boolean {
  if (!event) {
    return false;
  }
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    selection.toString().length === 0
  ) {
    return false;
  }
  return (
    isNodeInside(event.currentTarget, selection.anchorNode) ||
    isNodeInside(event.currentTarget, selection.focusNode)
  );
}

function useSelectionActions({
  name,
  resultColumns,
  rows,
  selectedRows,
  setSelectedRows,
}: {
  name: string;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  selectedRows: ReadonlySet<string>;
  setSelectedRows: (next: ReadonlySet<string>) => void;
}) {
  const clearSelection = () => setSelectedRows(new Set());
  const selected = () =>
    collectSelectedRows({ resultColumns, rows, selectedRows });

  return {
    clearSelection,
    copyCellValue: (row: GridRow, columnKey: string) =>
      copyCellValue(row, resultColumns, columnKey),
    copyRowAsSqlInsert: (row: GridRow) => {
      const cells = new Map<string, TableCell | undefined>();
      for (const column of resultColumns) {
        cells.set(column.columnName, getGridCell(row, column));
      }
      const result = buildExport({
        exportFormat: "sql",
        rows: [{ cells }],
        columns: resultColumns,
        resourceName: name,
      });
      if (!result.ok) {
        reportTruncatedExport(result);
        return;
      }
      writeClipboard(result.payload.contents);
    },
    copyRowValues: (row: GridRow) => copyRowValues(row, resultColumns),
    handleCellCopy: (
      { row, column }: CellCopyArgs<GridRow>,
      event?: ClipboardEvent<HTMLDivElement>
    ) => {
      if (hasActiveTextSelectionInsideGrid(event)) {
        return;
      }
      copyCellValue(row, resultColumns, column.key);
    },
    handleCopySelection: (exportFormat: ExportFormat) => {
      const selectedForExport = selected();
      if (selectedForExport.length === 0) {
        return;
      }
      const result = buildExport({
        exportFormat,
        rows: selectedForExport,
        columns: resultColumns,
        resourceName: name,
      });
      if (!result.ok) {
        reportTruncatedExport(result);
        return;
      }
      writeClipboard(result.payload.contents);
    },
    handleExportSelection: (exportFormat: ExportFormat) => {
      const selectedForExport = selected();
      if (selectedForExport.length === 0) {
        return;
      }
      const result = buildExport({
        exportFormat,
        rows: selectedForExport,
        columns: resultColumns,
        resourceName: name,
      });
      if (!result.ok) {
        reportTruncatedExport(result);
        return;
      }
      downloadBlob(
        result.payload.filename,
        result.payload.contents,
        result.payload.mimeType
      );
    },
  };
}

function useGridColumns({
  displayColumns,
  foreignKeyReferences,
  frozenColumns,
  onFrozenColumnsChange,
  onHideColumn,
  renderOpenReferencedTableLink,
  resultColumns,
  rowIdentity,
  setOpenRowIndex,
  setSortColumns,
  sortColumns,
}: {
  displayColumns: TableResultColumn[];
  foreignKeyReferences: readonly TableForeignKeyReference[];
  frozenColumns: ReadonlySet<string>;
  onFrozenColumnsChange: (next: ReadonlySet<string>) => void;
  onHideColumn: (columnKey: string) => void;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
  resultColumns: TableResultColumn[];
  rowIdentity:
    | { columnNames: string[]; source: RowIdentity_Source }
    | null
    | undefined;
  setOpenRowIndex: (next: number) => void;
  setSortColumns: (next: SortColumn[]) => void;
  sortColumns: SortColumn[];
}): { columns: Column<GridRow>[]; pkColumnSet: Set<string> } {
  const pkColumnSet = new Set(
    rowIdentity && rowIdentity.source === RowIdentity_Source.PRIMARY_KEY
      ? rowIdentity.columnNames
      : []
  );

  function toggleColumnSort(columnKey: string, direction: "ASC" | "DESC") {
    setSortColumns(
      toggleColumnSortDirection({
        columnKey,
        direction,
        sortColumns,
      })
    );
  }

  function toggleColumnFreeze(columnKey: string) {
    const next = new Set(frozenColumns);
    if (next.has(columnKey)) {
      next.delete(columnKey);
    } else {
      next.add(columnKey);
    }
    onFrozenColumnsChange(next);
  }

  // Always pin the action region (select → expand) to the left so the row
  // checkbox and expand affordance stay reachable while the data columns scroll
  // horizontally. Frozen data columns, when present, extend the same sticky
  // block immediately to the right.
  const columns: Column<GridRow>[] = [
    {
      ...SelectColumn,
      cellClass: "rdg-select-cell rdg-checkbox-cell",
      frozen: true,
      headerCellClass: "rdg-select-cell rdg-checkbox-cell",
    },
    {
      cellClass: "rdg-select-cell rdg-expand-cell",
      frozen: true,
      headerCellClass: "rdg-select-cell rdg-expand-cell",
      key: EXPAND_COLUMN_KEY,
      maxWidth: EXPAND_COLUMN_WIDTH,
      minWidth: EXPAND_COLUMN_WIDTH,
      name: "",
      renderCell: ({ rowIdx }) => (
        <Button
          aria-label="Expand row"
          className="rdg-expand-button mr-auto text-muted-foreground"
          onClick={() => setOpenRowIndex(rowIdx)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Maximize2 />
        </Button>
      ),
      renderHeaderCell: () => null,
      resizable: false,
      sortable: false,
      width: EXPAND_COLUMN_WIDTH,
    },
    ...displayColumns.map((column) => {
      const sortIndex = sortColumns.findIndex(
        (sc) => sc.columnKey === column.columnName
      );
      const sortEntry = sortIndex === -1 ? undefined : sortColumns[sortIndex];
      return buildColumn({
        canHide: displayColumns.length > 1,
        column,
        foreignKeyReferences,
        isFrozen: frozenColumns.has(column.columnName),
        onCopyName: () => writeClipboard(column.columnName),
        onHide: () => onHideColumn(column.columnName),
        onSortAsc: () => toggleColumnSort(column.columnName, "ASC"),
        onSortDesc: () => toggleColumnSort(column.columnName, "DESC"),
        onToggleFreeze: () => toggleColumnFreeze(column.columnName),
        pkColumnSet,
        renderOpenReferencedTableLink,
        resultColumns,
        sortDirection: sortEntry?.direction,
        sortPriority:
          sortIndex !== -1 && sortColumns.length > 1
            ? sortIndex + 1
            : undefined,
      });
    }),
  ];

  return { columns, pkColumnSet };
}

function TableDataGridContent({
  chromeProps,
  contextMenu,
  isDataGridExpanded,
  name,
  onCloseContextMenu,
  onContextMenuCopyCell,
  onContextMenuCopyRow,
  onContextMenuCopyRowAsSql,
  onDataGridExpandedChange,
  openRowIndex,
  pkColumnSet,
  resultColumns,
  rows,
  setOpenRowIndex,
}: {
  chromeProps: TableDataGridChromeProps;
  contextMenu: ContextMenuState | null;
  isDataGridExpanded: boolean;
  name: string;
  onCloseContextMenu: () => void;
  onContextMenuCopyCell: () => void;
  onContextMenuCopyRow: () => void;
  onContextMenuCopyRowAsSql: () => void;
  onDataGridExpandedChange: (next: boolean) => void;
  openRowIndex: number | null;
  pkColumnSet: Set<string>;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
  setOpenRowIndex: (next: number | null) => void;
}) {
  // Parent table tabs own the available height; keep RDG at that finite height
  // so row virtualization stays active. Spacing between chrome pieces comes
  // from the flush bars' own padding, not a flex gap.
  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <TableDataGridChrome {...chromeProps} />
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
      />
    </div>
  );
}

// Grid cell mouse/selection handlers plus the context-menu copy actions. Built
// per render from the current rows and menu position; hoisted out of
// TableDataGrid to keep the component itself readable.
function buildCellInteractionHandlers({
  contextMenu,
  onCellSearchChange,
  selectionActions,
  setContextMenu,
}: {
  contextMenu: ContextMenuState | null;
  onCellSearchChange: (next: string | undefined) => void;
  selectionActions: ReturnType<typeof useSelectionActions>;
  setContextMenu: (next: ContextMenuState | null) => void;
}) {
  function handleCellContextMenu(
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) {
    if (
      args.column.key === SELECT_COLUMN_KEY ||
      args.column.key === EXPAND_COLUMN_KEY
    ) {
      return;
    }
    event.preventGridDefault();
    event.preventDefault();
    setContextMenu({
      columnKey: args.column.key,
      left: event.clientX,
      returnFocusTo: event.currentTarget,
      row: args.row,
      top: event.clientY,
    });
  }

  function handleSelectedCellChange(args: CellSelectArgs<GridRow>) {
    if (
      !args.row ||
      args.column.key === SELECT_COLUMN_KEY ||
      args.column.key === EXPAND_COLUMN_KEY
    ) {
      onCellSearchChange(undefined);
      return;
    }
    onCellSearchChange(
      encodeSelectedCellSearch({
        columnKey: args.column.key,
        rowKey: args.row[ROW_KEY_FIELD],
      })
    );
  }

  function handleContextMenuCopyCell() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyCellValue(contextMenu.row, contextMenu.columnKey);
  }

  function handleContextMenuCopyRow() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyRowValues(contextMenu.row);
  }

  function handleContextMenuCopyRowAsSql() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyRowAsSqlInsert(contextMenu.row);
  }

  return {
    handleCellContextMenu,
    handleContextMenuCopyCell,
    handleContextMenuCopyRow,
    handleContextMenuCopyRowAsSql,
    handleSelectedCellChange,
  };
}

function TableDataGrid({
  children,
  foreignKeyReferences = NO_FOREIGN_KEY_REFERENCES,
  name,
  filterSearch,
  frozenColumnsSearch,
  initialPageSize = DEFAULT_PAGE_SIZE,
  onCellSearchChange = () => undefined,
  onFilterSearchChange,
  onFrozenColumnsSearchChange = () => undefined,
  onOpenRowSearchChange = () => undefined,
  onPageSizeSearchChange = () => undefined,
  renderOpenReferencedTableLink,
  onSelectedRowsSearchChange = () => undefined,
  onSortSearchChange,
  openRowSearch,
  pageSizeSearch,
  selectedRowsSearch,
  sortSearch,
}: TableDataGridProps) {
  const tableQualifiedName = parseTableQualifiedName(name);
  const [effectiveFilterSearch, setEffectiveFilterSearch] = useLocalSearchValue(
    {
      externalValue: filterSearch,
      onExternalChange: onFilterSearchChange,
    }
  );
  const [effectiveSortSearch, setEffectiveSortSearch] = useLocalSearchValue({
    externalValue: sortSearch,
    onExternalChange: onSortSearchChange,
  });
  const { pageSize, setPageSize } = usePageSizeUrlState({
    initialPageSize,
    onPageSizeSearchChange,
    pageSizeSearch,
  });
  const {
    controller,
    error: queryStateError,
    filterLogic,
    filterRules,
    invalidFilterRules,
    isLoading: isQueryStateValidationLoading,
    refetch,
    rowsQuery,
  } = useTableDataQuery({
    filterSearch: effectiveFilterSearch,
    name,
    onFilterSearchChange: setEffectiveFilterSearch,
    onPageSizeChange: setPageSize,
    onSortSearchChange: setEffectiveSortSearch,
    pageSize,
    sortSearch: effectiveSortSearch,
  });
  const {
    data,
    dataUpdatedAt = 0,
    error,
    isFetching,
    isLoading,
    isPlaceholderData,
  } = rowsQuery;
  const refreshState = useDataGridRefreshState({
    dataUpdatedAt,
    isFetching,
    refetch,
  });
  const gridLoading = isLoading || isQueryStateValidationLoading;
  // A page/sort/filter change starts a new request while `placeholderData`
  // keeps the prior rows on screen (isPlaceholderData). Dim those rows and
  // float a refreshing pill so slow loads read as "loading" without losing
  // continuity. Gated on isPlaceholderData rather than raw isFetching so a
  // same-key refetch — the toolbar Refresh button or a reconnect — doesn't
  // grey out and disable unchanged rows (the toolbar spinner covers those).
  const isRefetchingRows = isPlaceholderData && !gridLoading;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isDataGridExpanded, setIsDataGridExpanded] = useState(false);
  const { selectedRows, setSelectedRows } = useSelectedRowsUrlState({
    onSelectedRowsSearchChange,
    selectedRowsSearch,
  });

  const resultColumns = data?.resultSet?.columns ?? EMPTY_RESULT_COLUMNS;
  const resultRows = data?.resultSet?.rows ?? EMPTY_RESULT_ROWS;
  const rowCount = data?.resultSet?.rowCount;
  const rows = buildGridRows(resultRows, resultColumns);
  const { openRowIndex, setOpenRowIndex } = useOpenRowUrlState({
    onOpenRowSearchChange,
    openRowSearch,
    rows,
  });

  useResetSelectionOnNavigation({
    currentPageIndex: controller.currentPageIndex,
    filterLogic,
    filterRules,
    name,
    pageSize: controller.pageSize,
    resetSelection: () => {
      if (selectedRows.size > 0) {
        setSelectedRows(new Set());
      }
      if (openRowIndex !== null) {
        setOpenRowIndex(null);
      }
    },
    sortColumns: controller.sortColumns,
  });

  const { frozenColumns, setFrozenColumns } = useFrozenColumnsUrlState({
    frozenColumnsSearch,
    onFrozenColumnsSearchChange,
  });

  const columnLayout = useTableColumnLayout({
    columns: resultColumns,
    hasResultSet: data?.resultSet !== undefined,
    tableName: name,
  });

  const { columns, pkColumnSet } = useGridColumns({
    displayColumns: columnLayout.displayColumns,
    foreignKeyReferences,
    frozenColumns,
    onFrozenColumnsChange: setFrozenColumns,
    onHideColumn: (columnKey) =>
      columnLayout.setColumnVisibility(columnKey, false),
    renderOpenReferencedTableLink,
    resultColumns,
    rowIdentity: data?.resultSet?.rowIdentity,
    setOpenRowIndex,
    setSortColumns: controller.setSortColumns,
    sortColumns: controller.sortColumns,
  });

  const pageLabel =
    resultRows.length === 0
      ? "Page 1 of 1"
      : buildPageLabel({
          pageIndex: controller.currentPageIndex,
          pageSize: controller.pageSize,
          rowCount,
        });
  const hasNext = (data?.nextPageToken ?? "") !== "" && !isFetching;
  const statusItems = data?.resultSet
    ? buildGridStatusItems({
        hasNext,
        limits: data.limits,
        pageSize: controller.pageSize,
        paginationStrategy: data.resultSet.paginationStrategy,
        rowIdentity: data.resultSet.rowIdentity,
        rowsReturned: resultRows.length,
      })
    : [];
  const selectionActions = useSelectionActions({
    name,
    resultColumns,
    rows,
    selectedRows,
    setSelectedRows,
  });

  const cellHandlers = buildCellInteractionHandlers({
    contextMenu,
    onCellSearchChange,
    selectionActions,
    setContextMenu,
  });

  function handleSortChange(next: SortColumn[]) {
    controller.setSortColumns(next);
  }

  function handleNext() {
    if (data?.nextPageToken) {
      controller.goNext(data.nextPageToken);
    }
  }

  const handleFilterChange = (
    next: TableFilterRule[],
    nextLogic: TableFilterLogic = filterLogic
  ) =>
    setEffectiveFilterSearch(
      serializeTableFilterSearch({ logic: nextLogic, rules: next })
    );
  const clearFilters = () => setEffectiveFilterSearch(undefined);
  const chromeProps: TableDataGridChromeProps = {
    columnOrder: columnLayout.columnOrder,
    columns,
    filterLogic,
    filterRules,
    filterTitle: `Filter ${tableQualifiedName.schema}.${tableQualifiedName.table}`,
    hiddenColumnKeys: columnLayout.hiddenColumnKeys,
    invalidFilterRules,
    isColumnLayoutCustomized: columnLayout.isCustomized,
    lastFetchedLabel: refreshState.lastFetchedLabel,
    onCellContextMenu: cellHandlers.handleCellContextMenu,
    onCellCopy: selectionActions.handleCellCopy,
    onClearFilters: clearFilters,
    onClearSelection: selectionActions.clearSelection,
    onColumnLayoutReset: columnLayout.reset,
    onColumnOrderChange: columnLayout.setColumnOrder,
    onColumnsReorder: columnLayout.reorderColumns,
    onColumnVisibilityChange: columnLayout.setColumnVisibility,
    onCopySelection: selectionActions.handleCopySelection,
    onExportSelection: selectionActions.handleExportSelection,
    onFilterChange: handleFilterChange,
    onNext: handleNext,
    onPageSizeChange: controller.setPageSize,
    onPrev: controller.goPrev,
    onRefresh: refreshState.refreshNow,
    onSelectedCellChange: cellHandlers.handleSelectedCellChange,
    onSelectedRowsChange: setSelectedRows,
    onSortChange: handleSortChange,
    onToggleExpanded: () => setIsDataGridExpanded(true),
    queryError: queryStateError ?? error,
    resultColumns,
    rows,
    selectedCount: selectedRows.size,
    selectedRows,
    sortColumns: controller.sortColumns,
    state: {
      currentPageIndex: controller.currentPageIndex,
      gridLoading,
      hasNext,
      isFetching,
      isRefetchingRows,
      pageLabel,
      pageSize: controller.pageSize,
      variant: "default",
    },
    statusItems,
  };

  const grid = (
    <DataValueDialogProvider>
      <TableDataGridContent
        chromeProps={chromeProps}
        contextMenu={contextMenu}
        isDataGridExpanded={isDataGridExpanded}
        name={name}
        onCloseContextMenu={() => setContextMenu(null)}
        onContextMenuCopyCell={cellHandlers.handleContextMenuCopyCell}
        onContextMenuCopyRow={cellHandlers.handleContextMenuCopyRow}
        onContextMenuCopyRowAsSql={cellHandlers.handleContextMenuCopyRowAsSql}
        onDataGridExpandedChange={setIsDataGridExpanded}
        openRowIndex={openRowIndex}
        pkColumnSet={pkColumnSet}
        resultColumns={resultColumns}
        rows={rows}
        setOpenRowIndex={setOpenRowIndex}
      />
    </DataValueDialogProvider>
  );

  if (children) {
    return (
      <>
        {children({
          grid,
          lastFetchedLabel: refreshState.lastFetchedLabel,
        })}
      </>
    );
  }

  return grid;
}

export { TableDataGrid };
