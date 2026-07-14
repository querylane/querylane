"use client";

import { useNavigate } from "@tanstack/react-router";
import { useSidebar } from "@/components/querylane-ui/sidebar";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import {
  buildCanonicalAdminSearch,
  resolveCanonicalAdminPageTarget,
} from "@/lib/admin-navigation";
import type { AdminPageId } from "@/lib/admin-page";
import { useDb } from "@/lib/db-context";
import { handleNavigationResult } from "@/lib/navigation-errors";

function AdminKeyboardShortcuts() {
  const navigate = useNavigate();
  const { navigationIds } = useDb();
  const { toggleSidebar } = useSidebar();

  function navigateToPage(page: AdminPageId) {
    const target = resolveCanonicalAdminPageTarget({
      ids: navigationIds,
      page,
    });
    if (!target) {
      return;
    }
    handleNavigationResult(
      navigate({
        ...target,
        search: (previous) =>
          buildCanonicalAdminSearch(previous, { targetPage: page }),
      }),
      { area: `admin-keyboard-shortcuts.${page}` }
    );
  }

  useKeyboardShortcut("navigation.data-explorer", () =>
    navigateToPage("database.explorer")
  );
  useKeyboardShortcut("navigation.database-overview", () =>
    navigateToPage("database.overview")
  );
  useKeyboardShortcut("navigation.roles", () =>
    navigateToPage("instance.roles")
  );
  useKeyboardShortcut("navigation.extensions", () =>
    navigateToPage("database.extensions")
  );
  useKeyboardShortcut("navigation.configuration", () =>
    navigateToPage("instance.configuration")
  );
  useKeyboardShortcut("navigation.instance-overview", () =>
    navigateToPage("instance.overview")
  );
  useKeyboardShortcut("sidebar.toggle", toggleSidebar);

  return null;
}

export { AdminKeyboardShortcuts };
