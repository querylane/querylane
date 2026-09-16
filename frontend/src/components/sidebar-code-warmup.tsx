import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ScopeLevel } from "@/lib/db-navigation";
import { logger } from "@/lib/diagnostics";
import { scheduleRouteCodeWarmup } from "@/lib/route-code-warmup";
import { getSidebarWarmupRouteIds } from "@/lib/sidebar-warmup-routes";
import { useSetupStore } from "@/stores/setup-store";

/** Lives in the lazy sidebar, not the startup bundle. Renders no UI or data. */
export function SidebarCodeWarmup({ scope }: { scope: ScopeLevel }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetching = useIsFetching();
  const ready = useSetupStore((state) => state.status === "ready");
  const { activeRouteId, isLoading } = useRouterState({
    select: (state) => ({
      activeRouteId: state.matches.at(-1)?.routeId ?? "",
      isLoading: state.isLoading,
    }),
  });

  useEffect(
    function warmSidebarCodeAfterStartup() {
      if (!ready || isLoading || fetching > 0) {
        return;
      }
      return scheduleRouteCodeWarmup({
        canWarm: () =>
          useSetupStore.getState().status === "ready" &&
          !router.state.isLoading &&
          queryClient.isFetching() === 0,
        onError: (error) =>
          logger.warn("Optional route code warmup failed", { error }),
        router,
        routes: getSidebarWarmupRouteIds(scope, activeRouteId).map(
          (id) => router.routesById[id]
        ),
      });
    },
    [activeRouteId, fetching, isLoading, queryClient, ready, router, scope]
  );

  return null;
}
