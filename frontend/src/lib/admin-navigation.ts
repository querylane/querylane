import type { NavigateFn } from "@tanstack/react-router";
import {
  type AdminPageId,
  canRenderAdminPageAtScope,
  getDefaultAdminPageForScope,
  type InstanceLayoutSearch,
} from "@/lib/admin-page";
import { assertNever } from "@/lib/assert-never";
import {
  type InstanceRolesSearch,
  isInstanceRolesTab,
  isInstanceRolesType,
} from "@/lib/instance-roles-search";

type ScopeLevel = "none" | "instance" | "database";

interface RouteSelectionIds {
  databaseId?: string | undefined;
  instanceId?: string | undefined;
}

const CLEARED_PAGE_SEARCH: InstanceLayoutSearch = {
  category: undefined,
  name: undefined,
  page: undefined,
  q: undefined,
  schema: undefined,
  sort: undefined,
  tab: undefined,
};

type CanonicalAdminPageTarget =
  | {
      params: {
        instanceId: string;
      };
      to: "/instances/$instanceId";
    }
  | {
      params: {
        instanceId: string;
      };
      to: "/instances/$instanceId/activity";
    }
  | {
      params: {
        instanceId: string;
      };
      to: "/instances/$instanceId/configuration";
    }
  | {
      params: {
        instanceId: string;
      };
      to: "/instances/$instanceId/roles";
    }
  | {
      params: {
        databaseId: string;
        instanceId: string;
      };
      to: "/instances/$instanceId/databases/$databaseId";
    }
  | {
      params: {
        databaseId: string;
        instanceId: string;
      };
      to: "/instances/$instanceId/databases/$databaseId/extensions";
    }
  | {
      params: {
        databaseId: string;
        instanceId: string;
      };
      to: "/instances/$instanceId/databases/$databaseId/explorer";
    }
  | {
      params: {
        databaseId: string;
        instanceId: string;
      };
      to: "/instances/$instanceId/databases/$databaseId/workbench";
    };

interface CanonicalAdminSearchOptions {
  clearPageSearch?: boolean | undefined;
  currentPage?: AdminPageId | undefined;
  targetPage: AdminPageId;
}

function shouldPreservePageSearch({
  clearPageSearch = false,
  currentPage,
  targetPage,
}: CanonicalAdminSearchOptions): boolean {
  return Boolean(currentPage && targetPage === currentPage && !clearPageSearch);
}

function resolveNextAdminPage({
  currentPage,
  targetScope,
}: {
  currentPage?: AdminPageId | undefined;
  targetScope: ScopeLevel;
}): AdminPageId | undefined {
  if (currentPage && canRenderAdminPageAtScope(currentPage, targetScope)) {
    return currentPage;
  }

  return getDefaultAdminPageForScope(targetScope);
}

function resolveCanonicalAdminPageTarget({
  ids,
  page,
}: {
  ids: RouteSelectionIds;
  page: AdminPageId;
}): CanonicalAdminPageTarget | null {
  if (page.startsWith("instance.")) {
    return resolveCanonicalInstancePageTarget({ ids, page });
  }

  return resolveCanonicalDatabasePageTarget({ ids, page });
}

function resolveCanonicalInstancePageTarget({
  ids,
  page,
}: {
  ids: RouteSelectionIds;
  page: AdminPageId;
}): CanonicalAdminPageTarget | null {
  if (!ids.instanceId) {
    return null;
  }

  switch (page) {
    case "instance.overview":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId",
      };
    case "instance.activity":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/activity",
      };
    case "instance.configuration":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/configuration",
      };
    case "instance.roles":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/roles",
      };
    default:
      return null;
  }
}

function resolveCanonicalDatabasePageTarget({
  ids,
  page,
}: {
  ids: RouteSelectionIds;
  page: AdminPageId;
}): CanonicalAdminPageTarget | null {
  if (!(ids.instanceId && ids.databaseId)) {
    return null;
  }

  switch (page) {
    case "database.overview":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId",
      };
    case "database.extensions":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/extensions",
      };
    case "database.explorer":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      };
    case "database.workbench":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/workbench",
      };
    default:
      return null;
  }
}

function buildCanonicalAdminSearch(
  previous: InstanceLayoutSearch,
  {
    clearPageSearch = false,
    currentPage,
    targetPage,
  }: CanonicalAdminSearchOptions
): InstanceLayoutSearch {
  const baseSearch = shouldPreservePageSearch({
    clearPageSearch,
    currentPage,
    targetPage,
  })
    ? previous
    : CLEARED_PAGE_SEARCH;

  return {
    ...baseSearch,
    page: undefined,
  };
}

function buildCanonicalRolesSearch(
  previous: InstanceLayoutSearch & { type?: unknown },
  searchOptions: CanonicalAdminSearchOptions
): InstanceLayoutSearch & InstanceRolesSearch {
  const search = buildCanonicalAdminSearch(previous, searchOptions);
  const previousType =
    shouldPreservePageSearch(searchOptions) && typeof previous.type === "string"
      ? previous.type
      : undefined;

  return {
    ...search,
    tab: isInstanceRolesTab(search.tab) ? search.tab : undefined,
    type: isInstanceRolesType(previousType) ? previousType : undefined,
  };
}

function navigateToCanonicalAdminTarget(
  navigate: NavigateFn,
  target: CanonicalAdminPageTarget,
  searchOptions: CanonicalAdminSearchOptions
): Promise<void> {
  switch (target.to) {
    case "/instances/$instanceId":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/activity":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/configuration":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/roles":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalRolesSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/databases/$databaseId":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/databases/$databaseId/extensions":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    case "/instances/$instanceId/databases/$databaseId/explorer":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    default:
      return assertNever(target);
  }
}

function resolveScopeLevelFromIds(ids: RouteSelectionIds): ScopeLevel {
  if (ids.databaseId) {
    return "database";
  }
  if (ids.instanceId) {
    return "instance";
  }
  return "none";
}

function resolveLegacyAdminPageRedirect({
  currentPage,
  ids,
  search,
}: {
  currentPage?: AdminPageId | undefined;
  ids: RouteSelectionIds;
  search: InstanceLayoutSearch;
}): (CanonicalAdminPageTarget & { search: InstanceLayoutSearch }) | null {
  if (!search.page) {
    return null;
  }

  const targetPage = resolveNextAdminPage({
    currentPage,
    targetScope: resolveScopeLevelFromIds(ids),
  });
  if (!targetPage) {
    return null;
  }

  const target = resolveCanonicalAdminPageTarget({
    ids,
    page: targetPage,
  });
  if (!target) {
    return null;
  }
  const searchOptions = { currentPage, targetPage };

  return {
    ...target,
    search:
      target.to === "/instances/$instanceId/roles"
        ? buildCanonicalRolesSearch(search, searchOptions)
        : buildCanonicalAdminSearch(search, searchOptions),
  };
}

export type { CanonicalAdminPageTarget, CanonicalAdminSearchOptions };
export {
  buildCanonicalAdminSearch,
  buildCanonicalRolesSearch,
  navigateToCanonicalAdminTarget,
  resolveCanonicalAdminPageTarget,
  resolveLegacyAdminPageRedirect,
  resolveNextAdminPage,
};
