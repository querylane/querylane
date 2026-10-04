"use client";

import { ResultDataGrid } from "@/components/data-grid/table-data-grid/result-data-grid";
import type { GridEmptyMessage } from "@/components/data-grid/table-data-grid/result-data-grid-types";
import { uniqueColumns } from "@/features/sql-workbench/sql-result-columns";
import { QUERY_RESULT_RESOURCE_NAME } from "@/features/sql-workbench/sql-result-resource";
import type {
  TableResultColumn,
  TableResultRow,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * Query results in the Data Explorer's grid: multi-cell selection, the cell
 * context menu, copy, the value dialog and the record drawer. Nothing that
 * reshapes the result (sorting, hiding or reordering columns, filters,
 * paging): the statement's SELECT list and ORDER BY decide that, and the
 * grid must never disagree with the SQL that produced it.
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResultDataGrid
        ariaLabel="Query results"
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
