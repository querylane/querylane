import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  getGridCell,
  setGridCell,
} from "@/components/data-grid/table-data-grid/grid-cell-access";
import {
  EXPAND_COLUMN_KEY,
  fallbackRowKey,
  type GridRow,
  ROW_KEY_FIELD,
} from "@/components/data-grid/table-data-grid/grid-row-model";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

function resultColumn(columnName: string) {
  return create(TableResultColumnSchema, { columnName });
}

function gridRow(rowKey = "row-1"): GridRow {
  return { [ROW_KEY_FIELD]: rowKey, cells: new Map() };
}

function stringCell(value: string) {
  return create(TableCellSchema, {
    value: create(TableValueSchema, {
      kind: { case: "stringValue", value },
    }),
  });
}

describe("grid cell access", () => {
  test("returns undefined for missing column keys", () => {
    expect(getGridCell(gridRow(), resultColumn("missing"))).toBeUndefined();
  });

  test("stores undefined cells under the proto result column name", () => {
    const row = gridRow();

    setGridCell(row, resultColumn("email"), undefined);

    expect(getGridCell(row, resultColumn("email"))).toBeUndefined();
    expect(row.cells.has("email")).toBe(true);
  });

  test("stores cells under the proto result column name", () => {
    const row = gridRow();
    const cell = stringCell("owner@example.com");

    setGridCell(row, resultColumn("email"), cell);

    expect(getGridCell(row, resultColumn("email"))).toEqual(cell);
  });

  test("a column literally named __rowKey cannot corrupt row identity", () => {
    const row = gridRow("server-key");
    const cell = stringCell("malicious");

    setGridCell(row, resultColumn(ROW_KEY_FIELD), cell);

    expect(row[ROW_KEY_FIELD]).toBe("server-key");
    expect(getGridCell(row, resultColumn(ROW_KEY_FIELD))).toEqual(cell);
  });

  test("reserved grid column keys cannot collide with PostgreSQL column names", () => {
    // PostgreSQL identifiers cannot contain a NUL byte, so namespaced keys
    // are guaranteed collision-free.
    expect(EXPAND_COLUMN_KEY).toContain("\u0000");
    expect(fallbackRowKey(3)).toContain("\u0000");
    expect(fallbackRowKey(3)).not.toBe(fallbackRowKey(4));
  });
});
