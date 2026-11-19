import type { AdminPageId } from "@/lib/admin-page";
import { isNonEmptyString } from "@/lib/value-guards";

function matchesPath(pathname: string, target?: string) {
  if (!isNonEmptyString(target)) {
    return false;
  }
  return pathname === target || pathname === `${target}/`;
}

function buildInstancePaths(instanceBase?: string) {
  if (!isNonEmptyString(instanceBase)) {
    return {} satisfies SidebarPaths;
  }
  return {
    instanceActivity: `${instanceBase}/activity`,
    instanceConfiguration: `${instanceBase}/configuration`,
    instanceOverview: instanceBase,
    instanceRoles: `${instanceBase}/roles`,
  } satisfies SidebarPaths;
}

function buildDatabasePaths(databaseBase?: string) {
  if (!isNonEmptyString(databaseBase)) {
    return {} satisfies SidebarPaths;
  }
  return {
    databaseExplorer: `${databaseBase}/explorer`,
    databaseExtensions: `${databaseBase}/extensions`,
    databaseOverview: databaseBase,
    databaseSql: `${databaseBase}/sql`,
    databaseWorkbench: `${databaseBase}/workbench`,
  } satisfies SidebarPaths;
}

type NavKey = AdminPageId;

interface NavItem {
  badge?: string | number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean | undefined;
  isDisabled?: boolean | undefined;
  key: NavKey;
  label: string;
}

interface NavSection {
  items: NavItem[];
  title: string;
}

interface NavigationIds {
  databaseId?: string | undefined;
  instanceId?: string | undefined;
}

interface SidebarPaths {
  databaseExplorer?: string | undefined;
  databaseExtensions?: string | undefined;
  databaseOverview?: string | undefined;
  databaseSql?: string | undefined;
  databaseWorkbench?: string | undefined;
  instanceActivity?: string | undefined;
  instanceConfiguration?: string | undefined;
  instanceOverview?: string | undefined;
  instanceRoles?: string | undefined;
}

interface NavActiveState {
  databaseExplorer: boolean;
  databaseExtensions: boolean;
  databaseOverview: boolean;
  databaseSql: boolean;
  databaseWorkbench: boolean;
  instanceActivity: boolean;
  instanceConfiguration: boolean;
  instanceOverview: boolean;
  instanceRoles: boolean;
}

function buildSidebarPaths({ databaseId, instanceId }: NavigationIds) {
  const instanceBase = isNonEmptyString(instanceId)
    ? `/instances/${instanceId}`
    : undefined;
  const databaseBase =
    isNonEmptyString(instanceBase) &&
    typeof databaseId === "string" &&
    databaseId.length > 0
      ? `${instanceBase}/databases/${databaseId}`
      : undefined;

  return {
    ...buildInstancePaths(instanceBase),
    ...buildDatabasePaths(databaseBase),
  } satisfies SidebarPaths;
}

function buildNavActiveState({
  pathname,
  paths,
}: {
  pathname: string;
  paths: SidebarPaths;
}) {
  return {
    databaseExplorer: matchesPath(pathname, paths.databaseExplorer),
    databaseExtensions: matchesPath(pathname, paths.databaseExtensions),
    databaseOverview: matchesPath(pathname, paths.databaseOverview),
    databaseSql: matchesPath(pathname, paths.databaseSql),
    databaseWorkbench: matchesPath(pathname, paths.databaseWorkbench),
    instanceActivity: matchesPath(pathname, paths.instanceActivity),
    instanceConfiguration: matchesPath(pathname, paths.instanceConfiguration),
    instanceOverview: matchesPath(pathname, paths.instanceOverview),
    instanceRoles: matchesPath(pathname, paths.instanceRoles),
  } satisfies NavActiveState;
}

export type { NavActiveState, NavigationIds, NavKey, NavSection, SidebarPaths };
export { buildNavActiveState, buildSidebarPaths };
