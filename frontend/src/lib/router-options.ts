import type { AnyRouter, NavigateOptions } from "@tanstack/react-router";

interface NetworkNavigator extends Navigator {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
}

// Router intent preloads can rerun active parent loaders with preload=false.
// Sidebar intent uses loadRouteChunk instead, never preloadRoute.
export function getDefaultPreload(): false {
  return false;
}

// Rechecked on each interaction; missing Network Information API is allowed.
export function canPreloadRouteCode(): boolean {
  const network: NetworkNavigator | undefined =
    typeof navigator === "undefined" ? undefined : navigator;
  if (network?.onLine === false || network?.connection?.saveData) {
    return false;
  }
  switch (network?.connection?.effectiveType) {
    case "slow-2g":
    case "2g":
    case "3g":
      return false;
    default:
      return true;
  }
}

export function getDefaultPreloadStaleTime(): number {
  return 0;
}

export function getDefaultViewTransition(): NonNullable<
  NavigateOptions<AnyRouter>["viewTransition"]
> {
  // Router skips the types callback on older implementations. Disable those
  // entirely so they cannot bypass the per-navigation motion preference.
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports(
      "selector(:active-view-transition-type(page-navigation))"
    )
  ) {
    return false;
  }

  return {
    types: ({ fromLocation, pathChanged }) =>
      fromLocation &&
      pathChanged &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? ["page-navigation"]
        : false,
  };
}
