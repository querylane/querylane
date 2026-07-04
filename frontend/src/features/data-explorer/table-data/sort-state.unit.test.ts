import type { SortColumn } from "react-data-grid";
import { describe, expect, test } from "vitest";
import { toggleColumnSortDirection } from "@/features/data-explorer/table-data/sort-state";

describe("toggleColumnSortDirection", () => {
  test("clears an active ascending sort when ascending is selected again", () => {
    expect(
      toggleColumnSortDirection({
        columnKey: "quantity",
        direction: "ASC",
        sortColumns: [{ columnKey: "quantity", direction: "ASC" }],
      })
    ).toEqual([]);
  });

  test("clears an active descending sort when descending is selected again", () => {
    expect(
      toggleColumnSortDirection({
        columnKey: "quantity",
        direction: "DESC",
        sortColumns: [{ columnKey: "quantity", direction: "DESC" }],
      })
    ).toEqual([]);
  });

  test("changes direction for an active column while preserving other sorts", () => {
    const sortColumns: SortColumn[] = [
      { columnKey: "quantity", direction: "ASC" },
      { columnKey: "price", direction: "DESC" },
    ];

    expect(
      toggleColumnSortDirection({
        columnKey: "quantity",
        direction: "DESC",
        sortColumns,
      })
    ).toEqual([
      { columnKey: "quantity", direction: "DESC" },
      { columnKey: "price", direction: "DESC" },
    ]);
  });

  test("clears one column from a multi-sort without disturbing the rest", () => {
    const sortColumns: SortColumn[] = [
      { columnKey: "quantity", direction: "ASC" },
      { columnKey: "price", direction: "DESC" },
    ];

    expect(
      toggleColumnSortDirection({
        columnKey: "quantity",
        direction: "ASC",
        sortColumns,
      })
    ).toEqual([{ columnKey: "price", direction: "DESC" }]);
  });

  test("adds a new sort when the column was not active", () => {
    expect(
      toggleColumnSortDirection({
        columnKey: "created_at",
        direction: "DESC",
        sortColumns: [],
      })
    ).toEqual([{ columnKey: "created_at", direction: "DESC" }]);
  });

  test("appends a new column to an existing multi-sort instead of wiping it", () => {
    const sortColumns: SortColumn[] = [
      { columnKey: "quantity", direction: "ASC" },
      { columnKey: "price", direction: "DESC" },
    ];

    expect(
      toggleColumnSortDirection({
        columnKey: "created_at",
        direction: "DESC",
        sortColumns,
      })
    ).toEqual([
      { columnKey: "quantity", direction: "ASC" },
      { columnKey: "price", direction: "DESC" },
      { columnKey: "created_at", direction: "DESC" },
    ]);
  });
});
