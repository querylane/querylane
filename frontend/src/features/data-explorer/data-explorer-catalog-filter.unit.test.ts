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
    expect(buildNameContainsFilter(String.raw`naïve 数据 🐘 \'owner`)).toBe(
      String.raw`name:"naïve 数据 🐘 \\'owner"`
    );
  });

  it("trims and wraps simple name contains filters", () => {
    expect(buildNameContainsFilter("  accounts  ")).toBe('name:"accounts"');
  });

  it("leaves single quotes unchanged", () => {
    expect(buildNameContainsFilter("owner's table")).toBe(
      `name:"owner's table"`
    );
  });

  it("escapes double quotes", () => {
    expect(buildNameContainsFilter('owner\'s "table"')).toBe(
      String.raw`name:"owner's \"table\""`
    );
  });

  it("escapes backslashes before building the filter", () => {
    expect(buildNameContainsFilter(String.raw`tenant\archive`)).toBe(
      String.raw`name:"tenant\\archive"`
    );
  });

  it("escapes mixed quotes and backslashes deterministically", () => {
    expect(buildNameContainsFilter(String.raw`tenant\"archive`)).toBe(
      String.raw`name:"tenant\\\"archive"`
    );
  });
});
