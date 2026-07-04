import {
  type AdminPageId,
  canRenderAdminPageAtScope,
  getDefaultAdminPageForScope,
  type InstanceLayoutSearch,
} from "@/lib/admin-page";

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
    };

type CanonicalAdminNavigateOptions = CanonicalAdminPageTarget & {
  search: (previous: Record<string, unknown>) => Record<string, unknown>;
};

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
    default:
      return null;
  }
}

function buildCanonicalAdminSearch(
  previous: Record<string, unknown>,
  {
    currentPage,
    extraSearch,
    targetPage,
  }: {
    currentPage?: AdminPageId | undefined;
    extraSearch?: Record<string, unknown> | undefined;
    targetPage: AdminPageId;
  }
): InstanceLayoutSearch {
  const baseSearch =
    currentPage && targetPage === currentPage
      ? previous
      : { ...previous, ...CLEARED_PAGE_SEARCH };

  return {
    ...baseSearch,
    ...extraSearch,
    page: undefined,
  };
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

  return {
    ...target,
    search: buildCanonicalAdminSearch(search, {
      currentPage,
      targetPage,
    }),
  };
}

export type { CanonicalAdminNavigateOptions };
export {
  buildCanonicalAdminSearch,
  resolveCanonicalAdminPageTarget,
  resolveLegacyAdminPageRedirect,
  resolveNextAdminPage,
};
