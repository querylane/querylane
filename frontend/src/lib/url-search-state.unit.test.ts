import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "@/lib/url-search-state";

describe("url search state", () => {
  it("keeps clean URL defaults by normalizing empty search text", () => {
    expect(normalizeSearchText("   ")).toBe("");
  });

  it("preserves meaningful search text exactly as typed", () => {
    expect(normalizeSearchText("foo bar ")).toBe("foo bar ");
    expect(normalizeSearchText("  App_User  ")).toBe("  App_User  ");
  });
});
