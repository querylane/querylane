interface CellCoordinate {
  columnIndex: number;
  rowIndex: number;
}

interface CellSelectionRange {
  anchor: CellCoordinate;
  focus: CellCoordinate;
}

interface CellSelectionBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface CellSelectionState {
  isDragging: boolean;
  ranges: readonly CellSelectionRange[];
}

interface StartCellSelectionOptions {
  additive?: boolean;
  extend?: boolean;
}

interface CellSelectionStore {
  clear: () => void;
  end: () => void;
  extendTo: (coordinate: CellCoordinate) => void;
  getState: () => CellSelectionState;
  selectAll: (bounds: CellSelectionBounds) => void;
  start: (
    coordinate: CellCoordinate,
    options?: StartCellSelectionOptions
  ) => void;
  subscribe: (listener: () => void) => () => void;
}

interface CellSelectionClipboardValue {
  neutralizeFormula: boolean;
  text: string;
}

type CellSelectionClipboardField = string | CellSelectionClipboardValue;

const EMPTY_CELL_SELECTION_STATE: CellSelectionState = {
  isDragging: false,
  ranges: [],
};

const CELL_SELECTION_SELECTED = "selected";
const CELL_SELECTION_TOP = "top";
const CELL_SELECTION_RIGHT = "right";
const CELL_SELECTION_BOTTOM = "bottom";
const CELL_SELECTION_LEFT = "left";
const CLIPBOARD_FORMULA_PREFIX_PATTERN = /^\s*[=+@-]/u;
const CLIPBOARD_QUOTE_REQUIRED_PATTERN = /[\t\n\r"]/u;

function coordinatesEqual(
  first: CellCoordinate,
  second: CellCoordinate
): boolean {
  return (
    first.columnIndex === second.columnIndex &&
    first.rowIndex === second.rowIndex
  );
}

function getCellSelectionBounds(
  range: CellSelectionRange
): CellSelectionBounds {
  return {
    bottom: Math.max(range.anchor.rowIndex, range.focus.rowIndex),
    left: Math.min(range.anchor.columnIndex, range.focus.columnIndex),
    right: Math.max(range.anchor.columnIndex, range.focus.columnIndex),
    top: Math.min(range.anchor.rowIndex, range.focus.rowIndex),
  };
}

function isCellSelected(
  state: CellSelectionState,
  coordinate: CellCoordinate
): boolean {
  return state.ranges.some((range) => {
    const bounds = getCellSelectionBounds(range);
    return (
      coordinate.columnIndex >= bounds.left &&
      coordinate.columnIndex <= bounds.right &&
      coordinate.rowIndex >= bounds.top &&
      coordinate.rowIndex <= bounds.bottom
    );
  });
}

function getCellSelectionAppearance(
  state: CellSelectionState,
  coordinate: CellCoordinate
): string {
  if (!isCellSelected(state, coordinate)) {
    return "";
  }

  const appearance = [CELL_SELECTION_SELECTED];
  if (
    !isCellSelected(state, {
      columnIndex: coordinate.columnIndex,
      rowIndex: coordinate.rowIndex - 1,
    })
  ) {
    appearance.push(CELL_SELECTION_TOP);
  }
  if (
    !isCellSelected(state, {
      columnIndex: coordinate.columnIndex + 1,
      rowIndex: coordinate.rowIndex,
    })
  ) {
    appearance.push(CELL_SELECTION_RIGHT);
  }
  if (
    !isCellSelected(state, {
      columnIndex: coordinate.columnIndex,
      rowIndex: coordinate.rowIndex + 1,
    })
  ) {
    appearance.push(CELL_SELECTION_BOTTOM);
  }
  if (
    !isCellSelected(state, {
      columnIndex: coordinate.columnIndex - 1,
      rowIndex: coordinate.rowIndex,
    })
  ) {
    appearance.push(CELL_SELECTION_LEFT);
  }
  return appearance.join(" ");
}

function createCellSelectionStore(): CellSelectionStore {
  let state = EMPTY_CELL_SELECTION_STATE;
  const listeners = new Set<() => void>();

  const setState = (nextState: CellSelectionState) => {
    state = nextState;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    clear() {
      if (state.ranges.length === 0 && !state.isDragging) {
        return;
      }
      setState(EMPTY_CELL_SELECTION_STATE);
    },
    end() {
      if (!state.isDragging) {
        return;
      }
      setState({
        ...state,
        isDragging: false,
      });
    },
    extendTo(coordinate) {
      if (!state.isDragging) {
        return;
      }
      const activeRangeIndex = state.ranges.length - 1;
      const activeRange = state.ranges[activeRangeIndex];
      if (
        activeRange === undefined ||
        coordinatesEqual(activeRange.focus, coordinate)
      ) {
        return;
      }
      setState({
        ...state,
        ranges: state.ranges.map((range, index) =>
          index === activeRangeIndex ? { ...range, focus: coordinate } : range
        ),
      });
    },
    getState() {
      return state;
    },
    selectAll(bounds) {
      if (bounds.left > bounds.right || bounds.top > bounds.bottom) {
        this.clear();
        return;
      }
      setState({
        isDragging: false,
        ranges: [
          {
            anchor: {
              columnIndex: bounds.left,
              rowIndex: bounds.top,
            },
            focus: {
              columnIndex: bounds.right,
              rowIndex: bounds.bottom,
            },
          },
        ],
      });
    },
    start(coordinate, options = {}) {
      if (options.extend && state.ranges.length > 0) {
        const activeRangeIndex = state.ranges.length - 1;
        const activeRange = state.ranges[activeRangeIndex];
        if (activeRange === undefined) {
          return;
        }
        setState({
          isDragging: true,
          ranges: state.ranges.map((range, index) =>
            index === activeRangeIndex
              ? { ...activeRange, focus: coordinate }
              : range
          ),
        });
        return;
      }

      const nextRange = { anchor: coordinate, focus: coordinate };
      const ranges = options.additive
        ? [...state.ranges, nextRange]
        : [nextRange];
      setState({
        isDragging: true,
        ranges,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function escapeClipboardField(field: CellSelectionClipboardField): string {
  const { neutralizeFormula, text } =
    typeof field === "string"
      ? { neutralizeFormula: true, text: field }
      : field;
  const formulaSafeValue =
    neutralizeFormula && CLIPBOARD_FORMULA_PREFIX_PATTERN.test(text)
      ? `'${text}`
      : text;
  if (CLIPBOARD_QUOTE_REQUIRED_PATTERN.test(formulaSafeValue)) {
    return `"${formulaSafeValue.replaceAll('"', '""')}"`;
  }
  return formulaSafeValue;
}

function formatCellSelectionForClipboard(
  blocks: readonly (readonly (readonly CellSelectionClipboardField[])[])[]
): string {
  return blocks
    .map((rows) =>
      rows.map((row) => row.map(escapeClipboardField).join("\t")).join("\n")
    )
    .join("\n\n");
}

export type {
  CellCoordinate,
  CellSelectionBounds,
  CellSelectionClipboardField,
  CellSelectionClipboardValue,
  CellSelectionRange,
  CellSelectionState,
  CellSelectionStore,
};
export {
  CELL_SELECTION_BOTTOM,
  CELL_SELECTION_LEFT,
  CELL_SELECTION_RIGHT,
  CELL_SELECTION_SELECTED,
  CELL_SELECTION_TOP,
  createCellSelectionStore,
  formatCellSelectionForClipboard,
  getCellSelectionAppearance,
  getCellSelectionBounds,
  isCellSelected,
};
