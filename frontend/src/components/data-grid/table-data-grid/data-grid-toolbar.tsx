import { Copy, Maximize2, Minimize2, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { SortColumn } from "react-data-grid";
import {
  type CellSelectionStore,
  type CellSelectionSummary as CellSelectionSummaryValue,
  getCellSelectionSummary,
} from "@/components/data-grid/table-data-grid/cell-selection-state";
import { ColumnsPopover } from "@/components/data-grid/table-data-grid/columns-popover";
import { FilterPopover } from "@/components/data-grid/table-data-grid/filter-popover";
import { FilterChips } from "@/components/data-grid/table-data-grid/filter-popover-chips";
import { SelectionActions } from "@/components/data-grid/table-data-grid/selection-actions";
import { SortPopover } from "@/components/data-grid/table-data-grid/sort-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshControl } from "@/components/ui/refresh-control";
import type {
  TableFilterLogic,
  TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { ExportFormat } from "@/features/data-explorer/table-data/selection-formatters";
import { cn } from "@/lib/utils";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface DataGridToolbarProps {
  cellSelectionStore: CellSelectionStore;
  className?: string | undefined;
  columnOrder: readonly string[];
  columns: TableResultColumn[];
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  filterTitle?: string | undefined;
  hiddenColumnKeys: ReadonlySet<string>;
  isColumnLayoutCustomized: boolean;
  isExpanded?: boolean | undefined;
  isFetching: boolean;
  lastFetchedLabel?: string | undefined;
  onClearSelection: () => void;
  onColumnLayoutReset: () => void;
  onColumnOrderChange: (columnOrder: string[]) => void;
  onColumnVisibilityChange: (columnKey: string, visible: boolean) => void;
  onCopyCellSelection: () => void;
  onCopySelection: (format: ExportFormat) => void;
  onExportSelection: (format: ExportFormat) => void;
  onFilterChange: (
    nextRules: TableFilterRule[],
    nextLogic?: TableFilterLogic
  ) => void;
  onRefresh: () => Promise<unknown> | undefined;
  onSortChange: (next: SortColumn[]) => void;
  onToggleExpanded?: (() => void) | undefined;
  selectedCount: number;
  sortColumns: SortColumn[];
}

function pluralizedCount(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function getCellSelectionVisibleLabel(
  summary: CellSelectionSummaryValue
): string {
  if (summary.rangeCount !== 1) {
    return `${pluralizedCount(summary.cellCount, "cell")} · ${pluralizedCount(
      summary.rangeCount,
      "range"
    )}`;
  }
  return `${pluralizedCount(summary.cellCount, "cell")} · ${
    summary.rowCount
  }×${summary.columnCount}`;
}

function getCellSelectionLiveLabel(summary: CellSelectionSummaryValue): string {
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

function CellSelectionSummary({
  cellSelectionStore,
  onCopyCellSelection,
}: Pick<DataGridToolbarProps, "cellSelectionStore" | "onCopyCellSelection">) {
  const state = useSyncExternalStore(
    cellSelectionStore.subscribe,
    cellSelectionStore.getState,
    cellSelectionStore.getState
  );
  const summary = getCellSelectionSummary(state);
  const visibleLabel = getCellSelectionVisibleLabel(summary);
  const liveLabel = getCellSelectionLiveLabel(summary);

  return (
    <>
      <span
        aria-label="Cell selection"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {liveLabel}
      </span>
      {summary.cellCount > 0 ? (
        <div
          className="flex items-center gap-1 text-foreground"
          data-slot="cell-selection-summary"
        >
          <span className="font-medium">{visibleLabel}</span>
          <Button
            aria-label="Copy selected cells"
            className="h-7 gap-1 px-2"
            onClick={onCopyCellSelection}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button
            aria-label="Clear cell selection"
            className="size-7 p-0"
            onClick={cellSelectionStore.clear}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </>
  );
}

function DataGridExpandToggle({
  isExpanded,
  onToggleExpanded,
}: {
  isExpanded: boolean;
  onToggleExpanded: (() => void) | undefined;
}) {
  if (!onToggleExpanded) {
    return null;
  }
  const label = isExpanded ? "Collapse" : "Expand";
  return (
    <Button
      aria-label={`${label} data grid`}
      onClick={onToggleExpanded}
      size="sm"
      title={`${label} data grid`}
      type="button"
      variant="outline"
    >
      {isExpanded ? (
        <Minimize2 className="size-3.5" />
      ) : (
        <Maximize2 className="size-3.5" />
      )}
      {label}
    </Button>
  );
}

function ActiveSortSummary({ summary }: { summary: string | null }) {
  if (!summary) {
    return null;
  }
  return (
    <Badge
      aria-label="Active sort summary"
      className="@3xl/data-grid-toolbar:inline-flex hidden h-8 min-w-0 max-w-[min(34rem,42cqw)] justify-start gap-1.5 rounded-md border-border bg-muted/40 px-2.5 font-normal text-muted-foreground"
      role="group"
      title={`Active sort: ${summary}`}
      variant="outline"
    >
      <span className="shrink-0 font-medium text-foreground">Sort</span>
      <span className="min-w-0 truncate font-mono text-xs">{summary}</span>
    </Badge>
  );
}

function SelectionSummary({
  onClearSelection,
  onCopySelection,
  onExportSelection,
  selectedCount,
}: Pick<
  DataGridToolbarProps,
  "onClearSelection" | "onCopySelection" | "onExportSelection" | "selectedCount"
>) {
  if (selectedCount === 0) {
    return null;
  }
  return (
    <>
      <span className="font-medium text-foreground">
        {selectedCount.toLocaleString()} selected
      </span>
      <Button
        aria-label="Clear selection"
        className="size-7 p-0"
        onClick={onClearSelection}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
      <SelectionActions
        disabled={false}
        onCopy={onCopySelection}
        onExport={onExportSelection}
      />
    </>
  );
}

function DataGridToolbar({
  cellSelectionStore,
  className,
  columnOrder,
  columns,
  hiddenColumnKeys,
  isColumnLayoutCustomized,
  filterTitle,
  filterLogic,
  filterRules,
  isExpanded = false,
  isFetching,
  lastFetchedLabel = "Not fetched yet",
  onClearSelection,
  onColumnVisibilityChange,
  onCopyCellSelection,
  onCopySelection,
  onExportSelection,
  onFilterChange,
  onColumnOrderChange,
  onColumnLayoutReset,
  onRefresh,
  onSortChange,
  onToggleExpanded,
  selectedCount,
  sortColumns,
}: DataGridToolbarProps) {
  const [popoverBoundary, setPopoverBoundary] = useState<HTMLDivElement | null>(
    null
  );
  const sortSummary =
    sortColumns.length > 0
      ? sortColumns
          .map((sort) => `${sort.columnKey} ${sort.direction}`)
          .join(", ")
      : null;
  return (
    <div
      className={cn(
        "@container/data-grid-toolbar relative flex min-h-9 flex-col justify-center gap-2",
        className
      )}
      data-slot="data-grid-popover-boundary"
      ref={setPopoverBoundary}
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterPopover
          columns={columns}
          logic={filterLogic}
          onChange={onFilterChange}
          popoverBoundary={popoverBoundary}
          rules={filterRules}
          title={filterTitle}
        />
        <SortPopover
          columns={columns}
          onChange={onSortChange}
          popoverBoundary={popoverBoundary}
          sortColumns={sortColumns}
        />
        <ColumnsPopover
          columnOrder={columnOrder}
          columns={columns}
          hiddenColumnKeys={hiddenColumnKeys}
          isCustomized={isColumnLayoutCustomized}
          onOrderChange={onColumnOrderChange}
          onReset={onColumnLayoutReset}
          onVisibilityChange={onColumnVisibilityChange}
          popoverBoundary={popoverBoundary}
        />
        <DataGridExpandToggle
          isExpanded={isExpanded}
          onToggleExpanded={onToggleExpanded}
        />
        <ActiveSortSummary summary={sortSummary} />

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <CellSelectionSummary
            cellSelectionStore={cellSelectionStore}
            onCopyCellSelection={onCopyCellSelection}
          />
          <SelectionSummary
            onClearSelection={onClearSelection}
            onCopySelection={onCopySelection}
            onExportSelection={onExportSelection}
            selectedCount={selectedCount}
          />
          <RefreshControl
            ariaLabel="Refresh rows"
            className="-me-1"
            isRefreshing={isFetching}
            lastFetchedLabel={lastFetchedLabel}
            onRefresh={onRefresh}
          />
        </div>
      </div>
      <FilterChips
        logic={filterLogic}
        onChange={onFilterChange}
        rules={filterRules}
      />
    </div>
  );
}

export { DataGridToolbar };
