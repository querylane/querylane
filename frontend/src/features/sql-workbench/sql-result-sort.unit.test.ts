import { create } from "@bufbuild/protobuf";
import { expect, test } from "@rstest/core";
import { sortSqlResultRows } from "@/features/sql-workbench/sql-result-sort";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableResultRowSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const columns = [create(TableResultColumnSchema, { columnName: "amount" })];
function numericRow(value: string) {
  return create(TableResultRowSchema, {
    rowKey: value,
    values: [
      create(TableCellSchema, {
        value: { kind: { case: "numericValue", value } },
      }),
    ],
  });
}
test("SQL result sorting preserves decimal precision, signs and exponent magnitudes", () => {
  const input = [
    "0.12",
    "9007199254740993.01",
    "-0.003",
    "0",
    "1e-3",
    "9007199254740993.001",
    "-12",
    "0.2",
  ].map(numericRow);
  expect(
    sortSqlResultRows(input, columns, [{ id: "amount", desc: false }]).map(
      (row) => row.rowKey
    )
  ).toEqual([
    "-12",
    "-0.003",
    "0",
    "1e-3",
    "0.12",
    "0.2",
    "9007199254740993.001",
    "9007199254740993.01",
  ]);
  expect(input[0]?.rowKey).toBe("0.12");
});
test("SQL sorting keeps missing values last and leaves stale-column bookmarks harmless", () => {
  const rows = [
    numericRow("-1"),
    create(TableResultRowSchema, {
      rowKey: "null",
      values: [create(TableCellSchema)],
    }),
    numericRow("2"),
  ];
  expect(
    sortSqlResultRows(rows, columns, [{ id: "amount", desc: true }]).map(
      (row) => row.rowKey
    )
  ).toEqual(["2", "-1", "null"]);
  expect(
    sortSqlResultRows(rows, columns, [{ id: "removed", desc: false }])
  ).toEqual(rows);
});
