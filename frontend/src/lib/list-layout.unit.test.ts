import { expect, test } from "@rstest/core";
import {
  compareListCellValues,
  resolveListColumnOrder,
  sortListRows,
} from "@/lib/list-layout";

test("column order drops stale duplicates and appends new columns", () => {
  expect(
    resolveListColumnOrder(
      ["owner", "removed", "owner"],
      ["name", "owner", "size"]
    )
  ).toEqual(["owner", "name", "size"]);
});

test("row sorting uses raw values, is stable, and keeps missing values last", () => {
  const rows = [
    { name: "unknown-first", value: undefined },
    { name: "large", value: 9007199254740993n },
    { name: "small", value: 9007199254740992n },
    { name: "same", value: 9007199254740992n },
    { name: "unknown", value: undefined },
  ];
  expect(
    sortListRows(rows, [{ id: "value", desc: false }], {
      value: (row) => row.value,
    }).map((row) => row.name)
  ).toEqual(["small", "same", "large", "unknown-first", "unknown"]);
  expect(
    sortListRows(rows, [{ id: "value", desc: true }], {
      value: (row) => row.value,
    }).map((row) => row.name)
  ).toEqual(["large", "small", "same", "unknown-first", "unknown"]);
  expect(
    sortListRows(rows, [{ id: "removed", desc: true }], {
      value: (row) => row.value,
    })
  ).toEqual(rows);
});

test("metadata timestamps compare by seconds and nanos instead of object identity", () => {
  expect(
    compareListCellValues(
      { seconds: 100n, nanos: 1 },
      { seconds: 100n, nanos: 9 }
    )
  ).toBeLessThan(0);
  expect(
    compareListCellValues(
      { seconds: 101n, nanos: 0 },
      { seconds: 100n, nanos: 999_999_999 }
    )
  ).toBeGreaterThan(0);
});
