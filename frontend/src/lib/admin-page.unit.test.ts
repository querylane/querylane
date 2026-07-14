import { describe, expect, test } from "vitest";
import {
  canRenderAdminPageAtScope,
  getDefaultAdminPageForScope,
  instanceLayoutSearchSchema,
  resolveCurrentAdminPage,
  resolveImplicitAdminPageFromRouteId,
  resolveRequestedAdminPageForScope,
} from "@/lib/admin-page";

describe("canRenderAdminPageAtScope", () => {
  test.each([
    // Instance pages render at instance and above
    { expected: true, page: "instance.overview", scope: "instance" },
    { expected: true, page: "instance.activity", scope: "instance" },
    { expected: true, page: "instance.roles", scope: "database" },
    { expected: true, page: "instance.configuration", scope: "database" },
    // Database pages need at least database scope
    { expected: false, page: "database.overview", scope: "instance" },
    { expected: true, page: "database.overview", scope: "database" },
    { expected: false, page: "database.extensions", scope: "instance" },
    { expected: true, page: "database.extensions", scope: "database" },
    { expected: false, page: "database.explorer", scope: "instance" },
    { expected: true, page: "database.explorer", scope: "database" },
    { expected: false, page: "database.workbench", scope: "instance" },
    { expected: true, page: "database.workbench", scope: "database" },
    // "none" scope cannot render any page
    { expected: false, page: "instance.overview", scope: "none" },
    { expected: false, page: "database.overview", scope: "none" },
  ] as const)("$page at $scope -> $expected", ({ page, scope, expected }) => {
    expect(canRenderAdminPageAtScope(page, scope)).toBe(expected);
  });
});

describe("getDefaultAdminPageForScope", () => {
  test.each([
    { expected: "instance.overview", scope: "instance" },
    { expected: "database.overview", scope: "database" },
    { expected: undefined, scope: "none" },
  ] as const)("$scope -> $expected", ({ scope, expected }) => {
    expect(getDefaultAdminPageForScope(scope)).toBe(expected);
  });
});

describe("resolveCurrentAdminPage", () => {
  test("returns explicit page when valid for scope", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/instances/x",
        scope: "database",
        value: "database.explorer",
      })
    ).toBe("database.explorer");
  });

  test("falls back to scope default when explicit page is invalid for scope", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/instances/x",
        scope: "instance",
        value: "database.explorer",
      })
    ).toBe("instance.overview");
  });

  test("resolves from pathname when no explicit value given", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/instances/x/databases/db/explorer",
        scope: "database",
        value: undefined,
      })
    ).toBe("database.explorer");
  });

  test("returns scope default when no value and pathname has no match", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/unknown",
        scope: "database",
        value: undefined,
      })
    ).toBe("database.overview");
  });

  test("returns undefined for 'none' scope with no matching page", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/unknown",
        scope: "none",
        value: undefined,
      })
    ).toBeUndefined();
  });

  test.each([
    {
      expected: "instance.activity",
      pathname: "/instances/x/activity",
      scope: "instance",
    },
    {
      expected: "instance.configuration",
      pathname: "/instances/x/configuration",
      scope: "instance",
    },
    {
      expected: "instance.roles",
      pathname: "/instances/x/roles",
      scope: "instance",
    },
    {
      expected: "instance.roles",
      pathname: "/instances/x/roles/abc123",
      scope: "instance",
    },
    {
      expected: "database.extensions",
      pathname: "/instances/x/databases/db/extensions",
      scope: "database",
    },
    {
      expected: "database.overview",
      pathname: "/instances/x/databases/db/insights",
      scope: "database",
    },
    {
      expected: "database.explorer",
      pathname: "/instances/x/databases/db/explorer",
      scope: "database",
    },
    {
      expected: "database.workbench",
      pathname: "/instances/x/databases/db/workbench",
      scope: "database",
    },
    {
      expected: "database.overview",
      pathname: "/instances/x/databases/db",
      scope: "database",
    },
  ] as const)("implicit from pathname $pathname -> $expected", ({
    pathname,
    scope,
    expected,
  }) => {
    expect(resolveCurrentAdminPage({ pathname, scope, value: undefined })).toBe(
      expected
    );
  });

  test("explicit value takes priority over pathname", () => {
    expect(
      resolveCurrentAdminPage({
        pathname: "/instances/x/databases/db/explorer",
        scope: "database",
        value: "database.overview",
      })
    ).toBe("database.overview");
  });
});

