"use client";

import { ResultDataGrid } from "@/components/data-grid/table-data-grid/result-data-grid";
import type { GridEmptyMessage } from "@/components/data-grid/table-data-grid/result-data-grid-types";
import { staticColumnLayout } from "@/components/data-grid/table-data-grid/use-table-column-layout";
import { ListColumnSelector } from "@/components/ui/list-column-selector";
import { uniqueColumns } from "@/features/sql-workbench/sql-result-columns";
import { QUERY_RESULT_RESOURCE_NAME } from "@/features/sql-workbench/sql-result-resource";
import { useListColumnSelection } from "@/lib/list-columns";
import type {
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * Query results in the Data Explorer's grid: multi-cell selection, the cell
 * context menu, copy, the value dialog and the record drawer. Column visibility
 * is presentation-only: the complete result and SQL remain unchanged. Sorting,
 * filtering and paging still belong to the statement that produced the result.
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
  const columnLayout = {
    ...staticColumnLayout(resultColumns),
    displayColumns: resultColumns.filter((column) =>
      visible.has(column.columnName)
    ),
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
        columnMenu={false}
        emptyMessage={emptyState}
        fill={true}
        recordTitle="Query result"
        resetKey={resultKey}
        resourceName={QUERY_RESULT_RESOURCE_NAME}
        resultColumns={resultColumns}
        resultRows={rows}
        rowSelection={false}
        showRowNumbers={true}
        toolbar={false}
      />
    </div>
  );
}

export { SqlResultsGrid };
