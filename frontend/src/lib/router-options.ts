import type { AnyRouter, NavigateOptions } from "@tanstack/react-router";

interface NetworkNavigator extends Navigator {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
}

export function getDefaultPreload() {
  return false as const;
}

export function canPreloadRouteCode() {
  const network: NetworkNavigator | undefined =
    typeof navigator === "undefined" ? undefined : navigator;
  if (network?.onLine === false || network?.connection?.saveData === true) {
    return false;
  }
  switch (network?.connection?.effectiveType) {
    case "slow-2g":
    case "2g":
    case "3g":
      return false;
    case undefined:
    default:
      return true;
  }
}

export function getDefaultPreloadStaleTime() {
  return 0;
}

export function getDefaultViewTransition() {
  if (
    globalThis.window === undefined ||
    !globalThis.window.CSS?.supports(
      "selector(:active-view-transition-type(page-navigation))"
    )
  ) {
    return false;
  }

  return {
    types: ({ fromLocation, pathChanged }) =>
      fromLocation &&
      pathChanged &&
      !globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? ["page-navigation"]
        : false,
  } satisfies NonNullable<NavigateOptions<AnyRouter>["viewTransition"]>;
}
