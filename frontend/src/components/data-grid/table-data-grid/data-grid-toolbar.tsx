import { Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";
import type { SortColumn } from "react-data-grid";
import {
  FilterChips,
  FilterPopover,
} from "@/components/data-grid/table-data-grid/filter-popover";
import {
  ExportRowsActions,
  SelectionActions,
} from "@/components/data-grid/table-data-grid/selection-actions";
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
  className?: string | undefined;
  columns: TableResultColumn[];
  exportRowsDisabled?: boolean | undefined;
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  isExpanded?: boolean | undefined;
  isFetching: boolean;
  lastFetchedLabel?: string | undefined;
  onClearSelection: () => void;
  onCopySelection: (format: ExportFormat) => void;
  onExportRows?: ((format: ExportFormat) => void) | undefined;
  onExportSelection: (format: ExportFormat) => void;
  onFilterChange: (next: TableFilterRule[]) => void;
  onFilterLogicChange: (next: TableFilterLogic) => void;
  onFitColumns?: (() => void) | undefined;
  onRefresh: () => Promise<unknown> | undefined;
  onSortChange: (next: SortColumn[]) => void;
  onToggleExpanded?: (() => void) | undefined;
  selectedCount: number;
  sortColumns: SortColumn[];
}

function FitColumnsButton({
  isExpanded,
  onFitColumns,
}: {
  isExpanded: boolean;
  onFitColumns?: (() => void) | undefined;
}) {
  if (!(isExpanded && onFitColumns)) {
    return null;
  }
  return (
    <Button
      onClick={onFitColumns}
      size="sm"
      title="Fit columns"
      type="button"
      variant="outline"
    >
      Fit columns
    </Button>
  );
}

function DataGridToolbar({
  className,
  columns,
  exportRowsDisabled = false,
  filterLogic,
  filterRules,
  isExpanded = false,
  isFetching,
  lastFetchedLabel = "Not fetched yet",
  onClearSelection,
  onCopySelection,
  onExportRows,
  onExportSelection,
  onFilterChange,
  onFilterLogicChange,
  onFitColumns,
  onRefresh,
  onSortChange,
  onToggleExpanded,
  selectedCount,
  sortColumns,
}: DataGridToolbarProps) {
  const [popoverBoundary, setPopoverBoundary] = useState<HTMLDivElement | null>(
    null
  );
  const hasSelection = selectedCount > 0;
  const sortSummary =
    sortColumns.length > 0
      ? sortColumns
          .map((sort) => `${sort.columnKey} ${sort.direction}`)
          .join(", ")
      : null;
  return (
    <div
      className={cn(
        "@container/data-grid-toolbar relative flex min-h-9 flex-col gap-2",
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
          onLogicChange={onFilterLogicChange}
          popoverBoundary={popoverBoundary}
          rules={filterRules}
        />
        <SortPopover
          columns={columns}
          onChange={onSortChange}
          popoverBoundary={popoverBoundary}
          sortColumns={sortColumns}
        />
        {onToggleExpanded ? (
          <Button
            aria-label={isExpanded ? "Collapse data grid" : "Expand data grid"}
            onClick={onToggleExpanded}
            size="sm"
            title={isExpanded ? "Collapse data grid" : "Expand data grid"}
            type="button"
            variant="outline"
          >
            {isExpanded ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
            {isExpanded ? "Collapse" : "Expand"}
          </Button>
        ) : null}
        <FitColumnsButton isExpanded={isExpanded} onFitColumns={onFitColumns} />
        {onExportRows ? (
          <ExportRowsActions
            disabled={exportRowsDisabled || columns.length === 0}
            onExport={onExportRows}
          />
        ) : null}
        {sortSummary ? (
          <Badge
            aria-label="Active sort summary"
            className="@3xl/data-grid-toolbar:inline-flex hidden h-8 min-w-0 max-w-[min(34rem,42cqw)] justify-start gap-1.5 rounded-md border-border bg-muted/40 px-2.5 font-normal text-muted-foreground"
            role="group"
            title={`Active sort: ${sortSummary}`}
            variant="outline"
          >
            <span className="shrink-0 font-medium text-foreground">Sort</span>
            <span className="min-w-0 truncate font-mono text-xs">
              {sortSummary}
            </span>
          </Badge>
        ) : null}

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-muted-foreground text-xs">
          {hasSelection ? (
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
          ) : null}
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
