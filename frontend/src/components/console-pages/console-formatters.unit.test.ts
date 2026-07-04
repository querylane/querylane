import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";

import {
  ConstraintType,
  TableConstraintSchema,
  TableIndexSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

import {
  buildColumnDecorators,
  buildTruncatedTextPreview,
} from "./console-formatters";

describe("buildTruncatedTextPreview", () => {
  test("returns dash for empty string", () => {
    const result = buildTruncatedTextPreview("");
    expect(result).toEqual({
      displayValue: "—",
      forceTooltip: false,
      tooltipContent: undefined,
    });
  });

  test("returns dash for whitespace-only string", () => {
    const result = buildTruncatedTextPreview("   ");
    expect(result).toEqual({
      displayValue: "—",
      forceTooltip: false,
      tooltipContent: undefined,
    });
  });

  test("returns value unchanged when within limit", () => {
    const result = buildTruncatedTextPreview("hello world");
    expect(result).toEqual({
      displayValue: "hello world",
      forceTooltip: false,
      tooltipContent: undefined,
    });
  });

  test("returns value unchanged when exactly at limit", () => {
    const value = "a".repeat(120);
    const result = buildTruncatedTextPreview(value);
    expect(result).toEqual({
      displayValue: value,
      forceTooltip: false,
      tooltipContent: undefined,
    });
  });

  test("truncates and adds ellipsis when over limit", () => {
    const value = "a".repeat(130);
    const result = buildTruncatedTextPreview(value);
    expect(result.displayValue).toBe("a".repeat(120) + "…");
    expect(result.forceTooltip).toBe(true);
    expect(result.tooltipContent).toBe(value);
  });

  test("respects custom maxLength", () => {
    const result = buildTruncatedTextPreview("abcdefghij", 5);
    expect(result.displayValue).toBe("abcde…");
    expect(result.forceTooltip).toBe(true);
    expect(result.tooltipContent).toBe("abcdefghij");
  });

  test("trims trailing whitespace from truncated portion", () => {
    // "abc  " (5 chars) + more => truncate at 5 => "abc  " trimEnd => "abc"
    const result = buildTruncatedTextPreview("abc  defgh", 5);
    expect(result.displayValue).toBe("abc…");
  });
});

describe("buildColumnDecorators", () => {
  test("returns empty sets when no constraints or indexes", () => {
    const result = buildColumnDecorators({ constraints: [], indexes: [] });
    expect(result.foreignKeyColumns.size).toBe(0);
    expect(result.indexedColumns.size).toBe(0);
  });

  test("collects foreign key columns from constraints", () => {
    const fk = create(TableConstraintSchema, {
      columnNames: ["user_id", "org_id"],
      type: ConstraintType.FOREIGN_KEY,
    });
    const pk = create(TableConstraintSchema, {
      columnNames: ["id"],
      type: ConstraintType.PRIMARY_KEY,
    });

    const result = buildColumnDecorators({
      constraints: [fk, pk],
      indexes: [],
    });
    expect(result.foreignKeyColumns).toEqual(new Set(["user_id", "org_id"]));
  });

  test("ignores non-foreign-key constraints", () => {
    const unique = create(TableConstraintSchema, {
      columnNames: ["email"],
      type: ConstraintType.UNIQUE,
    });

    const result = buildColumnDecorators({
      constraints: [unique],
      indexes: [],
    });
    expect(result.foreignKeyColumns.size).toBe(0);
  });

  test("collects indexed columns from key and included columns", () => {
    const index = create(TableIndexSchema, {
      includedColumns: ["email"],
      keyColumns: ["name"],
    });

    const result = buildColumnDecorators({ constraints: [], indexes: [index] });
    expect(result.indexedColumns).toEqual(new Set(["name", "email"]));
  });

  test("deduplicates columns across multiple indexes", () => {
    const idx1 = create(TableIndexSchema, {
      includedColumns: [],
      keyColumns: ["name"],
    });
    const idx2 = create(TableIndexSchema, {
      includedColumns: [],
      keyColumns: ["name", "age"],
    });

    const result = buildColumnDecorators({
      constraints: [],
      indexes: [idx1, idx2],
    });
    expect(result.indexedColumns).toEqual(new Set(["name", "age"]));
  });
});
