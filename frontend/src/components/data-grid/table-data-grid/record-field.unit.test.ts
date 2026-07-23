import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  buildByteaDownloadFilename,
  resolveEffectiveCell,
} from "@/components/data-grid/table-data-grid/record-field-state";
import { TableCellSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

describe("resolveEffectiveCell", () => {
  test("uses the resolved cell only when a non-empty token matches", () => {
    const current = create(TableCellSchema, { fullValueToken: "" });
    const staleResolved = {
      cell: create(TableCellSchema, { fullValueToken: "" }),
      fullValueToken: "",
    };

    expect(resolveEffectiveCell(current, staleResolved)).toBe(current);
  });

  test("uses the resolved cell when the full-value token matches", () => {
    const current = create(TableCellSchema, {
      fullValueToken: "token-1",
      truncated: true,
    });
    const resolved = {
      cell: create(TableCellSchema, { fullValueToken: "" }),
      fullValueToken: "token-1",
    };

    expect(resolveEffectiveCell(current, resolved)).toBe(resolved.cell);
  });
});

describe("buildByteaDownloadFilename", () => {
  test("joins table, column, and row identifier", () => {
    expect(
      buildByteaDownloadFilename({
        columnName: "avatar",
        rowIdentifier: "42",
        table: "users",
      })
    ).toBe("users_avatar_42.bin");
  });

  test("omits a missing identifier and sanitizes unsafe characters", () => {
    expect(
      buildByteaDownloadFilename({ columnName: "raw data", table: "my table" })
    ).toBe("my_table_raw_data.bin");
    expect(
      buildByteaDownloadFilename({
        columnName: "blob",
        rowIdentifier: "a/b:c",
        table: "t",
      })
    ).toBe("t_blob_a_b_c.bin");
  });

  test("caps an oversized identifier", () => {
    const filename = buildByteaDownloadFilename({
      columnName: "blob",
      rowIdentifier: "x".repeat(200),
      table: "t",
    });

    expect(filename).toBe(`t_blob_${"x".repeat(40)}.bin`);
  });

  test("falls back to a generic stem when everything sanitizes away", () => {
    expect(buildByteaDownloadFilename({ columnName: "", table: "" })).toBe(
      "value.bin"
    );
  });
});
