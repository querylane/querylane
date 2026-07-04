/**
 * Resolves the admin shell scope from most specific to least specific.
 * Database routes outrank instance routes; missing route IDs mean no active scope.
 */
export function resolveScopeLevel(routeIds: {
  databaseId?: string;
  instanceId?: string;
}) {
  if (routeIds.databaseId) {
    return "database" as const;
  }
  if (routeIds.instanceId) {
    return "instance" as const;
  }
  return "none" as const;
}
