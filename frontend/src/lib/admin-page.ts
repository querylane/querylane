"use client";

import { z } from "zod";

/**
 * Canonical admin page identifiers.
 *
 * The URL pathname is canonical for the current page + required resource scope.
 * The `page` search-param remains as a legacy compatibility override for
 * older deep links and redirects back to the canonical route.
 */
type AdminPageId =
  // Instance-level pages
  | "instance.overview"
  | "instance.roles"
  | "instance.configuration"
  // Database-level pages
  | "database.overview"
  | "database.extensions"
  | "database.explorer";

type AdminSelectionScope = "none" | "instance" | "database";

const ADMIN_PAGE_IDS: readonly AdminPageId[] = [
  "instance.overview",
  "instance.roles",
  "instance.configuration",
  "database.overview",
  "database.extensions",
  "database.explorer",
] as const;

const ADMIN_PAGE_MIN_SCOPE: Record<
  AdminPageId,
  Exclude<AdminSelectionScope, "none">
> = {
  "database.explorer": "database",
  "database.extensions": "database",
  "database.overview": "database",
  "instance.configuration": "instance",
  "instance.overview": "instance",
  "instance.roles": "instance",
};

function isValidAdminPageId(value: string): value is AdminPageId {
  return (ADMIN_PAGE_IDS as readonly string[]).includes(value);
}

function parseAdminPageId(value: unknown): AdminPageId | undefined {
  return typeof value === "string" && isValidAdminPageId(value)
    ? value
    : undefined;
}

const SCOPE_RANKS: Record<string, number> = {
  database: 2,
  instance: 1,
};

function getScopeRank(scope: AdminSelectionScope): number {
  return SCOPE_RANKS[scope] ?? 0;
}

function canRenderAdminPageAtScope(
  page: AdminPageId,
  scope: AdminSelectionScope
): boolean {
  return getScopeRank(scope) >= getScopeRank(ADMIN_PAGE_MIN_SCOPE[page]);
}

function getDefaultAdminPageForScope(
  scope: AdminSelectionScope
): AdminPageId | undefined {
  switch (scope) {
    case "instance":
      return "instance.overview";
    case "database":
      return "database.overview";
    default:
      return;
  }
}

function resolveRequestedAdminPageForScope(
  value: unknown,
  scope: AdminSelectionScope
): AdminPageId | undefined {
  const requestedPage = parseAdminPageId(value);
  if (!requestedPage) {
    return;
  }

  return canRenderAdminPageAtScope(requestedPage, scope)
    ? requestedPage
    : getDefaultAdminPageForScope(scope);
}

function resolveImplicitAdminPageFromPathname(
  pathname: string
): AdminPageId | undefined {
  const segments = pathname.split("/").filter(Boolean);

  if (pathname.endsWith("/configuration")) {
    return "instance.configuration";
  }
  if (pathname.endsWith("/roles") || pathname.includes("/roles/")) {
    return "instance.roles";
  }

  if (segments[2] === "databases" && segments[3]) {
    if (segments[4] === "explorer") {
      return "database.explorer";
    }
    if (segments[4] === "extensions") {
      return "database.extensions";
    }
    return "database.overview";
  }
  // The instance-scoped admin panel is not an AdminPageId page: it renders
  // app-global backend state and must not resolve to instance.overview.
  if (segments[2] === "admin" && !segments[3]) {
    return;
  }
  if (pathname.includes("/instances/")) {
    return "instance.overview";
  }
  return;
}

function resolveImplicitAdminPageFromRouteId(
  routeId: string | undefined
): AdminPageId | undefined {
  switch (routeId) {
    case "/instances/$instanceId/configuration":
      return "instance.configuration";
    case "/instances/$instanceId/roles":
    case "/instances/$instanceId/roles/":
    case "/instances/$instanceId/roles/$roleId":
      return "instance.roles";
    case "/instances/$instanceId/databases/$databaseId/explorer":
      return "database.explorer";
    case "/instances/$instanceId/databases/$databaseId/extensions":
      return "database.extensions";
    case "/instances/$instanceId/databases/$databaseId/":
      return "database.overview";
    case "/instances/$instanceId":
    case "/instances/$instanceId/":
      return "instance.overview";
    default:
      return;
  }
}

function resolveCurrentAdminPage({
  pathname,
  scope,
  value,
}: {
  pathname: string;
  scope: AdminSelectionScope;
  value: unknown;
}): AdminPageId | undefined {
  const requestedPage = resolveRequestedAdminPageForScope(value, scope);
  if (requestedPage) {
    return requestedPage;
  }

  const implicitPage = resolveImplicitAdminPageFromPathname(pathname);
  if (implicitPage && canRenderAdminPageAtScope(implicitPage, scope)) {
    return implicitPage;
  }

  return getDefaultAdminPageForScope(scope);
}

/** All search param keys used by any page (for retainSearchParams). */
const PAGE_SEARCH_KEYS = [
  "page",
  // Page-local table/search controls
  "q",
  // Data explorer
  "schema",
  "category",
  "name",
  "sort",
  "tab",
] as const;

/** Zod schema for the instance layout route covering page + all page-local params. */
const instanceLayoutSearchSchema = z.object({
  category: z.optional(z.string()),
  name: z.optional(z.string()),
  page: z.optional(z.string()),
  q: z.optional(z.string()),
  schema: z.optional(z.string()),
  sort: z.optional(z.string()),
  // Page selected tab. Registered here so cross-page navigation clears it
  // (see CLEARED_PAGE_SEARCH); validated strictly on each tabbed route.
  tab: z.optional(z.string()),
});

type InstanceLayoutSearch = z.infer<typeof instanceLayoutSearchSchema>;

export type { AdminPageId, InstanceLayoutSearch };
export {
  canRenderAdminPageAtScope,
  getDefaultAdminPageForScope,
  instanceLayoutSearchSchema,
  PAGE_SEARCH_KEYS,
  resolveCurrentAdminPage,
  resolveImplicitAdminPageFromPathname,
  resolveImplicitAdminPageFromRouteId,
  resolveRequestedAdminPageForScope,
};
