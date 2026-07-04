import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { describePostgresType } from "@/features/data-explorer/postgres-type-display";
import {
  ColumnSchema,
  DataType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function column(
  rawType: string,
  dataType: DataType,
  characterMaximumLength = 0
) {
  return create(ColumnSchema, {
    characterMaximumLength,
    columnName: "value",
    dataType,
    rawType,
  });
}

describe("describePostgresType", () => {
  test("explains timestamp with time zone using PostgreSQL timestamptz language", () => {
    const meta = describePostgresType(
      column("timestamp with time zone", DataType.TIMESTAMP)
    );

    expect(meta.category).toBe("Timestamp");
    expect(meta.badges).toContain("timestamptz");
    expect(meta.badges).toContain("8 bytes");
    expect(meta.summary).toContain("UTC-normalized");
  });

  test("distinguishes integer widths from exact numeric values", () => {
    expect(
      describePostgresType(column("smallint", DataType.INTEGER)).badges
    ).toContain("16-bit");
    expect(
      describePostgresType(column("integer", DataType.INTEGER)).badges
    ).toContain("32-bit");
    expect(
      describePostgresType(column("bigint", DataType.INTEGER)).badges
    ).toContain("64-bit");

    const numeric = describePostgresType(column("numeric", DataType.FLOAT));
    expect(numeric.category).toBe("Decimal");
    expect(numeric.badges).toContain("exact");
    expect(numeric.summary).toContain("selectable precision");
  });

  test("explains common PostgreSQL extension and container types", () => {
    expect(
      describePostgresType(column("jsonb", DataType.JSON)).summary
    ).toContain("binary JSON");
    expect(
      describePostgresType(column("text[]", DataType.ARRAY)).badges
    ).toContain("array");
    expect(
      describePostgresType(column("inet", DataType.UNKNOWN)).category
    ).toBe("Network");
    expect(
      describePostgresType(column("geometry", DataType.GEOMETRY)).category
    ).toBe("Spatial");
  });

  test("covers PostgreSQL range, system identifier, and snapshot types", () => {
    expect(
      describePostgresType(column("tstzrange", DataType.UNKNOWN)).category
    ).toBe("Range");
    expect(
      describePostgresType(column("regclass", DataType.UNKNOWN)).category
    ).toBe("Object ID");
    expect(
      describePostgresType(column("pg_snapshot", DataType.UNKNOWN)).category
    ).toBe("Snapshot");
    expect(
      describePostgresType(column("interval day to second", DataType.UNKNOWN))
        .category
    ).toBe("Interval");
  });
});
