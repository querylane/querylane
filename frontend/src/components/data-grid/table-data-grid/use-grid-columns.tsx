import { Maximize2 } from "lucide-react";
import { type Column, SelectColumn, type SortColumn } from "react-data-grid";
import type {
  RenderOpenReferencedTableLink,
  TableForeignKeyReference,
} from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { writeClipboard } from "@/components/data-grid/table-data-grid/grid-clipboard";
import { buildColumn } from "@/components/data-grid/table-data-grid/grid-helpers";
import {
  EXPAND_COLUMN_KEY,
  EXPAND_COLUMN_WIDTH,
  type GridRow,
  ROW_NUMBER_COLUMN_WIDTH,
  ROW_NUMBER_KEY,
  SELECT_COLUMN_WIDTH,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import { Button } from "@/components/querylane-ui/button";
import { toggleColumnSortDirection } from "@/features/data-explorer/table-data/sort-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { RowIdentity_Source } from "@/protogen/querylane/console/v1alpha1/table_pb";

const ROW_NUMBER_COLUMN: Column<GridRow> = {
  cellClass: "rdg-select-cell",
  frozen: true,
  headerCellClass: "rdg-select-cell",
  key: ROW_NUMBER_KEY,
  maxWidth: ROW_NUMBER_COLUMN_WIDTH,
  minWidth: ROW_NUMBER_COLUMN_WIDTH,
  name: "",
  renderCell: ({ rowIdx }) => (
    <span className="block text-right text-muted-foreground text-xs tabular-nums">
      {rowIdx + 1}
    </span>
  ),
  renderHeaderCell: () => null,
  resizable: false,
  sortable: false,
  width: ROW_NUMBER_COLUMN_WIDTH,
};

function useGridColumns({
  columnMenu = true,
  displayColumns,
  foreignKeyReferences,
  frozenColumns,
  onFrozenColumnsChange,
  onHideColumn,
  renderOpenReferencedTableLink,
  resultColumns,
  rowIdentity,
  rowSelection = true,
  setOpenRowIndex,
  setSortColumns,
  showRowNumbers = false,
  sortColumns,
}: {
  /** Header sort/hide/freeze menu and column drag; defaults to true. */
  columnMenu?: boolean | undefined;
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
  /** The checkbox column for row selection; defaults to true. */
  rowSelection?: boolean | undefined;
  setOpenRowIndex: (next: number) => void;
  setSortColumns: (next: SortColumn[]) => void;
  /** Adds a frozen 1-based row-number column after the expand column. */
  showRowNumbers?: boolean | undefined;
  sortColumns: SortColumn[];
}): { columns: Column<GridRow>[]; pkColumnSet: Set<string> } {
  "use memo";

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
  const selectColumn: Column<GridRow>[] = rowSelection
    ? [
        {
          ...SelectColumn,
          cellClass: "rdg-select-cell rdg-checkbox-cell",
          frozen: true,
          headerCellClass: "rdg-select-cell rdg-checkbox-cell",
          maxWidth: SELECT_COLUMN_WIDTH,
          minWidth: SELECT_COLUMN_WIDTH,
          width: SELECT_COLUMN_WIDTH,
        },
      ]
    : [];
  const columns: Column<GridRow>[] = [
    ...selectColumn,
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
          onClick={() => setOpenRowIndex(rowIdx)}
          presentation="expand-cell"
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
    ...(showRowNumbers ? [ROW_NUMBER_COLUMN] : []),
    ...displayColumns.map((column) => {
      const sortIndex = sortColumns.findIndex(
        (sc) => sc.columnKey === column.columnName
      );
      const sortEntry = sortIndex === -1 ? undefined : sortColumns[sortIndex];
      return buildColumn({
        canHide: displayColumns.length > 1,
        columnMenu,
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

export { useGridColumns };
