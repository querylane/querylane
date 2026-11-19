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
import { isNonEmptyString } from "@/lib/value-guards";

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
      to:
        | "/instances/$instanceId/databases/$databaseId/sql"
        | "/instances/$instanceId/databases/$databaseId/workbench";
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
}: CanonicalAdminSearchOptions) {
  return Boolean(currentPage && targetPage === currentPage && !clearPageSearch);
}

function resolveNextAdminPage({
  currentPage,
  targetScope,
}: {
  currentPage?: AdminPageId | undefined;
  targetScope: ScopeLevel;
}) {
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
}) {
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
}) {
  if (!isNonEmptyString(ids.instanceId)) {
    return null;
  }

  switch (page) {
    case "instance.overview":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId",
      } satisfies CanonicalAdminPageTarget | null;
    case "instance.activity":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/activity",
      } satisfies CanonicalAdminPageTarget | null;
    case "instance.configuration":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/configuration",
      } satisfies CanonicalAdminPageTarget | null;
    case "instance.roles":
      return {
        params: { instanceId: ids.instanceId },
        to: "/instances/$instanceId/roles",
      } satisfies CanonicalAdminPageTarget | null;
    case "database.explorer":
    case "database.extensions":
    case "database.overview":
    case "database.sql":
    case "database.workbench":
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
}) {
  if (
    !(
      isNonEmptyString(ids.instanceId) &&
      typeof ids.databaseId === "string" &&
      ids.databaseId.length > 0
    )
  ) {
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
      } satisfies CanonicalAdminPageTarget | null;
    case "database.extensions":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/extensions",
      } satisfies CanonicalAdminPageTarget | null;
    case "database.explorer":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      } satisfies CanonicalAdminPageTarget | null;
    case "database.sql":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/sql",
      } satisfies CanonicalAdminPageTarget | null;
    case "database.workbench":
      return {
        params: {
          databaseId: ids.databaseId,
          instanceId: ids.instanceId,
        },
        to: "/instances/$instanceId/databases/$databaseId/workbench",
      } satisfies CanonicalAdminPageTarget | null;
    case "instance.activity":
    case "instance.configuration":
    case "instance.overview":
    case "instance.roles":
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
) {
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
  } satisfies InstanceLayoutSearch;
}

function buildCanonicalRolesSearch(
  previous: InstanceLayoutSearch & { type?: unknown },
  searchOptions: CanonicalAdminSearchOptions
) {
  const search = buildCanonicalAdminSearch(previous, searchOptions);
  const previousType =
    shouldPreservePageSearch(searchOptions) && typeof previous.type === "string"
      ? previous.type
      : undefined;

  return {
    ...search,
    tab: isInstanceRolesTab(search.tab) ? search.tab : undefined,
    type: isInstanceRolesType(previousType) ? previousType : undefined,
  } satisfies InstanceLayoutSearch & InstanceRolesSearch;
}

function navigateToCanonicalAdminTarget(
  navigate: NavigateFn,
  target: CanonicalAdminPageTarget,
  searchOptions: CanonicalAdminSearchOptions
) {
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
    case "/instances/$instanceId/databases/$databaseId/sql":
    case "/instances/$instanceId/databases/$databaseId/workbench":
      return navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, searchOptions),
      });
    default:
      return assertNever(target);
  }
}

function resolveScopeLevelFromIds(ids: RouteSelectionIds) {
  if (isNonEmptyString(ids.databaseId)) {
    return "database";
  }
  if (isNonEmptyString(ids.instanceId)) {
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
}) {
  if (!isNonEmptyString(search.page)) {
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
  } satisfies
    | (CanonicalAdminPageTarget & { search: InstanceLayoutSearch })
    | null;
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
