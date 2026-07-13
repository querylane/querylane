import { describe, expect, test } from "vitest";
import {
  buildNavActiveState,
  buildSidebarPaths,
} from "@/components/sidebar-paths";

describe("buildSidebarPaths", () => {
  test("returns empty object when no instanceId is provided", () => {
    expect(buildSidebarPaths({})).toEqual({});
  });

  test("returns instance paths when instanceId is provided but no databaseId", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });

    expect(paths).toEqual({
      instanceActivity: "/instances/prod/activity",
      instanceConfiguration: "/instances/prod/configuration",
      instanceOverview: "/instances/prod",
      instanceRoles: "/instances/prod/roles",
    });
    expect(paths.databaseExplorer).toBeUndefined();
    expect(paths.databaseExtensions).toBeUndefined();
    expect(paths.databaseOverview).toBeUndefined();
  });

  test("returns all paths when both instanceId and databaseId are provided", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });

    expect(paths).toEqual({
      databaseExplorer: "/instances/prod/databases/app/explorer",
      databaseExtensions: "/instances/prod/databases/app/extensions",
      databaseInsights: "/instances/prod/databases/app/insights",
      databaseOverview: "/instances/prod/databases/app",
      instanceActivity: "/instances/prod/activity",
      instanceConfiguration: "/instances/prod/configuration",
      instanceOverview: "/instances/prod",
      instanceRoles: "/instances/prod/roles",
    });
  });

  test("omits database paths when databaseId is provided but instanceId is not", () => {
    const paths = buildSidebarPaths({ databaseId: "app" });

    expect(paths.databaseExplorer).toBeUndefined();
    expect(paths.databaseExtensions).toBeUndefined();
    expect(paths.databaseOverview).toBeUndefined();
    expect(paths.instanceOverview).toBeUndefined();
  });
});

describe("buildNavActiveState", () => {
  test("all flags are false when pathname matches nothing", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({ pathname: "/some/other/path", paths });

    expect(active).toEqual({
      databaseExplorer: false,
      databaseExtensions: false,
      databaseInsights: false,
      databaseOverview: false,
      instanceActivity: false,
      instanceConfiguration: false,
      instanceOverview: false,
      instanceRoles: false,
    });
  });

  test("instanceOverview is active on exact match", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod",
      paths,
    });

    expect(active.instanceOverview).toBe(true);
    expect(active.instanceConfiguration).toBe(false);
    expect(active.instanceRoles).toBe(false);
  });

  test("instanceOverview is active when pathname has trailing slash", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/",
      paths,
    });

    expect(active.instanceOverview).toBe(true);
  });

  test("instanceConfiguration is active on exact match", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/configuration",
      paths,
    });

    expect(active.instanceConfiguration).toBe(true);
  });

  test("instanceRoles is active on exact match", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/roles",
      paths,
    });

    expect(active.instanceRoles).toBe(true);
  });

  test("instanceActivity is active on exact match", () => {
    const paths = buildSidebarPaths({ instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/activity",
      paths,
    });

    expect(active.instanceActivity).toBe(true);
    expect(active.instanceOverview).toBe(false);
  });

  test("databaseOverview is active on exact match", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/databases/app",
      paths,
    });

    expect(active.databaseOverview).toBe(true);
    expect(active.databaseExplorer).toBe(false);
    expect(active.databaseExtensions).toBe(false);
    expect(active.databaseInsights).toBe(false);
  });

  test("databaseExtensions is active on exact match", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/databases/app/extensions",
      paths,
    });

    expect(active.databaseExtensions).toBe(true);
    expect(active.databaseExplorer).toBe(false);
    expect(active.databaseInsights).toBe(false);
    expect(active.databaseOverview).toBe(false);
  });

  test("databaseInsights is active on exact match", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/databases/app/insights",
      paths,
    });

    expect(active.databaseInsights).toBe(true);
    expect(active.databaseOverview).toBe(false);
  });

  test("databaseExplorer is active on exact match", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/databases/app/explorer",
      paths,
    });

    expect(active.databaseExplorer).toBe(true);
  });

  test("all flags are false when paths object is empty", () => {
    const active = buildNavActiveState({
      pathname: "/instances/prod",
      paths: {},
    });

    expect(active).toEqual({
      databaseExplorer: false,
      databaseExtensions: false,
      databaseInsights: false,
      databaseOverview: false,
      instanceActivity: false,
      instanceConfiguration: false,
      instanceOverview: false,
      instanceRoles: false,
    });
  });

  test("databaseOverview trailing slash is also active", () => {
    const paths = buildSidebarPaths({ databaseId: "app", instanceId: "prod" });
    const active = buildNavActiveState({
      pathname: "/instances/prod/databases/app/",
      paths,
    });

    expect(active.databaseOverview).toBe(true);
  });
});
