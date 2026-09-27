import { describe, expect, test } from "@rstest/core";
import { instanceRolesSearchSchema } from "@/lib/instance-roles-search";

describe("instanceRolesSearchSchema", () => {
  test("normalizes legacy tab links", () => {
    expect(instanceRolesSearchSchema.parse({ tab: "definition" })).toEqual({
      tab: "details",
    });
    expect(instanceRolesSearchSchema.parse({ tab: "access-map" })).toEqual({
      tab: "map",
    });
  });

  test("keeps roles table search alongside the selected tab", () => {
    expect(
      instanceRolesSearchSchema.parse({
        q: "app",
        tab: "map",
        type: "login",
      })
    ).toEqual({
      q: "app",
      tab: "map",
      type: "login",
    });
  });

  test("drops unsupported role type filters", () => {
    expect(instanceRolesSearchSchema.parse({ type: "owner" })).toEqual({});
  });
});
