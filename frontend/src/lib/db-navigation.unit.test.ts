import { describe, expect, test } from "vitest";
import { resolveScopeLevel } from "@/lib/db-navigation";

describe("resolveScopeLevel", () => {
  test("prefers database scope when both ids are present", () => {
    expect(
      resolveScopeLevel({ databaseId: "postgres", instanceId: "local" })
    ).toBe("database");
  });

  test("resolves instance scope when only the instance is selected", () => {
    expect(resolveScopeLevel({ instanceId: "local" })).toBe("instance");
  });

  test("resolves none when nothing is selected", () => {
    expect(resolveScopeLevel({})).toBe("none");
  });
});
