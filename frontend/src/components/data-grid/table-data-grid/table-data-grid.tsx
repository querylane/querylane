"use client";

import { create } from "@bufbuild/protobuf";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SortColumn } from "react-data-grid";
import { toast } from "sonner";
import { AppInlineError } from "@/components/app-error-view";
import type {
  RenderOpenReferencedTableLink,
  TableForeignKeyReference,
} from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { buildPageLabel } from "@/components/data-grid/table-data-grid/grid-helpers";
import { ResultDataGrid } from "@/components/data-grid/table-data-grid/result-data-grid";
import {
  useSelectedTableColumns,
  useTableColumnLayout,
} from "@/components/data-grid/table-data-grid/use-table-column-layout";
import { Button } from "@/components/querylane-ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatLastFetchedLabel } from "@/features/data-explorer/last-fetched-label";
import {
  serializeTableFilterSearch,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import {
  type FetchFullCell,
  READ_CELL_MAX_BYTES,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import { buildGridStatusItems } from "@/features/data-explorer/table-data/grid-status";
import {
  serializeSortSearch,
  useTableDataQuery,
} from "@/features/data-explorer/table-data/table-data-query";
import {
  type RefreshIntervalMs,
  useRefreshSettingsStore,
} from "@/features/user-settings/refresh-settings";
import { useReadCellValueMutation } from "@/hooks/api/table-data";
import { parseRelationQualifiedName } from "@/lib/console-resources";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  ReadCellValueRequestSchema,
  type ReadRowsResponse,
  type TableCell,
  type TableResultColumn,
  TableResultColumnSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import type { Column as TableColumn } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface TableDataGridProps {
  allowSqlExport?: boolean | undefined;
  children?: (state: {
    grid: ReactNode;
    lastFetchedLabel: string;
  }) => ReactNode;
  foreignKeyReferences?: readonly TableForeignKeyReference[] | undefined;
  initialPageSize?: number | undefined;
  name: string;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
}

const DEFAULT_PAGE_SIZE = 50;
// Stable empties keep row/column derivations referentially equal across
// renders while data is undefined, so the React Compiler can memoize
// everything downstream of them.
const EMPTY_RESULT_COLUMNS: TableResultColumn[] = [];
const EMPTY_RESULT_ROWS: Array<{ rowKey: string; values: TableCell[] }> = [];

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

/**
 * Selections are page-scoped: prior keys don't map across page, page size,
 * filter or sort changes, so the grid resets them when this key changes.
 */
function navigationStateKey({
  currentPageIndex,
  filterLogic,
  filterRules,
  name,
  pageSize,
  sortColumns,
}: {
  currentPageIndex: number;
  filterLogic: TableFilterLogic;
  filterRules: TableFilterRule[];
  name: string;
  pageSize: number;
  sortColumns: SortColumn[];
}): string {
  return `${name}:${currentPageIndex}:${pageSize}:${
    serializeTableFilterSearch({ logic: filterLogic, rules: filterRules }) ?? ""
  }:${serializeSortSearch(sortColumns) ?? ""}`;
}

/** Truncated previews resolve through ReadCellValue on this table. */
function useReadCellValueFetcher(name: string): FetchFullCell {
  const readCellValue = useReadCellValueMutation();
  return async (fullValueToken) =>
    (
      await readCellValue.mutateAsync(
        create(ReadCellValueRequestSchema, {
          fullValueToken,
          maxBytes: READ_CELL_MAX_BYTES,
          name,
        })
      )
    ).value;
}

function TableDataGridAlerts({
  hasStaleRows,
  invalidFilterRules,
  onClearFilters,
  onRetry,
  queryError,
}: {
  hasStaleRows: boolean;
  invalidFilterRules: Array<{ id: string; message: string }>;
  onClearFilters: () => void;
  onRetry: () => Promise<unknown> | undefined;
  queryError: Error | null;
}) {
  if (queryError) {
    return (
      <div className="space-y-2">
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
        {hasStaleRows ? (
          <p className="text-muted-foreground text-xs" role="status">
            Showing the last loaded rows until retry succeeds.
          </p>
        ) : null}
      </div>
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

function buildAvailableColumns(
  columnCatalog: readonly TableColumn[],
  resultColumns: TableResultColumn[]
): TableResultColumn[] {
  if (columnCatalog.length === 0) {
    return resultColumns;
  }
  return columnCatalog.map((column) =>
    create(TableResultColumnSchema, {
      columnName: column.columnName,
      dataType: column.dataType,
      isNullable: column.isNullable,
      rawType: column.rawType,
    })
  );
}

function hasColumnMetadata(
  availableColumns: readonly TableResultColumn[],
  resultSet: unknown
): boolean {
  return availableColumns.length > 0 || resultSet !== undefined;
}

function availableNextPageToken({
  error,
  isFetching,
  response,
}: {
  error: unknown;
  isFetching: boolean;
  response: ReadRowsResponse | undefined;
}): string {
  if (error || isFetching) {
    return "";
  }
  return response?.nextPageToken ?? "";
}

function resolveReadRowsVisibility({
  current,
  error,
  lastSuccessful,
}: {
  current: ReadRowsResponse | undefined;
  error: unknown;
  lastSuccessful: ReadRowsResponse | undefined;
}) {
  const data = current ?? (error ? lastSuccessful : undefined);
  return {
    data,
    hasStaleRows: Boolean(error && data),
    isPreviousRequestFallback: Boolean(error && !current && data),
  };
}

function shouldSuppressStatusAndPagination({
  error,
  isPreviousRequestFallback,
  rowCount,
}: {
  error: unknown;
  isPreviousRequestFallback: boolean;
  rowCount: number;
}): boolean {
  return Boolean(isPreviousRequestFallback || (error && rowCount === 0));
}
function TableDataGrid({
  allowSqlExport = true,
  children,
  foreignKeyReferences,
  name,
  initialPageSize = DEFAULT_PAGE_SIZE,
  renderOpenReferencedTableLink,
}: TableDataGridProps) {
  const relationQualifiedName = parseRelationQualifiedName(name);
  const [filterSearch, setFilterSearch] = useState<string>();
  const [sortSearch, setSortSearch] = useState<string>();
  const [pageSize, setPageSize] = useState(initialPageSize);
  const selectedColumns = useSelectedTableColumns(name);
  const {
    columnCatalog,
    controller,
    error: queryStateError,
    filterLogic,
    filterRules,
    invalidFilterRules,
    isLoading: isQueryStateValidationLoading,
    refetch,
    rowsQuery,
  } = useTableDataQuery({
    filterSearch,
    name,
    onFilterSearchChange: setFilterSearch,
    onPageSizeChange: setPageSize,
    onSortSearchChange: setSortSearch,
    pageSize,
    selectedColumns,
    sortSearch,
  });
  const {
    data,
    dataUpdatedAt = 0,
    error,
    isFetching,
    isLoading,
    isPlaceholderData,
    lastSuccessfulData,
  } = rowsQuery;
  // Use TanStack Query's successful data, including the most recent page for
  // the same request shape. Filters, sorts, projections, and tables keep
  // separate identities so a failure never displays unrelated rows.
  const queryError = queryStateError ?? error;
  const {
    data: visibleData,
    hasStaleRows,
    isPreviousRequestFallback,
  } = resolveReadRowsVisibility({
    current: data,
    error: queryError,
    lastSuccessful: lastSuccessfulData,
  });
  const refreshState = useDataGridRefreshState({
    dataUpdatedAt,
    isFetching,
    refetch,
  });
  const fetchFullCell = useReadCellValueFetcher(name);
  const gridLoading = isLoading || isQueryStateValidationLoading;
  // A page/sort/filter change starts a new request while `placeholderData`
  // keeps the prior rows on screen (isPlaceholderData). Dim those rows and
  // float a refreshing pill so slow loads read as "loading" without losing
  // continuity. Gated on isPlaceholderData rather than raw isFetching so a
  // same-key refetch — the toolbar Refresh button or a reconnect — doesn't
  // grey out and disable unchanged rows (the toolbar spinner covers those).
  const isRefetchingRows = isPlaceholderData && !gridLoading;

  const resultColumns = visibleData?.resultSet?.columns ?? EMPTY_RESULT_COLUMNS;
  const availableColumns = buildAvailableColumns(columnCatalog, resultColumns);
  const resultRows = visibleData?.resultSet?.rows ?? EMPTY_RESULT_ROWS;
  const rowCount = visibleData?.resultSet?.rowCount;

  const columnLayout = useTableColumnLayout({
    availableColumns,
    columns: resultColumns,
    hasColumnMetadata: hasColumnMetadata(
      availableColumns,
      visibleData?.resultSet
    ),
    tableName: name,
  });

  const pageLabel =
    resultRows.length === 0
      ? "Page 1 of 1"
      : buildPageLabel({
          pageIndex: controller.currentPageIndex,
          pageSize: controller.pageSize,
          rowCount,
        });
  const nextPageToken = availableNextPageToken({
    error: queryError,
    isFetching,
    response: visibleData,
  });
  const hasNext = nextPageToken !== "";
  const statusItems = visibleData?.resultSet
    ? buildGridStatusItems({
        hasNext,
        limits: visibleData.limits,
        pageSize: controller.pageSize,
        rowsReturned: resultRows.length,
      })
    : [];

  const handleFilterChange = (
    next: TableFilterRule[],
    nextLogic: TableFilterLogic = filterLogic
  ) =>
    setFilterSearch(
      serializeTableFilterSearch({ logic: nextLogic, rules: next })
    );
  const clearFilters = () => setFilterSearch(undefined);
  const handleRefresh = () => refreshState.refreshNow();
  const handleSortChange = (next: SortColumn[]) =>
    controller.setSortColumns(next);

  const grid = (
    <ResultDataGrid
      alerts={
        <TableDataGridAlerts
          hasStaleRows={hasStaleRows}
          invalidFilterRules={invalidFilterRules}
          onClearFilters={clearFilters}
          onRetry={handleRefresh}
          queryError={queryError}
        />
      }
      allowSqlExport={allowSqlExport}
      availableColumns={availableColumns}
      columnLayout={columnLayout}
      fetchFullCell={fetchFullCell}
      filters={{
        logic: filterLogic,
        onChange: handleFilterChange,
        rules: filterRules,
        title: `Filter ${relationQualifiedName.schema}.${relationQualifiedName.relation}`,
      }}
      foreignKeyReferences={foreignKeyReferences}
      isLoading={gridLoading}
      isRefetchingRows={isRefetchingRows}
      onSortChange={handleSortChange}
      pagination={{
        currentPageIndex: controller.currentPageIndex,
        hasNext,
        onNext: () => {
          if (nextPageToken) {
            controller.goNext(nextPageToken);
          }
        },
        onPageSizeChange: controller.setPageSize,
        onPrev: controller.goPrev,
        pageLabel,
        pageSize: controller.pageSize,
      }}
      queryErrorActive={Boolean(queryError)}
      refresh={{
        isFetching,
        lastFetchedLabel: refreshState.lastFetchedLabel,
        onRefresh: handleRefresh,
      }}
      renderOpenReferencedTableLink={renderOpenReferencedTableLink}
      resetKey={navigationStateKey({
        currentPageIndex: controller.currentPageIndex,
        filterLogic,
        filterRules,
        name,
        pageSize: controller.pageSize,
        sortColumns: controller.sortColumns,
      })}
      resourceName={name}
      resultColumns={resultColumns}
      resultRows={resultRows}
      rowIdentity={visibleData?.resultSet?.rowIdentity}
      sortColumns={controller.sortColumns}
      statusItems={statusItems}
      suppressStatusAndPagination={shouldSuppressStatusAndPagination({
        error: queryError,
        isPreviousRequestFallback,
        rowCount: resultRows.length,
      })}
    />
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
