import type { useNavigate } from "@tanstack/react-router";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { AdminPageId } from "@/lib/admin-page";
import {
  type RouteSelectionIds,
  useNavigationCallbacks,
} from "@/lib/db-navigation";
import type {
  PostgresDatabase,
  PostgresInstance,
} from "@/lib/db-resource-mappers";

function buildInstance(id: string): PostgresInstance {
  return {
    connectionError: "",
    credentialsUnreadable: false,
    host: "localhost",
    id,
    name: id,
    port: 5432,
    resourceName: `instances/${id}`,
    status: "connected",
  };
}

function buildDatabase(id: string): PostgresDatabase {
  return {
    characterSet: "UTF8",
    collation: "en_US.UTF-8",
    id,
    isSystemDatabase: false,
    name: id,
    owner: "postgres",
    resourceName: `instances/local/databases/${id}`,
  };
}

function renderNavigationCallbacks({
  currentPage,
  effDatabaseId,
  instanceId,
}: {
  currentPage?: AdminPageId;
  effDatabaseId?: string;
  instanceId?: string;
} = {}) {
  const persisted: RouteSelectionIds[] = [];
  const navigations: unknown[] = [];
  const navigate: ReturnType<typeof useNavigate> = (options: unknown) => {
    navigations.push(options);
    return Promise.resolve();
  };

  const { result } = renderHook(() =>
    useNavigationCallbacks({
      currentPage,
      effDatabaseId,
      instanceId,
      navigate,
      persistSelection: (ids) => {
        persisted.push(ids);
      },
    })
  );

  return { callbacks: result.current, navigations, persisted };
}

function applySearchUpdater(
  navigation: unknown,
  previous: Record<string, unknown>
): unknown {
  if (
    typeof navigation === "object" &&
    navigation !== null &&
    "search" in navigation &&
    typeof navigation.search === "function"
  ) {
    return navigation.search(previous);
  }
  throw new Error("expected navigation to receive a search updater");
}

describe("useNavigationCallbacks", () => {
  describe("navigateToInstance", () => {
    test("keeps the selected database when re-selecting the current instance", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks({
        effDatabaseId: "postgres",
        instanceId: "local",
      });

      callbacks.navigateToInstance(buildInstance("local"));

      expect(persisted).toEqual([
        { databaseId: "postgres", instanceId: "local" },
      ]);
      expect(navigations).toHaveLength(1);
      expect(navigations[0]).toMatchObject({
        params: { databaseId: "postgres", instanceId: "local" },
        to: "/instances/$instanceId/databases/$databaseId",
      });
    });

    test("clears the database selection when switching instances", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks({
        effDatabaseId: "postgres",
        instanceId: "local",
      });

      callbacks.navigateToInstance(buildInstance("staging"));

      expect(persisted).toEqual([
        { databaseId: undefined, instanceId: "staging" },
      ]);
      expect(navigations[0]).toMatchObject({
        params: { instanceId: "staging" },
        to: "/instances/$instanceId",
      });
    });

    test("keeps the current page when it can render at the target scope", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        currentPage: "instance.roles",
        instanceId: "local",
      });

      callbacks.navigateToInstance(buildInstance("staging"));

      expect(navigations[0]).toMatchObject({
        params: { instanceId: "staging" },
        to: "/instances/$instanceId/roles",
      });
    });

    test("does not navigate when no page resolves for the target scope", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks();

      callbacks.navigateToInstance(buildInstance(""));

      expect(navigations).toHaveLength(0);
      expect(persisted).toHaveLength(0);
    });
  });

  describe("navigateToDatabase", () => {
    test("navigates to the database overview by default", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks({
        instanceId: "local",
      });

      callbacks.navigateToDatabase(buildDatabase("postgres"));

      expect(persisted).toEqual([
        { databaseId: "postgres", instanceId: "local" },
      ]);
      expect(navigations[0]).toMatchObject({
        params: { databaseId: "postgres", instanceId: "local" },
        to: "/instances/$instanceId/databases/$databaseId",
      });
    });

    test("honors an override page", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        instanceId: "local",
      });

      callbacks.navigateToDatabase(buildDatabase("postgres"), {
        overridePage: "database.explorer",
      });

      expect(navigations[0]).toMatchObject({
        params: { databaseId: "postgres", instanceId: "local" },
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      });
    });

    test("is a no-op without a selected instance", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks();

      callbacks.navigateToDatabase(buildDatabase("postgres"));

      expect(navigations).toHaveLength(0);
      expect(persisted).toHaveLength(0);
    });
  });

  describe("viewOverview", () => {
    test("navigates to the instance overview even with a database selected", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        effDatabaseId: "postgres",
        instanceId: "local",
      });

      callbacks.viewOverview("instance");

      expect(navigations[0]).toMatchObject({
        params: { instanceId: "local" },
        to: "/instances/$instanceId",
      });
    });

    test("navigates to the database overview for the selected database", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        currentPage: "database.explorer",
        effDatabaseId: "postgres",
        instanceId: "local",
      });

      callbacks.viewOverview("database");

      expect(navigations[0]).toMatchObject({
        params: { databaseId: "postgres", instanceId: "local" },
        to: "/instances/$instanceId/databases/$databaseId",
      });
    });

    test("does not navigate when the overview target cannot resolve", () => {
      const { callbacks, navigations, persisted } = renderNavigationCallbacks({
        instanceId: "local",
      });

      callbacks.viewOverview("database");

      expect(navigations).toHaveLength(0);
      expect(persisted).toHaveLength(0);
    });
  });

  describe("canonical search updater", () => {
    test("clears page-local search keys when changing pages", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        currentPage: "database.explorer",
        effDatabaseId: "postgres",
        instanceId: "local",
      });

      callbacks.viewOverview("database");

      const updated = applySearchUpdater(navigations[0], {
        name: "users",
        page: "database.explorer",
        schema: "public",
      });
      expect(updated).toEqual({
        category: undefined,
        name: undefined,
        page: undefined,
        q: undefined,
        schema: undefined,
        sort: undefined,
        tab: undefined,
      });
    });

    test("keeps previous search when staying on the same page", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        currentPage: "database.overview",
        instanceId: "local",
      });

      callbacks.navigateToDatabase(buildDatabase("postgres"));

      const updated = applySearchUpdater(navigations[0], { schema: "public" });
      expect(updated).toEqual({ page: undefined, schema: "public" });
    });

    test("clears previous explorer search when switching databases on the same page", () => {
      const { callbacks, navigations } = renderNavigationCallbacks({
        currentPage: "database.explorer",
        effDatabaseId: "analytics",
        instanceId: "local",
      });

      callbacks.navigateToDatabase(buildDatabase("postgres"));

      const updated = applySearchUpdater(navigations[0], {
        category: "tables",
        name: "orders",
        q: "ord",
        schema: "analytics",
        tab: "columns",
      });
      expect(updated).toEqual({
        category: undefined,
        name: undefined,
        page: undefined,
        q: undefined,
        schema: undefined,
        sort: undefined,
        tab: undefined,
      });
    });
  });
});
