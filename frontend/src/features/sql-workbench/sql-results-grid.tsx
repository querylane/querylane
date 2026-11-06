"use client";

import { ResultDataGrid } from "@/components/data-grid/table-data-grid/result-data-grid";
import type { GridEmptyMessage } from "@/components/data-grid/table-data-grid/result-data-grid-types";
import { staticColumnLayout } from "@/components/data-grid/table-data-grid/use-table-column-layout";
import { ListColumnSelector } from "@/components/ui/list-column-selector";
import { uniqueColumns } from "@/features/sql-workbench/sql-result-columns";
import { QUERY_RESULT_RESOURCE_NAME } from "@/features/sql-workbench/sql-result-resource";
import { sortSqlResultRows } from "@/features/sql-workbench/sql-result-sort";
import { reorderVisibleTableColumns } from "@/features/user-settings/table-column-layout-settings";
import { useListColumnSelection, useListSorting } from "@/lib/list-columns";
import type {
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * Query results in the Data Explorer's grid: multi-cell selection, the cell
 * context menu, copy, the value dialog and the record drawer. Column visibility
 * and sorting are presentation-only: the backing result and SQL remain unchanged.
 * Filtering and paging still belong to the statement that produced the result.
 */
function SqlResultsGrid({
  columns,
  emptyState,
  resultKey,
  rows,
}: {
  columns: readonly TableResultColumn[];
  /** Shown under the header while the grid has no rows; omit while streaming. */
  emptyState?: GridEmptyMessage | undefined;
  /** Identifies one run: selections reset when it changes. */
  resultKey: string;
  rows: readonly TableResultRow[];
}) {
  const resultColumns = uniqueColumns(columns);
  const options = resultColumns.map((column) => ({
    id: column.columnName,
    label: column.columnName,
  }));
  const columnSelection = useListColumnSelection("sql-results", options);
  const visible = new Set(columnSelection.visibleIds);
  const sortState = useListSorting(
    "sql-results",
    options.map((option) => option.id)
  );
  const byName = new Map(
    resultColumns.map((column) => [column.columnName, column])
  );
  const displayColumns = columnSelection.visibleIds.flatMap((id) => {
    const column = byName.get(id);
    return column ? [column] : [];
  });
  const columnLayout = {
    ...staticColumnLayout(resultColumns),
    displayColumns,
    columnOrder: columnSelection.columnOrder,
    setColumnOrder: columnSelection.setColumnOrder,
    reset: columnSelection.resetColumns,
    reorderColumns: (sourceColumnKey: string, targetColumnKey: string) => {
      columnSelection.setColumnOrder(
        reorderVisibleTableColumns({
          order: columnSelection.columnOrder,
          hiddenColumns: resultColumns.flatMap((column) =>
            visible.has(column.columnName) ? [] : [column.columnName]
          ),
          sourceColumnKey,
          targetColumnKey,
        })
      );
    },
    setColumnVisibility: (id: string, shown: boolean) => {
      const ids = options.flatMap((option) =>
        (option.id === id ? shown : visible.has(option.id)) ? [option.id] : []
      );
      columnSelection.setSelection(
        ids.length === options.length ? undefined : ids
      );
    },
    hiddenColumnKeys: new Set(
      resultColumns.flatMap((column) =>
        visible.has(column.columnName) ? [] : [column.columnName]
      )
    ),
    isCustomized: visible.size !== resultColumns.length,
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end py-2">
        <ListColumnSelector columns={options} {...columnSelection} />
      </div>
      <ResultDataGrid
        ariaLabel="Query results"
        columnLayout={columnLayout}
        emptyMessage={emptyState}
        fill={true}
        onSortChange={(sorts) => {
          sortState.setSorting(
            sorts.map((sort) => ({
              id: sort.columnKey,
              desc: sort.direction === "DESC",
            }))
          );
        }}
        recordTitle="Query result"
        resetKey={`${resultKey}:${JSON.stringify(sortState.sorting)}`}
        resourceName={QUERY_RESULT_RESOURCE_NAME}
        resultColumns={resultColumns}
        resultRows={sortSqlResultRows(rows, resultColumns, sortState.sorting)}
        rowSelection={false}
        showRowNumbers={true}
        sortColumns={sortState.sorting.map((sort) => ({
          columnKey: sort.id,
          direction: sort.desc ? "DESC" : "ASC",
        }))}
        toolbar={false}
      />
    </div>
  );
}

export { SqlResultsGrid };
