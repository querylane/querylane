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

interface CellSelectionSummary {
  cellCount: number;
  columnCount: number | undefined;
  rangeCount: number;
  rowCount: number | undefined;
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

function cellSelectionBoundsArea(bounds: CellSelectionBounds): number {
  return (bounds.right - bounds.left + 1) * (bounds.bottom - bounds.top + 1);
}

function cellSelectionRangeFromBounds(
  bounds: CellSelectionBounds
): CellSelectionRange {
  return {
    anchor: {
      columnIndex: bounds.left,
      rowIndex: bounds.top,
    },
    focus: {
      columnIndex: bounds.right,
      rowIndex: bounds.bottom,
    },
  };
}

function intersectCellSelectionBounds(
  first: CellSelectionBounds,
  second: CellSelectionBounds
): CellSelectionBounds | undefined {
  const intersection = {
    bottom: Math.min(first.bottom, second.bottom),
    left: Math.max(first.left, second.left),
    right: Math.min(first.right, second.right),
    top: Math.max(first.top, second.top),
  };
  return intersection.left <= intersection.right &&
    intersection.top <= intersection.bottom
    ? intersection
    : undefined;
}

function subtractCellSelectionRange(
  range: CellSelectionRange,
  excludedRange: CellSelectionRange
): CellSelectionRange[] {
  const bounds = getCellSelectionBounds(range);
  const intersection = intersectCellSelectionBounds(
    bounds,
    getCellSelectionBounds(excludedRange)
  );
  if (!intersection) {
    return [range];
  }

  const remainingBounds = [
    {
      bottom: intersection.top - 1,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
    },
    {
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      top: intersection.bottom + 1,
    },
    {
      bottom: intersection.bottom,
      left: bounds.left,
      right: intersection.left - 1,
      top: intersection.top,
    },
    {
      bottom: intersection.bottom,
      left: intersection.right + 1,
      right: bounds.right,
      top: intersection.top,
    },
  ];
  return remainingBounds.flatMap((remaining) =>
    remaining.left <= remaining.right && remaining.top <= remaining.bottom
      ? [cellSelectionRangeFromBounds(remaining)]
      : []
  );
}

function mergeCellSelectionRanges(
  first: CellSelectionRange,
  second: CellSelectionRange
): CellSelectionRange | undefined {
  const firstBounds = getCellSelectionBounds(first);
  const secondBounds = getCellSelectionBounds(second);
  const mergedBounds = {
    bottom: Math.max(firstBounds.bottom, secondBounds.bottom),
    left: Math.min(firstBounds.left, secondBounds.left),
    right: Math.max(firstBounds.right, secondBounds.right),
    top: Math.min(firstBounds.top, secondBounds.top),
  };
  const overlapWidth = Math.max(
    0,
    Math.min(firstBounds.right, secondBounds.right) -
      Math.max(firstBounds.left, secondBounds.left) +
      1
  );
  const overlapHeight = Math.max(
    0,
    Math.min(firstBounds.bottom, secondBounds.bottom) -
      Math.max(firstBounds.top, secondBounds.top) +
      1
  );
  const unionArea =
    cellSelectionBoundsArea(firstBounds) +
    cellSelectionBoundsArea(secondBounds) -
    overlapWidth * overlapHeight;
  if (cellSelectionBoundsArea(mergedBounds) !== unionArea) {
    return undefined;
  }
  return cellSelectionRangeFromBounds(mergedBounds);
}

function normalizeLatestCellSelectionRange(
  ranges: readonly CellSelectionRange[]
): CellSelectionRange[] {
  const latestRange = ranges.at(-1);
  if (!latestRange) {
    return [];
  }
  const normalized = ranges
    .slice(0, -1)
    .flatMap((range) => subtractCellSelectionRange(range, latestRange));
  let mergedRange = latestRange;
  let index = 0;
  while (index < normalized.length) {
    const candidate = normalized[index];
    if (candidate === undefined) {
      index += 1;
      continue;
    }
    const merged = mergeCellSelectionRanges(candidate, mergedRange);
    if (merged === undefined) {
      index += 1;
      continue;
    }
    mergedRange = merged;
    normalized.splice(index, 1);
    index = 0;
  }
  normalized.push(mergedRange);
  return normalized;
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

function getCellSelectionSummary(
  state: CellSelectionState
): CellSelectionSummary {
  const bounds = state.ranges.map(getCellSelectionBounds);
  const activeBounds = bounds.length === 1 ? bounds[0] : undefined;
  return {
    cellCount: bounds.reduce(
      (count, rangeBounds) =>
        count +
        (rangeBounds.right - rangeBounds.left + 1) *
          (rangeBounds.bottom - rangeBounds.top + 1),
      0
    ),
    columnCount:
      activeBounds === undefined
        ? undefined
        : activeBounds.right - activeBounds.left + 1,
    rangeCount: bounds.length,
    rowCount:
      activeBounds === undefined
        ? undefined
        : activeBounds.bottom - activeBounds.top + 1,
  };
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
        ranges: normalizeLatestCellSelectionRange(state.ranges),
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
  CellSelectionSummary,
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
  getCellSelectionSummary,
  isCellSelected,
};
