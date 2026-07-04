import { describe, expect, it } from "vitest";
import { buildNameContainsFilter } from "@/features/data-explorer/data-explorer-catalog-filter";

describe("buildNameContainsFilter", () => {
  it("omits blank queries", () => {
    expect(buildNameContainsFilter("   ")).toBeUndefined();
  });

  it("omits an empty string query", () => {
    expect(buildNameContainsFilter("")).toBeUndefined();
  });

  it("preserves unusual unicode while escaping the filter literal", () => {
    expect(buildNameContainsFilter("naïve 数据 🐘 \\'owner")).toBe(
      "name.contains('naïve 数据 🐘 \\\\\\'owner')"
    );
  });

  it("trims and wraps simple name contains filters", () => {
    expect(buildNameContainsFilter("  accounts  ")).toBe(
      "name.contains('accounts')"
    );
  });

  it("escapes single quotes", () => {
    expect(buildNameContainsFilter("owner's table")).toBe(
      "name.contains('owner\\'s table')"
    );
  });

  it("escapes backslashes before building the filter", () => {
    expect(buildNameContainsFilter(String.raw`tenant\archive`)).toBe(
      String.raw`name.contains('tenant\\archive')`
    );
  });

  it("escapes mixed quotes and backslashes deterministically", () => {
    expect(buildNameContainsFilter(String.raw`tenant\'archive`)).toBe(
      String.raw`name.contains('tenant\\\'archive')`
    );
  });
});
