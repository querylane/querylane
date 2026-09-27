import { describe, expect, test } from "@rstest/core";
import {
  navigateToCanonicalAdminTarget,
  resolveCanonicalAdminPageTarget,
  resolveLegacyAdminPageRedirect,
  resolveNextAdminPage,
} from "@/lib/admin-navigation";

describe("admin navigation", () => {
  test("navigates canonical targets without erasing route types", async () => {
    const navigations: unknown[] = [];

    await navigateToCanonicalAdminTarget(
      (options: unknown) => {
        navigations.push(options);
        return Promise.resolve();
      },
      {
        params: { instanceId: "local" },
        to: "/instances/$instanceId/activity",
      },
      {
        currentPage: "instance.overview",
        targetPage: "instance.activity",
      }
    );

    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toMatchObject({
      params: { instanceId: "local" },
      to: "/instances/$instanceId/activity",
    });
  });

  test("falls back to scope default when requested page needs deeper scope", () => {
    expect(
      resolveNextAdminPage({
        currentPage: "database.explorer",
        targetScope: "instance",
      })
    ).toBe("instance.overview");
  });

  test("builds route-level redirect for legacy page search links", () => {
    expect(
      resolveLegacyAdminPageRedirect({
        currentPage: "database.explorer",
        ids: { databaseId: "postgres", instanceId: "local" },
        search: {
          category: "tables",
          name: "users",
          page: "database.explorer",
          schema: "public",
        },
      })
    ).toEqual({
      params: { databaseId: "postgres", instanceId: "local" },
      search: {
        category: "tables",
        name: "users",
        page: undefined,
        schema: "public",
      },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("normalizes role search in legacy redirects", () => {
    expect(
      resolveLegacyAdminPageRedirect({
        currentPage: "instance.roles",
        ids: { instanceId: "local" },
        search: {
          page: "instance.roles",
          q: "postgres",
          tab: "grants",
        },
      })
    ).toEqual({
      params: { instanceId: "local" },
      search: {
        page: undefined,
        q: "postgres",
        tab: undefined,
        type: undefined,
      },
      to: "/instances/$instanceId/roles",
    });
  });

  test("does not redirect canonical URLs without page search", () => {
    expect(
      resolveLegacyAdminPageRedirect({
        currentPage: undefined,
        ids: { instanceId: "local" },
        search: {},
      })
    ).toBeNull();
  });
  test("returns null for resource pages without required ids", () => {
    expect(
      resolveCanonicalAdminPageTarget({
        ids: { instanceId: "local" },
        page: "database.explorer",
      })
    ).toBeNull();
  });

  test("returns null for unknown page ids defensively", () => {
    expect(
      resolveCanonicalAdminPageTarget({
        ids: { databaseId: "postgres", instanceId: "local" },
        page: "unknown.page" as never,
      })
    ).toBeNull();
  });

  test("does not redirect when legacy page cannot resolve at current scope", () => {
    expect(
      resolveLegacyAdminPageRedirect({
        currentPage: "instance.overview",
        ids: {},
        search: { page: "instance.overview" },
      })
    ).toBeNull();
  });
});
