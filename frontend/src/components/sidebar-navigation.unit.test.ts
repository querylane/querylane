import { describe, expect, test } from "vitest";
import {
  buildNavLinkProps,
  getNavForScope,
  getNextStepHint,
} from "@/components/sidebar-navigation";

describe("sidebar navigation", () => {
  test("builds native link props for available instance pages", () => {
    const links = buildNavLinkProps({
      currentPage: "instance.overview",
      ids: { instanceId: "local" },
    });

    expect(links["instance.activity"]).toMatchObject({
      params: { instanceId: "local" },
      to: "/instances/$instanceId/activity",
    });
    expect(links["instance.configuration"]).toMatchObject({
      params: { instanceId: "local" },
      to: "/instances/$instanceId/configuration",
    });
  });

  test("omits database links until a database is selected", () => {
    const links = buildNavLinkProps({
      currentPage: "instance.overview",
      ids: { instanceId: "local" },
    });

    expect(links["database.explorer"]).toBeUndefined();
    expect(links["database.workbench"]).toBeUndefined();
  });

  test("clears explorer search when moving to another sidebar page", () => {
    const links = buildNavLinkProps({
      currentPage: "database.explorer",
      ids: { databaseId: "postgres", instanceId: "local" },
    });

    expect(
      links["database.overview"]?.search({
        category: "tables",
        name: "users",
        schema: "public",
      })
    ).toEqual({
      category: undefined,
      name: undefined,
      page: undefined,
      schema: undefined,
      sort: undefined,
    });
  });

  test("builds native link props for the SQL workbench", () => {
    const links = buildNavLinkProps({
      currentPage: "database.overview",
      ids: { databaseId: "postgres", instanceId: "local" },
    });

    expect(links["database.workbench"]).toMatchObject({
      params: { databaseId: "postgres", instanceId: "local" },
      to: "/instances/$instanceId/databases/$databaseId/workbench",
    });
  });

  test("returns instance-only navigation until a database is selected", () => {
    const sections = getNavForScope({
      active: {
        databaseExplorer: false,
        databaseExtensions: false,
        databaseOverview: false,
        databaseWorkbench: false,
        instanceActivity: false,
        instanceConfiguration: false,
        instanceOverview: true,
        instanceRoles: false,
      },
      paths: {
        instanceActivity: "/instances/local/activity",
        instanceConfiguration: "/instances/local/configuration",
        instanceOverview: "/instances/local",
        instanceRoles: "/instances/local/roles",
      },
      scopeLevel: "instance",
    });

    expect(sections.map((section) => section.title)).toEqual(["Instance"]);
    expect(sections[0]?.items.map((item) => item.key)).toEqual([
      "instance.overview",
      "instance.activity",
      "instance.roles",
      "instance.configuration",
    ]);
  });

  test("returns database navigation at database scope", () => {
    const sections = getNavForScope({
      active: {
        databaseExplorer: false,
        databaseExtensions: false,
        databaseOverview: true,
        databaseWorkbench: false,
        instanceActivity: false,
        instanceConfiguration: false,
        instanceOverview: false,
        instanceRoles: false,
      },
      paths: {
        databaseExplorer: "/instances/local/databases/postgres/explorer",
        databaseExtensions: "/instances/local/databases/postgres/extensions",
        databaseOverview: "/instances/local/databases/postgres",
        databaseWorkbench: "/instances/local/databases/postgres/workbench",
        instanceActivity: "/instances/local/activity",
        instanceConfiguration: "/instances/local/configuration",
        instanceOverview: "/instances/local",
        instanceRoles: "/instances/local/roles",
      },
      scopeLevel: "database",
    });

    expect(sections.map((section) => section.title)).toEqual([
      "Instance",
      "Database",
    ]);
    expect(sections[1]?.items.map((item) => item.key)).toEqual([
      "database.overview",
      "database.workbench",
      "database.extensions",
      "database.explorer",
    ]);
  });
  test("returns next-step hints by navigation scope", () => {
    expect(getNextStepHint("none")).toBe("Select an instance to get started");
    expect(getNextStepHint("instance")).toBe(
      "Select a database to explore schemas, extensions, and queries"
    );
    expect(getNextStepHint("database")).toBeNull();
  });
});
