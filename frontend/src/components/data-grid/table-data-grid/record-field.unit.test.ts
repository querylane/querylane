import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import { resolveEffectiveCell } from "@/components/data-grid/table-data-grid/record-field-state";
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
