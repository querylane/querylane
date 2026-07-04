import { describe, expect, test } from "vitest";
import { roleDetailSearchSchema } from "@/components/console-pages/role-detail-search";

describe("roleDetailSearchSchema", () => {
  test("parses an empty object (all fields are optional)", () => {
    const result = roleDetailSearchSchema.parse({});

    expect(result).toEqual({});
  });

  test("parses valid tab values", () => {
    for (const tab of [
      "overview",
      "grants",
      "members",
      "access-map",
      "definition",
    ] as const) {
      const result = roleDetailSearchSchema.parse({ tab });
      expect(result.tab).toBe(tab);
    }
  });

  test("rejects an unknown tab value", () => {
    expect(() => roleDetailSearchSchema.parse({ tab: "unknown" })).toThrow();
  });

  test("parses valid grantsReach values", () => {
    for (const reach of ["owns", "defaults", "public"] as const) {
      const result = roleDetailSearchSchema.parse({ grantsReach: reach });
      expect(result.grantsReach).toBe(reach);
    }
  });

  test("rejects an unknown grantsReach value", () => {
    expect(() =>
      roleDetailSearchSchema.parse({ grantsReach: "something" })
    ).toThrow();
  });

  test("parses valid grantsType values", () => {
    const validTypes = [
      "tables",
      "views",
      "matviews",
      "sequences",
      "foreign-tables",
      "functions",
      "large-objects",
      "schema",
      "database",
    ] as const;

    for (const grantsType of validTypes) {
      const result = roleDetailSearchSchema.parse({ grantsType });
      expect(result.grantsType).toBe(grantsType);
    }
  });

  test("rejects an unknown grantsType value", () => {
    expect(() =>
      roleDetailSearchSchema.parse({ grantsType: "invalid-type" })
    ).toThrow();
  });

  test("parses grantsSchema as an arbitrary string", () => {
    const result = roleDetailSearchSchema.parse({ grantsSchema: "public" });
    expect(result.grantsSchema).toBe("public");
  });

  test("parses all fields together", () => {
    const input = {
      grantsReach: "owns",
      grantsSchema: "public",
      grantsType: "tables",
      tab: "grants",
    };

    const result = roleDetailSearchSchema.parse(input);

    expect(result).toEqual(input);
  });

  test("safeParse returns success=false for invalid input without throwing", () => {
    const result = roleDetailSearchSchema.safeParse({ tab: 123 });
    expect(result.success).toBe(false);
  });

  test("undefined optional fields remain absent in the parsed output", () => {
    const result = roleDetailSearchSchema.parse({ tab: "overview" });

    expect(result.grantsReach).toBeUndefined();
    expect(result.grantsSchema).toBeUndefined();
    expect(result.grantsType).toBeUndefined();
  });
});
