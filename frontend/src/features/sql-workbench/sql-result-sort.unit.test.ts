import { create } from "@bufbuild/protobuf";
import { NullValue } from "@bufbuild/protobuf/wkt";
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
function timestampRow(rowKey: string, value: string) {
  return create(TableResultRowSchema, {
    rowKey,
    values: [
      create(TableCellSchema, {
        value: { kind: { case: "timestampValue", value } },
      }),
    ],
  });
}
function doubleRow(rowKey: string, value: number) {
  return create(TableResultRowSchema, {
    rowKey,
    values: [
      create(TableCellSchema, {
        value: { kind: { case: "doubleValue", value } },
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
  ].map((value) => numericRow(value));
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
test("SQL timestamp sorting preserves fractional precision, offsets and stable equal instants", () => {
  const rows = [
    timestampRow("unknown-first", "unrecognized"),
    timestampRow("hundred-ms", "2026-11-07T00:00:00.1Z"),
    timestampRow("twenty-ms", "2026-11-07T00:00:00.02Z"),
    timestampRow("ten-us", "2026-11-07T00:00:00.00001Z"),
    timestampRow("one-us", "2026-11-07T00:00:00.000001Z"),
    timestampRow("same-one-us", "2026-11-07T01:00:00.000001+01:00"),
    timestampRow("two-us", "2026-11-06T23:00:00.000002-01:00"),
    timestampRow("one-ns", "2026-11-07T00:00:00.000000001Z"),
    timestampRow("out-of-range", "10000-01-01T00:00:00Z"),
    timestampRow("unknown-second", "unrecognized"),
  ];
  expect(
    sortSqlResultRows(rows, columns, [{ id: "amount", desc: false }]).map(
      (row) => row.rowKey
    )
  ).toEqual([
    "one-ns",
    "one-us",
    "same-one-us",
    "two-us",
    "ten-us",
    "twenty-ms",
    "hundred-ms",
    "out-of-range",
    "unknown-first",
    "unknown-second",
  ]);
  expect(
    sortSqlResultRows(rows, columns, [{ id: "amount", desc: true }]).map(
      (row) => row.rowKey
    )
  ).toEqual([
    "unknown-first",
    "unknown-second",
    "out-of-range",
    "hundred-ms",
    "twenty-ms",
    "ten-us",
    "two-us",
    "one-us",
    "same-one-us",
    "one-ns",
  ]);
});
test.each([
  ["2026-11-07T00:00:00.1", "2026-11-07T00:00:00.02"],
  ["00:00:00.1", "00:00:00.02"],
  ["01:00:00.1+01:00", "02:00:00.02+02:00"],
])(
  "SQL temporal sorting normalizes producer formats %s and %s",
  (later, earlier) => {
    const rows = [
      timestampRow("later", later),
      timestampRow("earlier", earlier),
    ];
    expect(
      sortSqlResultRows(rows, columns, [{ id: "amount", desc: false }]).map(
        (row) => row.rowKey
      )
    ).toEqual(["earlier", "later"]);
    expect(
      sortSqlResultRows(rows, columns, [{ id: "amount", desc: true }]).map(
        (row) => row.rowKey
      )
    ).toEqual(["later", "earlier"]);
  }
);
test("SQL floating-point sorting orders NaN after infinity, preserves ties and keeps actual nulls last", () => {
  const rows = [
    doubleRow("two", 2),
    doubleRow("nan-first", Number.NaN),
    doubleRow("one", 1),
    create(TableResultRowSchema, {
      rowKey: "null",
      values: [
        create(TableCellSchema, {
          value: { kind: { case: "nullValue", value: NullValue.NULL_VALUE } },
        }),
      ],
    }),
    doubleRow("positive-infinity", Number.POSITIVE_INFINITY),
    doubleRow("negative-infinity", Number.NEGATIVE_INFINITY),
    doubleRow("nan-second", Number.NaN),
    doubleRow("same-one", 1),
    create(TableResultRowSchema, { rowKey: "missing" }),
  ];
  expect(
    sortSqlResultRows(rows, columns, [{ id: "amount", desc: false }]).map(
      (row) => row.rowKey
    )
  ).toEqual([
    "negative-infinity",
    "one",
    "same-one",
    "two",
    "positive-infinity",
    "nan-first",
    "nan-second",
    "null",
    "missing",
  ]);
  expect(
    sortSqlResultRows(rows, columns, [{ id: "amount", desc: true }]).map(
      (row) => row.rowKey
    )
  ).toEqual([
    "nan-first",
    "nan-second",
    "positive-infinity",
    "two",
    "one",
    "same-one",
    "negative-infinity",
    "null",
    "missing",
  ]);
});
