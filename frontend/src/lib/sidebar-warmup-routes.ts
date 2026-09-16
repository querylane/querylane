import type { ScopeLevel } from "@/lib/db-navigation";
import type { FileRoutesById } from "@/routeTree.gen";

// Deliberately small allowlist. Explorer, grids, SQL and visualizations stay
// demand-loaded; warming every sidebar destination would undo code splitting.
const SIDEBAR_WARMUP_ROUTES = {
  database: [
    "/instances/$instanceId/databases/$databaseId/",
    "/instances/$instanceId/databases/$databaseId/extensions",
  ],
  instance: [
    "/instances/$instanceId/configuration",
    "/instances/$instanceId/roles/",
  ],
  none: [],
} as const satisfies Record<ScopeLevel, readonly (keyof FileRoutesById)[]>;

export function getSidebarWarmupRouteIds(
  scope: ScopeLevel,
  activeRouteId: string
) {
  return SIDEBAR_WARMUP_ROUTES[scope].filter((id) => id !== activeRouteId);
}
