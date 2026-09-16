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
