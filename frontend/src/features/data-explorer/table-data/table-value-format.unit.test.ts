import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  type FormattedCell,
  formatTableCell,
} from "@/features/data-explorer/table-data/table-value-format";
import {
  TableCellSchema,
  TableResultColumnSchema,
  type TableValue,
  TableValueSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

function column(dataType = DataType.STRING, rawType = "text") {
  return create(TableResultColumnSchema, {
    columnName: "value",
    dataType,
    rawType,
  });
}

function cell(
  kind: TableValue["kind"],
  options: { fullSizeBytes?: bigint; truncated?: boolean } = {}
) {
  return create(TableCellSchema, {
    ...(options.fullSizeBytes === undefined
      ? {}
      : { fullSizeBytes: options.fullSizeBytes }),
    ...(options.truncated === undefined
      ? {}
      : { truncated: options.truncated }),
    value: create(TableValueSchema, { kind }),
  });
}

describe("formatTableCell", () => {
  test("treats missing and explicit null cells as SQL NULL", () => {
    const expected = {
      display: "NULL",
      isNull: true,
      isTruncated: false,
      kind: "null",
    } satisfies FormattedCell;

    expect(formatTableCell(undefined, column())).toEqual(expected);
    expect(
      formatTableCell(cell({ case: "nullValue", value: 0 }), column())
    ).toEqual(expected);
  });

  test("formats booleans and never marks them truncated", () => {
    expect(
      formatTableCell(
        cell({ case: "boolValue", value: true }, { truncated: true }),
        column(DataType.BOOLEAN)
      )
    ).toEqual({
      display: "true",
      isNull: false,
      isTruncated: false,
      kind: "bool",
    });
  });

  test("formats numeric cases as numbers", () => {
    expect(
      formatTableCell(cell({ case: "int64Value", value: 42n }), column())
    ).toMatchObject({ display: "42", kind: "number" });
    expect(
      formatTableCell(
        cell({ case: "doubleValue", value: 12.345_678_9 }),
        column()
      )
    ).toMatchObject({ display: "12.345679", kind: "number" });
    expect(
      formatTableCell(
        cell({ case: "numericValue", value: "1234567890.123456789" }),
        column()
      )
    ).toMatchObject({ display: "1234567890.123456789", kind: "number" });
  });

  test("uses full byte size when present and preserves truncation", () => {
    expect(
      formatTableCell(
        cell(
          { case: "bytesValue", value: new Uint8Array([1, 2, 3]) },
          { fullSizeBytes: 4096n, truncated: true }
        ),
        column(DataType.BINARY)
      )
    ).toEqual({
      display: "‹4,096 bytes›",
      isNull: false,
      isTruncated: true,
      kind: "bytes",
    });
  });

  test("distinguishes date timestamps from timestamp values", () => {
    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "2026-05-20T00:00:00Z" }),
        column(DataType.DATE)
      )
    ).toMatchObject({ display: "2026-05-20", kind: "date" });

    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "not-a-timestamp" }),
        column(DataType.TIMESTAMP)
      )
    ).toMatchObject({ display: "not-a-timestamp", kind: "timestamp" });
  });

  test("renders timezone-bearing timestamps with their returned zone", () => {
    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "2026-05-20 10:11:12+00" }),
        column(DataType.TIMESTAMP, "timestamptz")
      )
    ).toMatchObject({
      display: "2026-05-20 10:11:12 UTC",
      kind: "timestamp",
      timezoneLabel: "UTC",
    });

    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "2026-05-20T10:11:12+05:30" }),
        column(DataType.TIMESTAMP, "timestamp with time zone")
      )
    ).toMatchObject({
      display: "2026-05-20 10:11:12 UTC+05:30",
      kind: "timestamp",
      timezoneLabel: "UTC+05:30",
    });
  });

  test("does not invent a zone for timestamp without time zone values", () => {
    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "2026-05-20T10:11:12Z" }),
        column(DataType.TIMESTAMP, "timestamp(3)")
      )
    ).toMatchObject({
      display: "2026-05-20 10:11:12",
      kind: "timestamp",
      timezoneLabel: undefined,
    });
  });

  test("formats time-only values without inventing date or zone context", () => {
    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "12:34:56.123456" }),
        column(DataType.TIME, "time(6)")
      )
    ).toMatchObject({
      display: "12:34:56.123456",
      kind: "timestamp",
      timezoneLabel: undefined,
    });

    expect(
      formatTableCell(
        cell({ case: "timestampValue", value: "12:34:56+05:30" }),
        column(DataType.TIME, "timetz")
      )
    ).toMatchObject({
      display: "12:34:56 UTC+05:30",
      kind: "timestamp",
      timezoneLabel: "UTC+05:30",
    });
  });

  test("formats PostgreSQL array columns as array cells", () => {
    expect(
      formatTableCell(
        cell({ case: "stringValue", value: '{alpha,beta,"needs review"}' }),
        column(DataType.ARRAY)
      )
    ).toEqual({
      display: '{alpha,beta,"needs review"}',
      isNull: false,
      isTruncated: false,
      kind: "array",
    });
  });

  test("falls back to text for string values and carries truncation metadata", () => {
    expect(
      formatTableCell(
        cell({ case: "stringValue", value: "prefix" }, { truncated: true }),
        column(DataType.STRING)
      )
    ).toEqual({
      display: "prefix",
      isNull: false,
      isTruncated: true,
      kind: "text",
    });
  });
});

test("formats empty timestamps, JSON values, and byte values without full size", () => {
  expect(
    formatTableCell(cell({ case: "timestampValue", value: "" }), column())
  ).toMatchObject({ display: "", kind: "timestamp" });
  expect(
    formatTableCell(
      cell({ case: "jsonValue", value: '{"ok":true}' }, { truncated: true }),
      column(DataType.JSON)
    )
  ).toMatchObject({ display: '{"ok":true}', isTruncated: true, kind: "json" });
  expect(
    formatTableCell(
      cell({
        case: "bytesValue",
        value: new Uint8Array([1, 2, 3]),
      }),
      column(DataType.BINARY)
    )
  ).toMatchObject({ display: "‹3 bytes›", kind: "bytes" });
});
