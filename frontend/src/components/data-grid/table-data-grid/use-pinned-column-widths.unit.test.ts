import { describe, expect, it } from "@rstest/core";
import { act, renderHook } from "@testing-library/react";
import {
  pinColumnWidths,
  usePinnedColumnWidths,
} from "@/components/data-grid/table-data-grid/use-pinned-column-widths";

describe("pinColumnWidths", () => {
  it("turns measured widths into resized ones so the grid stops re-flowing them", () => {
    const pinned = pinColumnWidths(
      new Map([
        ["id", { type: "measured" as const, width: 145 }],
        ["status", { type: "resized" as const, width: 284 }],
      ])
    );
    expect([...pinned]).toEqual([
      ["id", { type: "resized", width: 145 }],
      ["status", { type: "resized", width: 284 }],
    ]);
  });
});

describe("usePinnedColumnWidths", () => {
  it("leaves the grid uncontrolled until rows are on screen", () => {
    const { result } = renderHook(() =>
      usePinnedColumnWidths({ columnSignature: "id|name", hasRows: false })
    );
    expect(result.current).toEqual({
      columnWidths: undefined,
      onColumnWidthsChange: undefined,
    });
  });

  it("pins reported widths and starts over when the columns change", () => {
    const { rerender, result } = renderHook(
      ({ columnSignature }) =>
        usePinnedColumnWidths({ columnSignature, hasRows: true }),
      { initialProps: { columnSignature: "id|name" } }
    );
    expect(result.current.columnWidths?.size).toBe(0);

    act(() =>
      result.current.onColumnWidthsChange?.(
        new Map([["id", { type: "measured", width: 80 }]])
      )
    );
    expect([...(result.current.columnWidths ?? [])]).toEqual([
      ["id", { type: "resized", width: 80 }],
    ]);

    rerender({ columnSignature: "id|email" });
    expect(result.current.columnWidths?.size).toBe(0);
  });
});
