import { describe, expect, test } from "vitest";
import {
  instanceRolesSearchSchema,
  isInstanceRolesTab,
} from "@/components/console-pages/instance-roles-search";

describe("instanceRolesSearchSchema", () => {
  test("normalizes legacy tab links", () => {
    expect(instanceRolesSearchSchema.parse({ tab: "definition" })).toEqual({
      tab: "details",
    });
    expect(instanceRolesSearchSchema.parse({ tab: "access-map" })).toEqual({
      tab: "map",
    });
  });

  test("keeps the documented details and map tab values", () => {
    expect(instanceRolesSearchSchema.parse({ tab: "details" })).toEqual({
      tab: "details",
    });
    expect(instanceRolesSearchSchema.parse({ tab: "map" })).toEqual({
      tab: "map",
    });
  });

  test("keeps the default details tab optional", () => {
    expect(instanceRolesSearchSchema.parse({})).toEqual({});
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

  test("rejects unsupported tab values", () => {
    expect(() => instanceRolesSearchSchema.parse({ tab: "access" })).toThrow();
  });

  test("recognizes normalized instance roles tabs", () => {
    expect(isInstanceRolesTab("details")).toBe(true);
    expect(isInstanceRolesTab("map")).toBe(true);
    expect(isInstanceRolesTab("access-map")).toBe(false);
  });
});
