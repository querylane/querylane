import { describe, expect, test } from "@rstest/core";
import type { SortColumn } from "react-data-grid";
import { toggleColumnSortDirection } from "@/features/data-explorer/table-data/sort-state";

describe("toggleColumnSortDirection", () => {
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
