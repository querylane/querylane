import type { CellKeyboardEvent } from "react-data-grid";
import type {
  CellCoordinate,
  CellSelectionStore,
} from "@/components/data-grid/table-data-grid/cell-selection-state";
import { isGridActionColumnKey } from "@/components/data-grid/table-data-grid/grid-row-model";

/**
 * Keyboard movement and selection for the cell-selection grid. Column
 * indexes are RDG column indexes: the leading action columns (row checkbox,
 * expand, optional row number) come first, so data columns start at
 * `dataColumnStart`.
 */

const DATA_GRID_HEADER_ROW_HEIGHT = 36;
const DATA_GRID_ROW_HEIGHT = 32;
const DEFAULT_PAGE_NAVIGATION_ROW_COUNT = 10;
const CELL_ARROW_MOVEMENT: Readonly<Partial<Record<string, CellCoordinate>>> = {
  ArrowDown: { columnIndex: 0, rowIndex: 1 },
  ArrowLeft: { columnIndex: -1, rowIndex: 0 },
  ArrowRight: { columnIndex: 1, rowIndex: 0 },
  ArrowUp: { columnIndex: 0, rowIndex: -1 },
};

function getPageNavigationRowCount(event: CellKeyboardEvent): number {
  const grid = event.currentTarget.closest<HTMLElement>(".rdg");
  if (!grid || grid.clientHeight <= DATA_GRID_HEADER_ROW_HEIGHT) {
    return DEFAULT_PAGE_NAVIGATION_ROW_COUNT;
  }
  return Math.max(
    1,
    Math.floor(
      (grid.clientHeight - DATA_GRID_HEADER_ROW_HEIGHT) / DATA_GRID_ROW_HEIGHT
    )
  );
}

function getArrowNavigationDestination({
  columnIndex,
  dataColumnStart,
  delta,
  lastColumnIndex,
  lastRowIndex,
  moveToGridEdge,
  rowIndex,
}: {
  columnIndex: number;
  dataColumnStart: number;
  delta: CellCoordinate;
  lastColumnIndex: number;
  lastRowIndex: number;
  moveToGridEdge: boolean;
  rowIndex: number;
}): CellCoordinate {
  const destination = {
    columnIndex: columnIndex + delta.columnIndex,
    rowIndex: rowIndex + delta.rowIndex,
  };
  if (!moveToGridEdge) {
    return destination;
  }
  if (delta.columnIndex < 0) {
    destination.columnIndex = dataColumnStart;
  } else if (delta.columnIndex > 0) {
    destination.columnIndex = lastColumnIndex;
  }
  if (delta.rowIndex < 0) {
    destination.rowIndex = 0;
  } else if (delta.rowIndex > 0) {
    destination.rowIndex = lastRowIndex;
  }
  return destination;
}

function clampCellNavigationDestination(
  coordinate: CellCoordinate,
  bounds: {
    dataColumnStart: number;
    lastColumnIndex: number;
    lastRowIndex: number;
  }
): CellCoordinate {
  const { dataColumnStart, lastColumnIndex, lastRowIndex } = bounds;
  return {
    columnIndex: Math.min(
      lastColumnIndex,
      Math.max(dataColumnStart, coordinate.columnIndex)
    ),
    rowIndex: Math.min(lastRowIndex, Math.max(0, coordinate.rowIndex)),
  };
}

function getCellKeyboardDestination({
  columnIndex,
  dataColumnCount,
  dataColumnStart,
  event,
  rowCount,
  rowIndex,
}: {
  columnIndex: number;
  dataColumnCount: number;
  dataColumnStart: number;
  event: CellKeyboardEvent;
  rowCount: number;
  rowIndex: number;
}): CellCoordinate | undefined {
  if (event.altKey) {
    return undefined;
  }
  const firstColumnIndex = dataColumnStart;
  const lastColumnIndex = firstColumnIndex + dataColumnCount - 1;
  const lastRowIndex = rowCount - 1;
  const moveToGridEdge = event.ctrlKey || event.metaKey;
  let destination: CellCoordinate;

  switch (event.key) {
    case "Home":
      destination = {
        columnIndex: firstColumnIndex,
        rowIndex: moveToGridEdge ? 0 : rowIndex,
      };
      break;
    case "End":
      destination = {
        columnIndex: lastColumnIndex,
        rowIndex: moveToGridEdge ? lastRowIndex : rowIndex,
      };
      break;
    case "PageUp":
      destination = {
        columnIndex,
        rowIndex: rowIndex - getPageNavigationRowCount(event),
      };
      break;
    case "PageDown":
      destination = {
        columnIndex,
        rowIndex: rowIndex + getPageNavigationRowCount(event),
      };
      break;
    default: {
      const delta = CELL_ARROW_MOVEMENT[event.key];
      if (delta === undefined) {
        return undefined;
      }
      destination = getArrowNavigationDestination({
        columnIndex,
        dataColumnStart,
        delta,
        lastColumnIndex,
        lastRowIndex,
        moveToGridEdge,
        rowIndex,
      });
    }
  }

  return clampCellNavigationDestination(destination, {
    dataColumnStart,
    lastColumnIndex,
    lastRowIndex,
  });
}

function isSelectableDataColumn(columnKey: string): boolean {
  return !isGridActionColumnKey(columnKey);
}

function stopCellKeyboardEvent(event: CellKeyboardEvent) {
  event.preventDefault();
  event.preventGridDefault();
}

function clearNativeTextSelection() {
  window.getSelection()?.removeAllRanges();
}

function clearCellSelectionWithKeyboard(
  cellSelectionStore: CellSelectionStore,
  event: CellKeyboardEvent
): boolean {
  if (
    event.key !== "Escape" ||
    cellSelectionStore.getState().ranges.length === 0
  ) {
    return false;
  }
  stopCellKeyboardEvent(event);
  cellSelectionStore.clear();
  return true;
}

function selectAllCellsWithKeyboard({
  cellSelectionStore,
  dataColumnCount,
  dataColumnStart,
  event,
  rowCount,
}: {
  cellSelectionStore: CellSelectionStore;
  dataColumnCount: number;
  dataColumnStart: number;
  event: CellKeyboardEvent;
  rowCount: number;
}): boolean {
  if (
    event.key.toLowerCase() !== "a" ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey
  ) {
    return false;
  }
  stopCellKeyboardEvent(event);
  clearNativeTextSelection();
  cellSelectionStore.selectAll({
    bottom: rowCount - 1,
    left: dataColumnStart,
    right: dataColumnStart + dataColumnCount - 1,
    top: 0,
  });
  return true;
}

export {
  clearCellSelectionWithKeyboard,
  clearNativeTextSelection,
  getCellKeyboardDestination,
  isSelectableDataColumn,
  selectAllCellsWithKeyboard,
  stopCellKeyboardEvent,
};
