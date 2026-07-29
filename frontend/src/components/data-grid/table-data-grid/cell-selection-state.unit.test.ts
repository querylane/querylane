import { describe, expect, test } from "vitest";
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
  isCellSelected,
} from "@/components/data-grid/table-data-grid/cell-selection-state";

describe("cell selection state", () => {
  test("selects and drags a rectangular range", () => {
    const store = createCellSelectionStore();

    store.start({ columnIndex: 2, rowIndex: 1 });
    store.extendTo({ columnIndex: 4, rowIndex: 3 });

    expect(store.getState()).toEqual({
      isDragging: true,
      ranges: [
        {
          anchor: { columnIndex: 2, rowIndex: 1 },
          focus: { columnIndex: 4, rowIndex: 3 },
        },
      ],
    });
    expect(
      isCellSelected(store.getState(), { columnIndex: 3, rowIndex: 2 })
    ).toBe(true);
    expect(
      isCellSelected(store.getState(), { columnIndex: 5, rowIndex: 2 })
    ).toBe(false);
  });

  test("normalizes a range dragged up and left", () => {
    expect(
      getCellSelectionBounds({
        anchor: { columnIndex: 5, rowIndex: 4 },
        focus: { columnIndex: 2, rowIndex: 1 },
      })
    ).toEqual({
      bottom: 4,
      left: 2,
      right: 5,
      top: 1,
    });
  });

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
  test("formats rectangular and disjoint blocks as TSV", () => {
    expect(
      formatCellSelectionForClipboard([
        [
          ["Ada", "Lovelace"],
          ["Grace", "Hopper"],
        ],
        [["Linus", "Torvalds"]],
      ])
    ).toBe("Ada\tLovelace\nGrace\tHopper\n\nLinus\tTorvalds");
  });

  test("quotes tabs, line breaks, and quotes", () => {
    expect(
      formatCellSelectionForClipboard([
        [["one\ttwo", "line one\nline two", 'say "hello"']],
      ])
    ).toBe('"one\ttwo"\t"line one\nline two"\t"say ""hello"""');
  });

  test("neutralizes spreadsheet formulas", () => {
    expect(
      formatCellSelectionForClipboard([
        [["=1+1", " +SUM(A1:A2)", "-2", "@command", "safe"]],
      ])
    ).toBe("'=1+1\t' +SUM(A1:A2)\t'-2\t'@command\tsafe");
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
