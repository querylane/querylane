import { create } from "@bufbuild/protobuf";
import { describe, expect, test, vi } from "vitest";
import {
  cellNeedsFullValue,
  resolveFullCell,
  resolveRowCells,
} from "@/features/data-explorer/table-data/full-cell-resolver";
import { TableCellSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const completeCell = create(TableCellSchema, {
  value: { kind: { case: "stringValue", value: "small" } },
});

const truncatedCell = create(TableCellSchema, {
  fullValueToken: "token-1",
  truncated: true,
  value: { kind: { case: "stringValue", value: "pref" } },
});

const tokenlessTruncatedCell = create(TableCellSchema, {
  truncated: true,
  value: { kind: { case: "stringValue", value: "pref" } },
});

describe("cellNeedsFullValue", () => {
  test("requires both the truncated flag and a token", () => {
    expect(cellNeedsFullValue(undefined)).toBe(false);
    expect(cellNeedsFullValue(completeCell)).toBe(false);
    expect(cellNeedsFullValue(tokenlessTruncatedCell)).toBe(false);
    expect(cellNeedsFullValue(truncatedCell)).toBe(true);
  });
});

describe("resolveFullCell", () => {
  test("passes complete cells through without fetching", async () => {
    const fetchFullCell = vi.fn();

    await expect(resolveFullCell(completeCell, fetchFullCell)).resolves.toBe(
      completeCell
    );
    await expect(resolveFullCell(undefined, fetchFullCell)).resolves.toBe(
      undefined
    );
    expect(fetchFullCell).not.toHaveBeenCalled();
  });

  test("swaps a truncated cell for the fetched full value", async () => {
    const full = create(TableCellSchema, {
      value: { kind: { case: "stringValue", value: "prefix and the rest" } },
    });
    const fetchFullCell = vi.fn().mockResolvedValue(full);

    await expect(resolveFullCell(truncatedCell, fetchFullCell)).resolves.toBe(
      full
    );
    expect(fetchFullCell).toHaveBeenCalledWith("token-1");
  });

  test("throws when the fetched value is missing or still truncated", async () => {
    await expect(
      resolveFullCell(truncatedCell, () => Promise.resolve(undefined))
    ).rejects.toThrow("maximum fetchable size");
    await expect(
      resolveFullCell(truncatedCell, () =>
        Promise.resolve(create(TableCellSchema, { truncated: true }))
      )
    ).rejects.toThrow("maximum fetchable size");
  });
});

describe("resolveRowCells", () => {
  test("resolves only the cells that need it, preserving keys", async () => {
    const full = create(TableCellSchema, {
      value: { kind: { case: "stringValue", value: "full" } },
    });
    const fetchFullCell = vi.fn().mockResolvedValue(full);
    const cells = new Map([
      ["plain", completeCell],
      ["missing", undefined],
      ["big", truncatedCell],
    ]);

    const resolved = await resolveRowCells(cells, fetchFullCell);

    expect(resolved.get("plain")).toBe(completeCell);
    expect(resolved.get("missing")).toBe(undefined);
    expect(resolved.get("big")).toBe(full);
    expect(fetchFullCell).toHaveBeenCalledTimes(1);
  });
});
