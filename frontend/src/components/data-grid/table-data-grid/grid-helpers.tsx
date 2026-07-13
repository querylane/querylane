import type { Column } from "react-data-grid";
import { ColumnHeader } from "@/components/data-grid/table-data-grid/column-header";
import { DataCell } from "@/components/data-grid/table-data-grid/data-cell";
import { ForeignKeyDataCell } from "@/components/data-grid/table-data-grid/foreign-key-data-cell";
import {
  buildForeignKeyReferencePreview,
  type ForeignKeyReferencePreview,
  foreignKeyReferencesForColumn,
  type RenderOpenReferencedTableLink,
  type TableForeignKeyReference,
} from "@/components/data-grid/table-data-grid/foreign-key-reference-state";
import { getGridCell } from "@/components/data-grid/table-data-grid/grid-cell-access";
import type { GridRow } from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  RowCount_Status,
  type TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface BuildColumnArgs {
  column: TableResultColumn;
  foreignKeyReferences?: readonly TableForeignKeyReference[] | undefined;
  isFrozen: boolean;
  onCopyName: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onToggleFreeze: () => void;
  pkColumnSet: Set<string>;
  renderOpenReferencedTableLink?: RenderOpenReferencedTableLink | undefined;
  resultColumns?: readonly TableResultColumn[] | undefined;
  sortDirection?: "ASC" | "DESC" | undefined;
  sortPriority?: number | undefined;
}

const MIN_COLUMN_WIDTH = 140;

function buildColumn({
  column,
  foreignKeyReferences = [],
  isFrozen,
  onCopyName,
  onSortAsc,
  onSortDesc,
  onToggleFreeze,
  pkColumnSet,
  resultColumns = [column],
  renderOpenReferencedTableLink,
  sortDirection,
  sortPriority,
}: BuildColumnArgs): Column<GridRow> {
  const columnKey = column.columnName;
  const isPrimaryKey = pkColumnSet.has(columnKey);
  const columnForeignKeyReferences = foreignKeyReferencesForColumn(
    foreignKeyReferences,
    columnKey
  );
  return {
    cellClass: "",
    frozen: isFrozen,
    key: columnKey,
    minWidth: MIN_COLUMN_WIDTH,
    name: columnKey,
    renderCell: ({ row }) => {
      const cell = getGridCell(row, column);
      if (cell === undefined) {
        return null;
      }
      let foreignKeyPreview: ForeignKeyReferencePreview | undefined;
      // PostgreSQL allows a column to participate in multiple FK constraints.
      // Render the first one that can produce a safe equality filter so the
      // cell never shows a dead link for nullable, truncated, or binary values.
      for (const reference of columnForeignKeyReferences) {
        foreignKeyPreview = buildForeignKeyReferencePreview({
          reference,
          resultColumns,
          row,
          sourceColumn: columnKey,
        });
        if (foreignKeyPreview) {
          break;
        }
      }
      if (foreignKeyPreview) {
        return (
          <ForeignKeyDataCell
            cell={cell}
            column={column}
            preview={foreignKeyPreview}
            renderOpenReferencedTableLink={renderOpenReferencedTableLink}
          />
        );
      }
      return <DataCell cell={cell} column={column} />;
    },
    renderHeaderCell: () => (
      <ColumnHeader
        column={column}
        isFrozen={isFrozen}
        isPrimaryKey={isPrimaryKey}
        onCopyName={onCopyName}
        onSortAsc={onSortAsc}
        onSortDesc={onSortDesc}
        onToggleFreeze={onToggleFreeze}
        sortDirection={sortDirection}
        sortPriority={sortPriority}
      />
    ),
    resizable: true,
    sortable: false,
    width: "auto",
  };
}

interface PageLabelArgs {
  pageIndex: number;
  pageSize: number;
  rowCount: { status: RowCount_Status; value: bigint } | undefined;
}

function buildPageLabel({
  pageIndex,
  pageSize,
  rowCount,
}: PageLabelArgs): string {
  const currentPage = pageIndex + 1;
  if (!rowCount) {
    return `Page ${currentPage}`;
  }
  if (
    rowCount.status === RowCount_Status.AVAILABLE ||
    rowCount.status === RowCount_Status.ESTIMATED
  ) {
    if (rowCount.value <= 0n) {
      return `Page ${currentPage}`;
    }
    const safePageSize = BigInt(Math.max(1, pageSize));
    const totalPages = (rowCount.value + safePageSize - 1n) / safePageSize;
    const prefix = rowCount.status === RowCount_Status.ESTIMATED ? "≈" : "";
    return `Page ${currentPage} of ${prefix}${totalPages.toLocaleString()}`;
  }
  return `Page ${currentPage}`;
}

export { buildColumn, buildPageLabel };
