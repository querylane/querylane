import type { ClipboardEvent } from "react";
import type { Column } from "react-data-grid";
import { toast } from "sonner";
import {
  type CellSelectionClipboardField,
  type CellSelectionRange,
  type CellSelectionStore,
  formatCellSelectionForClipboard,
  getCellSelectionBounds,
} from "@/components/data-grid/table-data-grid/cell-selection-state";
import { getGridCell } from "@/components/data-grid/table-data-grid/grid-cell-access";
import {
  writeClipboard,
  writeClipboardDeferred,
} from "@/components/data-grid/table-data-grid/grid-clipboard";
import {
  type GridRow,
  isGridActionColumnKey,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  cellNeedsFullValue,
  type FetchFullCell,
  resolveFullCell,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import {
  type ExportResult,
  formatCellForClipboard,
  type SelectedRow,
} from "@/features/data-explorer/table-data/selection-formatters";
import type {
  TableCell,
  TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

/**
 * Turning grid selections (checked rows, cell ranges, a single cell) into
 * clipboard text, resolving truncated previews through `fetchFullCell`.
 */

// Cap how many ReadCellValue round trips a single selection copy/export may
// fan out. Beyond this, the toolbar export (StreamRows in FULL mode) is the
// right tool.
const MAX_SELECTION_FULL_VALUE_FETCHES = 100;
const NON_FORMULA_CELL_VALUE_CASES: ReadonlySet<string> = new Set([
  "boolValue",
  "doubleValue",
  "int64Value",
  "nullValue",
  "numericValue",
]);

type CellSelectionBlocks = Array<Array<Array<TableCell | undefined>>>;

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

function copyCellValue({
  columnKey,
  fetchFullCell,
  resultColumns,
  row,
}: {
  columnKey: string;
  fetchFullCell: FetchFullCell;
  resultColumns: TableResultColumn[];
  row: GridRow;
}) {
  const meta = resultColumns.find((column) => column.columnName === columnKey);
  if (!meta) {
    return;
  }
  const cell = getGridCell(row, meta);
  if (cell === undefined) {
    return;
  }
  if (cellNeedsFullValue(cell)) {
    writeClipboardDeferred(async () =>
      formatCellForClipboard(await resolveFullCell(cell, fetchFullCell))
    );
    return;
  }
  writeClipboard(formatCellForClipboard(cell));
}

function copyRowValues(
  row: GridRow,
  resultColumns: TableResultColumn[],
  fetchFullCell: FetchFullCell
) {
  const cells = resultColumns.map((meta) => getGridCell(row, meta));
  if (cells.some(cellNeedsFullValue)) {
    writeClipboardDeferred(async () => {
      const resolved = await Promise.all(
        cells.map((cell) => resolveFullCell(cell, fetchFullCell))
      );
      return resolved.map(formatCellForClipboard).join("\t");
    });
    return;
  }
  writeClipboard(cells.map(formatCellForClipboard).join("\t"));
}

function getDisplayedDataColumnKeys(columns: Column<GridRow>[]): string[] {
  const dataColumns = columns.filter(
    (column) => !isGridActionColumnKey(column.key)
  );
  return [
    ...dataColumns.filter((column) => column.frozen === true),
    ...dataColumns.filter(
      (column) => column.frozen !== true && column.frozen !== "end"
    ),
    ...dataColumns.filter((column) => column.frozen === "end"),
  ].map((column) => column.key);
}

function collectCellSelectionBlocks({
  cellSelectionStore,
  dataColumnKeys,
  dataColumnStart,
  resultColumns,
  rows,
}: {
  cellSelectionStore: CellSelectionStore;
  dataColumnKeys: string[];
  dataColumnStart: number;
  resultColumns: TableResultColumn[];
  rows: GridRow[];
}): CellSelectionBlocks {
  const resultColumnByName = new Map(
    resultColumns.map((column) => [column.columnName, column])
  );
  const lastColumnIndex = dataColumnStart + dataColumnKeys.length - 1;
  const lastRowIndex = rows.length - 1;

  const blocks: CellSelectionBlocks = [];
  for (const range of cellSelectionStore.getState().ranges) {
    const block = collectCellSelectionBlock({
      dataColumnKeys,
      dataColumnStart,
      lastColumnIndex,
      lastRowIndex,
      range,
      resultColumnByName,
      rows,
    });
    if (block.length > 0 && (block[0]?.length ?? 0) > 0) {
      blocks.push(block);
    }
  }
  return blocks;
}

function collectCellSelectionBlock({
  dataColumnKeys,
  dataColumnStart,
  lastColumnIndex,
  lastRowIndex,
  range,
  resultColumnByName,
  rows,
}: {
  dataColumnKeys: string[];
  dataColumnStart: number;
  lastColumnIndex: number;
  lastRowIndex: number;
  range: CellSelectionRange;
  resultColumnByName: Map<string, TableResultColumn>;
  rows: GridRow[];
}): CellSelectionBlocks[number] {
  const bounds = getCellSelectionBounds(range);
  const selectedRows = rows.slice(
    Math.max(0, bounds.top),
    Math.min(lastRowIndex, bounds.bottom) + 1
  );
  const left = Math.max(dataColumnStart, bounds.left);
  const right = Math.min(lastColumnIndex, bounds.right);
  if (left > right) {
    return [];
  }
  const selectedColumnKeys = dataColumnKeys.slice(
    left - dataColumnStart,
    right - dataColumnStart + 1
  );
  return selectedRows.map((row) =>
    selectedColumnKeys.map((columnKey) => {
      const resultColumn = resultColumnByName.get(columnKey);
      return resultColumn === undefined
        ? undefined
        : getGridCell(row, resultColumn);
    })
  );
}

function countCellsNeedingFullValueInBlocks(
  blocks: CellSelectionBlocks
): number {
  let count = 0;
  for (const block of blocks) {
    for (const row of block) {
      for (const cell of row) {
        if (cellNeedsFullValue(cell)) {
          count += 1;
        }
      }
    }
  }
  return count;
}

function formatCellSelectionBlocks(blocks: CellSelectionBlocks): string {
  return formatCellSelectionForClipboard(
    blocks.map((block) =>
      block.map((row) =>
        row.map(
          (cell): CellSelectionClipboardField => ({
            neutralizeFormula:
              cell?.value?.kind.case !== undefined &&
              !NON_FORMULA_CELL_VALUE_CASES.has(cell.value.kind.case),
            text: formatCellForClipboard(cell),
          })
        )
      )
    )
  );
}

function countCellsNeedingFullValue(rows: SelectedRow[]): number {
  let count = 0;
  for (const row of rows) {
    for (const cell of row.cells.values()) {
      if (cellNeedsFullValue(cell)) {
        count += 1;
      }
    }
  }
  return count;
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

export type { CellSelectionBlocks };
export {
  collectCellSelectionBlocks,
  collectSelectedRows,
  copyCellValue,
  copyRowValues,
  countCellsNeedingFullValue,
  countCellsNeedingFullValueInBlocks,
  formatCellSelectionBlocks,
  getDisplayedDataColumnKeys,
  hasActiveTextSelectionInsideGrid,
  MAX_SELECTION_FULL_VALUE_FETCHES,
  reportTruncatedExport,
};
