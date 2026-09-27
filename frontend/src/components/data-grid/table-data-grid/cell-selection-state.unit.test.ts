import { describe, expect, test } from "@rstest/core";
import {
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
} from "@/components/data-grid/table-data-grid/cell-selection-state";

describe("cell selection state", () => {
  test("adds disjoint ranges and extends the latest anchor", () => {
    const store = createCellSelectionStore();

    store.start({ columnIndex: 2, rowIndex: 1 });
    store.end();
    store.start({ columnIndex: 5, rowIndex: 4 }, { additive: true });
    store.end();
    store.start({ columnIndex: 7, rowIndex: 6 }, { extend: true });

    expect(store.getState().ranges).toEqual([
      {
        anchor: { columnIndex: 2, rowIndex: 1 },
        focus: { columnIndex: 2, rowIndex: 1 },
      },
      {
        anchor: { columnIndex: 5, rowIndex: 4 },
        focus: { columnIndex: 7, rowIndex: 6 },
      },
    ]);
  });

  test("reports the outside edges of overlapping ranges", () => {
    const store = createCellSelectionStore();
    store.start({ columnIndex: 2, rowIndex: 1 });
    store.extendTo({ columnIndex: 3, rowIndex: 2 });
    store.end();
    store.start({ columnIndex: 3, rowIndex: 1 }, { additive: true });
    store.extendTo({ columnIndex: 4, rowIndex: 2 });

    expect(
      getCellSelectionAppearance(store.getState(), {
        columnIndex: 3,
        rowIndex: 1,
      })
    ).toBe(`${CELL_SELECTION_SELECTED} ${CELL_SELECTION_TOP}`);
    expect(
      getCellSelectionAppearance(store.getState(), {
        columnIndex: 2,
        rowIndex: 2,
      })
    ).toBe(
      `${CELL_SELECTION_SELECTED} ${CELL_SELECTION_BOTTOM} ${CELL_SELECTION_LEFT}`
    );
    expect(
      getCellSelectionAppearance(store.getState(), {
        columnIndex: 4,
        rowIndex: 2,
      })
    ).toBe(
      `${CELL_SELECTION_SELECTED} ${CELL_SELECTION_RIGHT} ${CELL_SELECTION_BOTTOM}`
    );
  });

  test("merges overlapping rectangular ranges after selection ends", () => {
    const store = createCellSelectionStore();
    store.start({ columnIndex: 2, rowIndex: 1 });
    store.extendTo({ columnIndex: 3, rowIndex: 2 });
    store.end();

    store.start({ columnIndex: 3, rowIndex: 1 }, { additive: true });
    store.extendTo({ columnIndex: 4, rowIndex: 2 });
    store.end();

    expect(store.getState().ranges).toEqual([
      {
        anchor: { columnIndex: 2, rowIndex: 1 },
        focus: { columnIndex: 4, rowIndex: 2 },
      },
    ]);
    expect(getCellSelectionSummary(store.getState()).cellCount).toBe(6);
  });

  test("deduplicates overlapping non-rectangular ranges without filling gaps", () => {
    const store = createCellSelectionStore();
    store.start({ columnIndex: 2, rowIndex: 1 });
    store.extendTo({ columnIndex: 3, rowIndex: 2 });
    store.end();

    store.start({ columnIndex: 3, rowIndex: 2 }, { additive: true });
    store.extendTo({ columnIndex: 4, rowIndex: 3 });
    store.end();

    const selectedCoordinates = store.getState().ranges.flatMap((range) => {
      const bounds = getCellSelectionBounds(range);
      return Array.from(
        {
          length:
            (bounds.right - bounds.left + 1) * (bounds.bottom - bounds.top + 1),
        },
        (_, index) => {
          const width = bounds.right - bounds.left + 1;
          return `${bounds.left + (index % width)}:${
            bounds.top + Math.floor(index / width)
          }`;
        }
      );
    });

    expect(selectedCoordinates).toHaveLength(7);
    expect(new Set(selectedCoordinates).size).toBe(7);
    expect(
      isCellSelected(store.getState(), { columnIndex: 2, rowIndex: 3 })
    ).toBe(false);
    expect(getCellSelectionSummary(store.getState()).cellCount).toBe(7);
  });

  test("selects all cells within the supplied data bounds and clears", () => {
    const store = createCellSelectionStore();

    store.selectAll({
      bottom: 4,
      left: 2,
      right: 6,
      top: 0,
    });

    expect(store.getState().ranges).toEqual([
      {
        anchor: { columnIndex: 2, rowIndex: 0 },
        focus: { columnIndex: 6, rowIndex: 4 },
      },
    ]);

    store.clear();

    expect(store.getState().ranges).toEqual([]);
  });

  test("does not notify subscribers when an action is a no-op", () => {
    const store = createCellSelectionStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.clear();
    store.end();

    expect(notifications).toBe(0);
  });
});

describe("cell selection clipboard formatting", () => {
  test("quotes tabs, line breaks, and quotes", () => {
    expect(
      formatCellSelectionForClipboard([
        [["one\ttwo", "line one\nline two", 'say "hello"']],
      ])
    ).toBe('"one\ttwo"\t"line one\nline two"\t"say ""hello"""');
  });

  test("preserves negative numeric values", () => {
    expect(
      formatCellSelectionForClipboard([
        [
          [
            { neutralizeFormula: false, text: "-2" },
            { neutralizeFormula: true, text: "=1+1" },
          ],
        ],
      ])
    ).toBe("-2\t'=1+1");
  });
});
