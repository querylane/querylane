import { describe, expect, test } from "vitest";
import {
  buildCanonicalAdminSearch,
  resolveCanonicalAdminPageTarget,
  resolveLegacyAdminPageRedirect,
  resolveNextAdminPage,
} from "@/lib/admin-navigation";

describe("admin navigation", () => {
  test("resolves canonical targets for database explorer", () => {
    expect(
      resolveCanonicalAdminPageTarget({
        ids: { databaseId: "postgres", instanceId: "local" },
        page: "database.explorer",
      })
    ).toEqual({
      params: { databaseId: "postgres", instanceId: "local" },
      to: "/instances/$instanceId/databases/$databaseId/explorer",
    });
  });

  test("resolves canonical targets for database extensions", () => {
    expect(
      resolveCanonicalAdminPageTarget({
        ids: { databaseId: "postgres", instanceId: "local" },
        page: "database.extensions",
      })
    ).toEqual({
      params: { databaseId: "postgres", instanceId: "local" },
      to: "/instances/$instanceId/databases/$databaseId/extensions",
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

  test("clears page-local search when changing pages", () => {
    expect(
      buildCanonicalAdminSearch(
        {
          category: "tables",
          name: "users",
          page: "database.overview",
          schema: "public",
        },
        { currentPage: "database.overview", targetPage: "database.explorer" }
      )
    ).toEqual({
      category: undefined,
      name: undefined,
      page: undefined,
      schema: undefined,
      sort: undefined,
    });
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
  test("redirects legacy instance page links at instance scope", () => {
    expect(
      resolveLegacyAdminPageRedirect({
        currentPage: "instance.configuration",
        ids: { instanceId: "local" },
        search: { page: "instance.configuration" },
      })
    ).toEqual({
      params: { instanceId: "local" },
      search: { page: undefined },
      to: "/instances/$instanceId/configuration",
    });
  });
});
