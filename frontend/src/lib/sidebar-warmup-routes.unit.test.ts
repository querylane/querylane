import { describe, expect, test } from "@rstest/core";
import { getSidebarWarmupRouteIds } from "@/lib/sidebar-warmup-routes";

describe("sidebar warmup destinations", () => {
  test("warms at most 2 inactive instance destinations", () => {
    expect(
      getSidebarWarmupRouteIds("instance", "/instances/$instanceId/")
    ).toEqual([
      "/instances/$instanceId/configuration",
      "/instances/$instanceId/roles/",
    ]);
  });

  test("stays in database scope without warming the heavy explorer", () => {
    expect(
      getSidebarWarmupRouteIds(
        "database",
        "/instances/$instanceId/databases/$databaseId/"
      )
    ).toEqual(["/instances/$instanceId/databases/$databaseId/extensions"]);
  });

  test("does not warm routes without a selected instance", () => {
    expect(getSidebarWarmupRouteIds("none", "/new-instance")).toEqual([]);
  });
});