describe("resolveRequestedAdminPageForScope", () => {
  test("returns valid page that fits scope", () => {
    expect(
      resolveRequestedAdminPageForScope("database.explorer", "database")
    ).toBe("database.explorer");
  });

  test("returns scope default when page does not fit scope", () => {
    expect(
      resolveRequestedAdminPageForScope("database.explorer", "instance")
    ).toBe("instance.overview");
  });

  test("returns undefined for non-string value", () => {
    const numericValue = 42;
    expect(
      resolveRequestedAdminPageForScope(numericValue, "instance")
    ).toBeUndefined();
    expect(resolveRequestedAdminPageForScope(null, "database")).toBeUndefined();
    expect(
      resolveRequestedAdminPageForScope(undefined, "database")
    ).toBeUndefined();
  });

  test("returns undefined for invalid page id string", () => {
    expect(
      resolveRequestedAdminPageForScope("not.a.page", "instance")
    ).toBeUndefined();
    expect(resolveRequestedAdminPageForScope("", "database")).toBeUndefined();
    expect(
      resolveRequestedAdminPageForScope("database.insights", "database")
    ).toBeUndefined();
  });

  test("higher scope can render lower-scoped page", () => {
    expect(
      resolveRequestedAdminPageForScope("instance.roles", "database")
    ).toBe("instance.roles");
  });

  test("accepts the activity page at instance scope", () => {
    expect(
      resolveRequestedAdminPageForScope("instance.activity", "instance")
    ).toBe("instance.activity");
  });
});

describe("resolveImplicitAdminPageFromRouteId", () => {
  test("maps canonical instance activity route to the activity page", () => {
    expect(
      resolveImplicitAdminPageFromRouteId("/instances/$instanceId/activity")
    ).toBe("instance.activity");
  });

  test("maps canonical database explorer route to the explorer page", () => {
    expect(
      resolveImplicitAdminPageFromRouteId(
        "/instances/$instanceId/databases/$databaseId/explorer"
      )
    ).toBe("database.explorer");
  });

  test("maps canonical database extensions route to the extensions page", () => {
    expect(
      resolveImplicitAdminPageFromRouteId(
        "/instances/$instanceId/databases/$databaseId/extensions"
      )
    ).toBe("database.extensions");
  });

  test("does not map the removed database insights route", () => {
    expect(
      resolveImplicitAdminPageFromRouteId(
        "/instances/$instanceId/databases/$databaseId/insights"
      )
    ).toBeUndefined();
  });

  test("maps canonical SQL workbench route to the workbench page", () => {
    expect(
      resolveImplicitAdminPageFromRouteId(
        "/instances/$instanceId/databases/$databaseId/workbench"
      )
    ).toBe("database.workbench");
  });

  test("maps canonical database overview route to the overview page", () => {
    expect(
      resolveImplicitAdminPageFromRouteId(
        "/instances/$instanceId/databases/$databaseId/"
      )
    ).toBe("database.overview");
  });
});

describe("instanceLayoutSearchSchema", () => {
  test("parses data explorer search params", () => {
    const result = instanceLayoutSearchSchema.parse({
      category: "tables",
      name: "users",
      page: "database.explorer",
      schema: "public",
      sort: "id:asc",
      tab: "map",
    });
    expect(result).toEqual({
      category: "tables",
      name: "users",
      page: "database.explorer",
      schema: "public",
      sort: "id:asc",
      tab: "map",
    });
  });

  test("parses empty object to all-undefined fields", () => {
    const result = instanceLayoutSearchSchema.parse({});
    expect(result).toEqual({});
  });

  test("strips unknown keys", () => {
    const result = instanceLayoutSearchSchema.parse({
      page: "x",
      unknownKey: "y",
    });
    expect(result).not.toHaveProperty("unknownKey");
  });
});
