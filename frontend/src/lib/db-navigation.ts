import type { useNavigate } from "@tanstack/react-router";
import {
  buildCanonicalAdminSearch,
  type CanonicalAdminNavigateOptions,
  resolveCanonicalAdminPageTarget,
  resolveNextAdminPage,
} from "@/lib/admin-navigation";
import type { AdminPageId } from "@/lib/admin-page";
import type {
  PostgresDatabase,
  PostgresInstance,
} from "@/lib/db-resource-mappers";

type ScopeLevel = "none" | "instance" | "database";

interface RouteSelectionIds {
  databaseId?: string | undefined;
  instanceId?: string | undefined;
}

function resolveScopeLevel(ids: RouteSelectionIds): ScopeLevel {
  if (ids.databaseId) {
    return "database";
  }
  if (ids.instanceId) {
    return "instance";
  }
  return "none";
}

type OverviewLevel = "instance" | "database";

function useCanonicalAdminNavigation({
  currentPage,
  navigate,
  persistSelection,
}: {
  currentPage?: AdminPageId | undefined;
  navigate: ReturnType<typeof useNavigate>;
  persistSelection: (ids: RouteSelectionIds) => void;
}) {
  const navigateWithSearch: (options: CanonicalAdminNavigateOptions) => void =
    navigate;

  return ({
    clearPageSearch,
    extraSearch,
    ids,
    overridePage,
  }: {
    clearPageSearch?: boolean | undefined;
    extraSearch?: Record<string, unknown> | undefined;
    ids: RouteSelectionIds;
    overridePage?: AdminPageId | undefined;
  }) => {
    const targetScope = resolveScopeLevel(ids);
    const targetPage =
      overridePage ??
      resolveNextAdminPage({
        currentPage,
        targetScope,
      });
    if (!targetPage) {
      return;
    }

    const target = resolveCanonicalAdminPageTarget({
      ids,
      page: targetPage,
    });
    if (!target) {
      return;
    }

    persistSelection(ids);
    navigateWithSearch({
      ...target,
      search: (previous: Record<string, unknown>) =>
        buildCanonicalAdminSearch(previous, {
          clearPageSearch,
          currentPage,
          extraSearch,
          targetPage,
        }),
    });
  };
}

function useNavigationCallbacks({
  currentPage,
  effDatabaseId,
  instanceId,
  navigate,
  persistSelection,
}: {
  currentPage?: AdminPageId | undefined;
  effDatabaseId?: string | undefined;
  instanceId?: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
  persistSelection: (ids: RouteSelectionIds) => void;
}) {
  const navigateToSelection = useCanonicalAdminNavigation({
    currentPage,
    navigate,
    persistSelection,
  });

  const navigateToInstance = (instance: PostgresInstance) => {
    navigateToSelection({
      ids: {
        databaseId: instance.id === instanceId ? effDatabaseId : undefined,
        instanceId: instance.id,
      },
    });
  };

  const navigateToDatabase = (
    database: PostgresDatabase,
    options?: { overridePage?: AdminPageId }
  ) => {
    if (!instanceId) {
      return;
    }

    navigateToSelection({
      clearPageSearch: Boolean(effDatabaseId && database.id !== effDatabaseId),
      ids: {
        databaseId: database.id,
        instanceId,
      },
      overridePage: options?.overridePage,
    });
  };

  const viewOverview = (level: OverviewLevel) => {
    navigateToSelection({
      ids: {
        databaseId: effDatabaseId,
        instanceId,
      },
      overridePage: `${level}.overview` as AdminPageId,
    });
  };

  return {
    navigateToDatabase,
    navigateToInstance,
    viewOverview,
  };
}

export type { RouteSelectionIds, ScopeLevel };
export { resolveScopeLevel, useNavigationCallbacks };
