import type { AdminPageId } from "@/lib/admin-page";

function matchesPath(pathname: string, target?: string): boolean {
  if (!target) {
    return false;
  }
  return pathname === target || pathname === `${target}/`;
}

function buildInstancePaths(instanceBase?: string): SidebarPaths {
  if (!instanceBase) {
    return {};
  }
  return {
    instanceConfiguration: `${instanceBase}/configuration`,
    instanceOverview: instanceBase,
    instanceRoles: `${instanceBase}/roles`,
  };
}

function buildDatabasePaths(databaseBase?: string): SidebarPaths {
  if (!databaseBase) {
    return {};
  }
  return {
    databaseExplorer: `${databaseBase}/explorer`,
    databaseExtensions: `${databaseBase}/extensions`,
    databaseOverview: databaseBase,
  };
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
  instanceConfiguration?: string | undefined;
  instanceOverview?: string | undefined;
  instanceRoles?: string | undefined;
}

interface NavActiveState {
  databaseExplorer: boolean;
  databaseExtensions: boolean;
  databaseOverview: boolean;
  instanceConfiguration: boolean;
  instanceOverview: boolean;
  instanceRoles: boolean;
}

function buildSidebarPaths({
  databaseId,
  instanceId,
}: NavigationIds): SidebarPaths {
  const instanceBase = instanceId ? `/instances/${instanceId}` : undefined;
  const databaseBase =
    instanceBase && databaseId
      ? `${instanceBase}/databases/${databaseId}`
      : undefined;

  return {
    ...buildInstancePaths(instanceBase),
    ...buildDatabasePaths(databaseBase),
  };
}

function buildNavActiveState({
  pathname,
  paths,
}: {
  pathname: string;
  paths: SidebarPaths;
}): NavActiveState {
  return {
    databaseExplorer: matchesPath(pathname, paths.databaseExplorer),
    databaseExtensions: matchesPath(pathname, paths.databaseExtensions),
    databaseOverview: matchesPath(pathname, paths.databaseOverview),
    instanceConfiguration: matchesPath(pathname, paths.instanceConfiguration),
    instanceOverview: matchesPath(pathname, paths.instanceOverview),
    instanceRoles: matchesPath(pathname, paths.instanceRoles),
  };
}

export type { NavActiveState, NavigationIds, NavKey, NavSection, SidebarPaths };
export { buildNavActiveState, buildSidebarPaths };
