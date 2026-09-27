import { describe, expect, test } from "@rstest/core";
import type { useNavigate } from "@tanstack/react-router";
import { renderHook } from "@testing-library/react";
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
  navigationError,
}: {
  currentPage?: AdminPageId;
  effDatabaseId?: string;
  instanceId?: string;
  navigationError?: unknown;
} = {}) {
  const persisted: RouteSelectionIds[] = [];
  const navigations: unknown[] = [];
  const navigate: ReturnType<typeof useNavigate> = (options: unknown) => {
    navigations.push(options);
    return navigationError
      ? Promise.reject(navigationError)
      : Promise.resolve();
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
  test("contains rejected navigation promises", async () => {
    const { callbacks } = renderNavigationCallbacks({
      instanceId: "local",
      navigationError: new Error("navigation failed"),
    });

    callbacks.navigateToInstance(buildInstance("staging"));
    await Promise.resolve();
    await Promise.resolve();
  });

  describe("canonical search updater", () => {
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
