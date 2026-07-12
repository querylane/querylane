import {
  Activity,
  Code2,
  DatabaseZap,
  FolderTree,
  LayoutDashboard,
  Puzzle,
  Settings,
  Users,
} from "lucide-react";
import type {
  NavActiveState,
  NavigationIds,
  NavKey,
  NavSection,
  SidebarPaths,
} from "@/components/sidebar-paths";
import {
  buildCanonicalAdminSearch,
  resolveCanonicalAdminPageTarget,
} from "@/lib/admin-navigation";
import type { AdminPageId } from "@/lib/admin-page";
import type { ScopeLevel } from "@/lib/db-navigation";

interface NavLinkProps {
  params: Record<string, string>;
  search: (previous: Record<string, unknown>) => Record<string, unknown>;
  to: string;
}

/**
 * Build sidebar link props so internal navigation remains native: users keep
 * Cmd/Ctrl-click, middle-click, accessibility, and router preload semantics.
 */
function buildNavLinkProps({
  currentPage,
  ids,
}: {
  currentPage?: AdminPageId | undefined;
  ids: NavigationIds;
}): Partial<Record<NavKey, NavLinkProps>> {
  const links: Partial<Record<NavKey, NavLinkProps>> = {};

  function linkToPage({
    extraSearch,
    page,
  }: {
    extraSearch?: Record<string, unknown> | undefined;
    page: AdminPageId;
  }) {
    const target = resolveCanonicalAdminPageTarget({ ids, page });
    if (target) {
      links[page] = {
        ...target,
        search: (previous: Record<string, unknown>) =>
          buildCanonicalAdminSearch(previous, {
            currentPage,
            extraSearch,
            targetPage: page,
          }),
      };
    }
  }

  if (ids.instanceId) {
    linkToPage({ page: "instance.overview" });
    linkToPage({ page: "instance.activity" });
    linkToPage({ page: "instance.roles" });
    linkToPage({ page: "instance.configuration" });
  }

  if (ids.instanceId && ids.databaseId) {
    linkToPage({ page: "database.overview" });
    linkToPage({ page: "database.extensions" });
    linkToPage({ page: "database.explorer" });
    linkToPage({ page: "database.workbench" });
  }

  return links;
}

function getInstanceNav({
  active,
  paths,
}: {
  active: NavActiveState;
  paths: SidebarPaths;
}): NavSection[] {
  const items: NavSection["items"] = [
    {
      icon: LayoutDashboard,
      isActive: active.instanceOverview,
      isDisabled: !paths.instanceOverview,
      key: "instance.overview",
      label: "Overview",
    },
    {
      icon: Activity,
      isActive: active.instanceActivity,
      isDisabled: !paths.instanceActivity,
      key: "instance.activity",
      label: "Activity",
    },
    {
      icon: Users,
      isActive: active.instanceRoles,
      isDisabled: !paths.instanceRoles,
      key: "instance.roles",
      label: "Roles",
    },
    {
      icon: Settings,
      isActive: active.instanceConfiguration,
      isDisabled: !paths.instanceConfiguration,
      key: "instance.configuration",
      label: "Configuration",
    },
  ];

  return [{ items, title: "Instance" }];
}

function getDatabaseNav({
  active,
  paths,
}: {
  active: NavActiveState;
  paths: SidebarPaths;
}): NavSection[] {
  return [
    {
      items: [
        {
          icon: DatabaseZap,
          isActive: active.databaseOverview,
          isDisabled: !paths.databaseOverview,
          key: "database.overview",
          label: "Overview",
        },
        {
          icon: Code2,
          isActive: active.databaseWorkbench,
          isDisabled: !paths.databaseWorkbench,
          key: "database.workbench",
          label: "SQL workbench",
        },
        {
          icon: Puzzle,
          isActive: active.databaseExtensions,
          isDisabled: !paths.databaseExtensions,
          key: "database.extensions",
          label: "Extensions",
        },
        {
          icon: FolderTree,
          isActive: active.databaseExplorer,
          isDisabled: !paths.databaseExplorer,
          key: "database.explorer",
          label: "Data Explorer",
        },
      ],
      title: "Database",
    },
  ];
}

function getNavForScope({
  active,
  paths,
  scopeLevel,
}: {
  active: NavActiveState;
  paths: SidebarPaths;
  scopeLevel: ScopeLevel;
}): NavSection[] {
  const sections: NavSection[] = [];

  if (scopeLevel === "instance" || scopeLevel === "database") {
    sections.push(...getInstanceNav({ active, paths }));
  }

  if (scopeLevel === "database") {
    sections.push(...getDatabaseNav({ active, paths }));
  }

  return sections;
}

function getNextStepHint(scopeLevel: ScopeLevel): string | null {
  switch (scopeLevel) {
    case "none":
      return "Select an instance to get started";
    case "instance":
      return "Select a database to explore schemas, extensions, and queries";
    default:
      return null;
  }
}

export type { NavLinkProps };
export { buildNavLinkProps, getNavForScope, getNextStepHint };
