import type {
  CellKeyboardEvent,
  CellKeyDownArgs,
  CellMouseArgs,
  CellMouseEvent,
} from "react-data-grid";
import { isCellSelectionInteractiveTarget } from "@/components/data-grid/table-data-grid/cell-selection-interaction";
import {
  clearCellSelectionWithKeyboard,
  clearNativeTextSelection,
  getCellKeyboardDestination,
  isSelectableDataColumn,
  selectAllCellsWithKeyboard,
  stopCellKeyboardEvent,
} from "@/components/data-grid/table-data-grid/cell-selection-navigation";
import type { CellSelectionStore } from "@/components/data-grid/table-data-grid/cell-selection-state";
import {
  type GridRow,
  isGridActionColumnKey,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import type { SelectionActions } from "@/components/data-grid/table-data-grid/use-selection-actions";

interface ContextMenuState {
  columnKey: string;
  left: number;
  returnFocusTo: HTMLElement;
  row: GridRow;
  top: number;
}

// Grid cell mouse/selection handlers plus the context-menu copy actions. Built
// per render from the current rows and menu position.
function buildCellInteractionHandlers({
  cellSelectionStore,
  contextMenu,
  dataColumnCount,
  dataColumnStart,
  rowCount,
  selectionActions,
  setContextMenu,
}: {
  cellSelectionStore: CellSelectionStore;
  contextMenu: ContextMenuState | null;
  dataColumnCount: number;
  dataColumnStart: number;
  rowCount: number;
  selectionActions: SelectionActions;
  setContextMenu: (next: ContextMenuState | null) => void;
}) {
  function handleCellMouseDown(
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) {
    if (
      event.button !== 0 ||
      !isSelectableDataColumn(args.column.key) ||
      isCellSelectionInteractiveTarget(event.target, event.currentTarget)
    ) {
      return;
    }
    cellSelectionStore.start(
      {
        columnIndex: args.column.idx,
        rowIndex: args.rowIdx,
      },
      {
        additive: event.ctrlKey || event.metaKey,
        extend: event.shiftKey,
      }
    );
  }

  function handleCellKeyDown(
    args: CellKeyDownArgs<GridRow>,
    event: CellKeyboardEvent
  ) {
    if (
      args.mode !== "ACTIVE" ||
      args.column === undefined ||
      args.row === undefined ||
      !isSelectableDataColumn(args.column.key)
    ) {
      return;
    }

    if (clearCellSelectionWithKeyboard(cellSelectionStore, event)) {
      return;
    }

    if (
      selectAllCellsWithKeyboard({
        cellSelectionStore,
        dataColumnCount,
        dataColumnStart,
        event,
        rowCount,
      })
    ) {
      return;
    }

    const next = getCellKeyboardDestination({
      columnIndex: args.column.idx,
      dataColumnCount,
      dataColumnStart,
      event,
      rowCount,
      rowIndex: args.rowIdx,
    });
    if (next === undefined) {
      return;
    }
    stopCellKeyboardEvent(event);
    clearNativeTextSelection();
    cellSelectionStore.start(next, { extend: event.shiftKey });
    cellSelectionStore.end();
    args.setActivePosition(
      { idx: next.columnIndex, rowIdx: next.rowIndex },
      { shouldFocus: true }
    );
  }

  function handleCellContextMenu(
    args: CellMouseArgs<GridRow>,
    event: CellMouseEvent
  ) {
    if (isGridActionColumnKey(args.column.key)) {
      return;
    }
    event.preventGridDefault();
    event.preventDefault();
    setContextMenu({
      columnKey: args.column.key,
      left: event.clientX,
      returnFocusTo: event.currentTarget,
      row: args.row,
      top: event.clientY,
    });
  }

  function handleContextMenuCopyCell() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyCellValue(contextMenu.row, contextMenu.columnKey);
  }

  function handleContextMenuCopyRow() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyRowValues(contextMenu.row);
  }

  function handleContextMenuCopyRowAsSql() {
    if (!contextMenu) {
      return;
    }
    selectionActions.copyRowAsSqlInsert(contextMenu.row);
  }

  return {
    handleCellContextMenu,
    handleCellKeyDown,
    handleCellMouseDown,
    handleContextMenuCopyCell,
    handleContextMenuCopyRow,
    handleContextMenuCopyRowAsSql,
  };
}

export type { ContextMenuState };
export { buildCellInteractionHandlers };
