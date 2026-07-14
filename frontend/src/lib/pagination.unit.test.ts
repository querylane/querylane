import { describe, expect, it } from "vitest";
import { pageIndexForPageSizeChange } from "@/lib/pagination";

describe("pageIndexForPageSizeChange", () => {
  it("keeps the first currently visible row on the resized page", () => {
    expect(
      pageIndexForPageSizeChange({
        nextPageSize: 10,
        pageIndex: 1,
        pageSize: 25,
      })
    ).toBe(2);
  });
});
