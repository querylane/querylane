import type { AnyRoute, AnyRouter } from "@tanstack/react-router";
import { logger } from "@/lib/diagnostics";
import { canPreloadRouteCode } from "@/lib/router-options";

/** Unlike preloadRoute, this cannot run guards or data loaders. */
export async function preloadRouteCode(
  router: Pick<AnyRouter, "loadRouteChunk">,
  route: AnyRoute
): Promise<void> {
  if (!canPreloadRouteCode()) {
    return;
  }
  try {
    await router.loadRouteChunk(route);
  } catch (error) {
    // Navigation still owns the visible route error/retry experience.
    logger.warn("Route code preload failed", { error, routeId: route.id });
  }
}
